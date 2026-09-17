import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import {
  TASK_BLOCK_CATEGORIES,
  isValidTaskBlockCategory,
  isValidBlockReason,
  resolvePausesDeadline,
  computeEligibleBlockDurationMs,
  computeEffectivePerformanceDueDate,
} from "@/lib/task-blocks-rules";
import { effectivePerformanceDueDate } from "@/lib/performance-engine";
import type { TaskBlockedState } from "@/lib/projetos";

/**
 * Toda a lógica de decisão (categoria válida, `pausesDeadline`, prazo
 * efetivo) roda AQUI, no server function — as RPCs `apply_task_block`/
 * `resolve_task_block` (`supabase/migrations/20260916203000_task_blocks.sql`)
 * só validam permissão/estado e escrevem os valores já calculados, numa
 * única transação (tabela `task_blocks` + a linha jsonb da tarefa).
 * Chamado imediatamente na confirmação do questionário — nunca espera o
 * "Salvar" do `TaskDialog` (esse é o caminho de persistência de todo o
 * resto da tarefa, mas não serve pro bloqueio: teria que esperar o
 * usuário salvar a tarefa inteira pra o bloqueio "valer", e um erro no
 * meio do save() deixaria a tarefa parcialmente bloqueada).
 */

const TaskScopeEnum = z.enum(["projeto", "campanha", "marketing"]);

/**
 * Enquanto uma tarefa está bloqueada com pausa elegível, `performanceDueDate`
 * recebe esta data-sentinela (bem no futuro) em vez de qualquer cálculo —
 * congela na hora o relógio de atraso (Score/health comparam sempre
 * contra "agora") sem precisar alterar nenhuma fórmula existente em
 * `performance-engine.ts`. Ao resolver, o valor real é recalculado a
 * partir do histórico de replanejamento + duração elegível acumulada dos
 * bloqueios (`computeEffectivePerformanceDueDate`) e substitui a
 * sentinela.
 */
function pausedSentinelDueDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 3650);
  return d.toISOString().slice(0, 10);
}

const BlockTaskInput = z.object({
  taskId: z.string().uuid(),
  taskScope: TaskScopeEnum,
  category: z.enum(TASK_BLOCK_CATEGORIES as [string, ...string[]]),
  reason: z.string().trim().min(10).max(2000),
  affectedAssigneeId: z.string().uuid().optional(),
  affectedAssigneeName: z.string().trim().max(200).optional(),
  responsibleForUnblockingUserId: z.string().uuid().optional(),
  responsibleForUnblockingName: z.string().trim().max(200).optional(),
  relatedTaskId: z.string().uuid().optional(),
  relatedTaskTitle: z.string().trim().max(300).optional(),
  relatedEntityType: z.string().trim().max(60).optional(),
  relatedEntityId: z.string().trim().max(200).optional(),
  requiredAction: z.string().trim().max(1000).optional(),
  expectedResolutionAt: z.string().datetime().optional(),
  /** Referência atual de performance (`performanceDueDate ?? originalDueDate
   * ?? dueDate`), enviada pelo cliente só pra decidir se há algo a
   * congelar — nunca usada como valor final sem revalidação (o "de onde
   * viemos" real, pra recalcular no resolve, é sempre recomputado a
   * partir de `originalDueDate`/`deadlineHistory`, nunca confiado do
   * cliente). */
  currentPerformanceDueDate: z.string().optional(),
  pauseOverride: z
    .object({ enable: z.boolean(), reason: z.string().trim().min(10).max(1000) })
    .optional(),
});

export const blockTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => BlockTaskInput.parse(raw))
  .handler(async ({ data, context }) => {
    if (!isValidTaskBlockCategory(data.category)) {
      throw new Error("Categoria de bloqueio inválida.");
    }
    if (!isValidBlockReason(data.reason)) {
      throw new Error("Descreva o motivo do bloqueio com mais detalhe (mínimo 10 caracteres).");
    }

    // Só quem já tem permissão de módulo (checada de novo dentro da RPC,
    // via `has_permission`/`is_admin`) pode registrar um override de
    // pausa — a checagem aqui é só pra montar o payload certo; a RPC é
    // que efetivamente barra quem não tem permissão.
    const canOverride = data.pauseOverride?.enable === true && !!data.pauseOverride.reason.trim();
    const pausesDeadline = resolvePausesDeadline(
      data.category as TaskBlockedState["category"],
      canOverride,
      canOverride
        ? { approvedByUserId: context.userId, reason: data.pauseOverride!.reason }
        : undefined,
    );

    const { data: me } = await context.supabase
      .from("profiles")
      .select("full_name")
      .eq("id", context.userId)
      .maybeSingle();
    const blockedByName = me?.full_name?.trim() || "Alguém do time";

    const blockedAtISO = new Date().toISOString();

    const blockedState: TaskBlockedState = {
      blockId: "", // preenchido depois do insert (a RPC devolve o id)
      category: data.category as TaskBlockedState["category"],
      reason: data.reason,
      blockedAt: blockedAtISO,
      blockedByUserId: context.userId,
      blockedByName,
      affectedAssigneeId: data.affectedAssigneeId,
      responsibleForUnblockingUserId: data.responsibleForUnblockingUserId,
      responsibleForUnblockingName: data.responsibleForUnblockingName,
      relatedTaskId: data.relatedTaskId,
      relatedTaskTitle: data.relatedTaskTitle,
      relatedEntityType: data.relatedEntityType,
      relatedEntityId: data.relatedEntityId,
      requiredAction: data.requiredAction,
      expectedResolutionAt: data.expectedResolutionAt,
      pausesDeadline,
    };

    const activityEntry = {
      id: crypto.randomUUID(),
      author: blockedByName,
      initials: initialsOf(blockedByName),
      color: "bg-amber-600 text-white",
      action: "bloqueou esta tarefa",
      createdAt: blockedAtISO,
      kind: "blocked",
      meta: {
        category: data.category,
        reason: data.reason,
        responsibleForUnblockingName: data.responsibleForUnblockingName,
        requiredAction: data.requiredAction,
        expectedResolutionAt: data.expectedResolutionAt,
        pausesDeadline,
      },
    };

    const performanceDueDate = pausesDeadline
      ? pausedSentinelDueDate()
      : (data.currentPerformanceDueDate ?? undefined);

    // O gerador de tipos do Supabase colapsa parâmetros SQL opcionais
    // pra `string` não-nula (limitação conhecida do introspector — não
    // reflete a real assinatura, que aceita null em todos os `p_*`
    // opcionais) — `as never` só neste único call site, runtime já
    // validado manualmente contra a migration.
    const { data: blockId, error } = await context.supabase.rpc("apply_task_block", {
      p_task_id: data.taskId,
      p_task_scope: data.taskScope,
      p_category: data.category,
      p_reason: data.reason,
      p_affected_assignee_id: data.affectedAssigneeId ?? null,
      p_responsible_for_unblocking_user_id: data.responsibleForUnblockingUserId ?? null,
      p_related_task_id: data.relatedTaskId ?? null,
      p_related_entity_type: data.relatedEntityType ?? null,
      p_related_entity_id: data.relatedEntityId ?? null,
      p_required_action: data.requiredAction ?? null,
      p_expected_resolution_at: data.expectedResolutionAt ?? null,
      p_pauses_deadline: pausesDeadline,
      p_pause_approved_by_user_id: canOverride ? context.userId : null,
      p_pause_override_reason: canOverride ? data.pauseOverride!.reason : null,
      p_blocked_state: { ...blockedState, blockId: "pending" },
      p_activity_entry: activityEntry,
      p_performance_due_date: performanceDueDate ?? null,
    } as never);
    if (error) throw new Error(error.message);

    const finalBlockedState: TaskBlockedState = { ...blockedState, blockId: blockId as string };
    // Corrige o `blockId` real na própria tarefa (a RPC não sabia o id
    // ainda no momento de montar `blockedState` — só depois do INSERT).
    // Simplificação consciente: como é só um campo de cache
    // denormalizado (a fonte de verdade é a linha em `task_blocks`,
    // já com o id certo desde o INSERT), corrigir aqui é best-effort;
    // se falhar, a linha da tarefa fica com um placeholder até o
    // próximo bloqueio/resolução recalcular — nunca afeta a tabela
    // `task_blocks` em si.
    await context.supabase
      .from(tableForScope(data.taskScope))
      .update({ data: { blockedState: finalBlockedState } })
      .eq("id", data.taskId);

    void notifyBlockCreated({
      supabase: context.supabase,
      taskScope: data.taskScope,
      taskId: data.taskId,
      taskTitle: data.relatedTaskTitle ?? "",
      affectedAssigneeId: data.affectedAssigneeId,
      responsibleForUnblockingUserId: data.responsibleForUnblockingUserId,
      requiredAction: data.requiredAction,
      expectedResolutionAt: data.expectedResolutionAt,
      pausesDeadline,
    });

    return {
      blockId: blockId as string,
      blockedState: finalBlockedState,
      activity: activityEntry,
      performanceDueDate: performanceDueDate ?? null,
    };
  });

const ResolveBlockInput = z.object({
  blockId: z.string().uuid(),
  taskId: z.string().uuid(),
  taskScope: TaskScopeEnum,
  resolutionNote: z.string().trim().min(5).max(2000),
  newStatus: z.string().trim().min(1),
  originalDueDate: z.string().optional(),
  deadlineHistory: z
    .array(
      z.object({
        to: z.string().optional(),
        isCritical: z.boolean(),
        exemptFromResponsibility: z.boolean(),
        adminOverride: z.object({ exempted: z.boolean() }).optional(),
      }),
    )
    .default([]),
  stillActiveOtherBlocks: z
    .array(
      z.object({
        pausesDeadline: z.boolean(),
        blockedAt: z.string(),
        unblockedAt: z.string().optional(),
      }),
    )
    .default([]),
  thisBlockPausesDeadline: z.boolean(),
  thisBlockBlockedAt: z.string(),
});

export const resolveTaskBlock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => ResolveBlockInput.parse(raw))
  .handler(async ({ data, context }) => {
    if (!data.resolutionNote.trim()) {
      throw new Error("Descreva o que foi feito pra resolver o bloqueio.");
    }

    const nowISO = new Date().toISOString();
    const baseRef = effectivePerformanceDueDate(data.originalDueDate, data.deadlineHistory);
    const eligibleMs = computeEligibleBlockDurationMs(
      [
        ...data.stillActiveOtherBlocks,
        {
          pausesDeadline: data.thisBlockPausesDeadline,
          blockedAt: data.thisBlockBlockedAt,
          unblockedAt: nowISO,
        },
      ],
      nowISO,
    );
    const newPerformanceDueDate = computeEffectivePerformanceDueDate(baseRef, eligibleMs);

    const stillBlocked = data.stillActiveOtherBlocks.length > 0;

    const { data: me } = await context.supabase
      .from("profiles")
      .select("full_name")
      .eq("id", context.userId)
      .maybeSingle();
    const resolverName = me?.full_name?.trim() || "Alguém do time";

    // Com mais de um bloqueio ativo, o cache denormalizado da tarefa
    // (`blockedState`) precisa continuar refletindo ALGUM bloqueio ainda
    // ativo — busca o mais antigo restante pra manter o banner/card
    // mostrando um impedimento real, nunca o que acabou de ser resolvido.
    let nextBlockedState: unknown = null;
    if (stillBlocked) {
      const { data: otherActive } = await context.supabase
        .from("task_blocks")
        .select("*")
        .eq("task_id", data.taskId)
        .eq("status", "ativo")
        .neq("id", data.blockId)
        .order("blocked_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (otherActive) {
        nextBlockedState = {
          blockId: otherActive.id,
          category: otherActive.category,
          reason: otherActive.reason,
          blockedAt: otherActive.blocked_at,
          blockedByUserId: otherActive.blocked_by_user_id,
          blockedByName: resolverName,
          affectedAssigneeId: otherActive.affected_assignee_id ?? undefined,
          responsibleForUnblockingUserId:
            otherActive.responsible_for_unblocking_user_id ?? undefined,
          relatedTaskId: otherActive.related_task_id ?? undefined,
          relatedEntityType: otherActive.related_entity_type ?? undefined,
          relatedEntityId: otherActive.related_entity_id ?? undefined,
          requiredAction: otherActive.required_action ?? undefined,
          expectedResolutionAt: otherActive.expected_resolution_at ?? undefined,
          pausesDeadline: otherActive.pauses_deadline,
        };
      }
    }

    const activityEntry = {
      id: crypto.randomUUID(),
      author: resolverName,
      initials: initialsOf(resolverName),
      color: "bg-emerald-600 text-white",
      action: "resolveu o bloqueio desta tarefa",
      createdAt: nowISO,
      kind: "unblocked",
      meta: {
        resolutionNote: data.resolutionNote,
        newStatus: stillBlocked ? "Bloqueada" : data.newStatus,
        performanceDueDate: newPerformanceDueDate ?? null,
        blockedAt: data.thisBlockBlockedAt,
        resolvedAt: nowISO,
      },
    };

    const { error } = await context.supabase.rpc("resolve_task_block", {
      p_block_id: data.blockId,
      p_resolution_note: data.resolutionNote,
      p_new_status: stillBlocked ? "Bloqueada" : data.newStatus,
      p_performance_due_date: newPerformanceDueDate ?? null,
      p_activity_entry: activityEntry,
      p_next_blocked_state: nextBlockedState,
    } as never);
    if (error) throw new Error(error.message);

    return {
      activity: activityEntry,
      performanceDueDate: newPerformanceDueDate ?? null,
      newStatus: stillBlocked ? "Bloqueada" : data.newStatus,
      stillBlocked,
      blockedState: nextBlockedState as TaskBlockedState | null,
    };
  });

function tableForScope(scope: "projeto" | "campanha" | "marketing") {
  if (scope === "projeto") return "projeto_tarefas";
  if (scope === "campanha") return "campanha_tarefas";
  return "marketing_standalone_tasks";
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Best-effort: avisa (push) o responsável afetado e quem precisa
 * desbloquear — nunca bloqueia/falha a operação principal (mesmo padrão
 * de `notifyNewAssignees` em `TaskBoard.tsx`). */
async function notifyBlockCreated(params: {
  supabase: unknown;
  taskScope: string;
  taskId: string;
  taskTitle: string;
  affectedAssigneeId?: string;
  responsibleForUnblockingUserId?: string;
  requiredAction?: string;
  expectedResolutionAt?: string;
  pausesDeadline: boolean;
}) {
  try {
    const { deliverPush } = await import("@/lib/push.functions");
    const url = `/time?section=${params.taskScope === "campanha" ? "campanhas" : "projetos"}`;
    if (params.affectedAssigneeId) {
      await deliverPush([params.affectedAssigneeId], {
        title: "Tarefa bloqueada",
        body: params.pausesDeadline
          ? "Sua tarefa foi bloqueada e o prazo está pausado a partir de agora."
          : "Sua tarefa foi marcada como bloqueada.",
        url,
      });
    }
    if (
      params.responsibleForUnblockingUserId &&
      params.responsibleForUnblockingUserId !== params.affectedAssigneeId
    ) {
      await deliverPush([params.responsibleForUnblockingUserId], {
        title: "Uma tarefa depende de você",
        body: params.requiredAction || "Uma tarefa do time está aguardando uma ação sua.",
        url,
      });
    }
  } catch (err) {
    console.warn("[task-blocks] push notification failed", err);
  }
}
