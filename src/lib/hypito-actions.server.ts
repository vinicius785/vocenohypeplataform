/**
 * Persistência e execução de ações do Hypito — SEMPRE em duas etapas
 * (pedido, seção 3): `createPendingAction` grava um rascunho JÁ
 * completo (título resolvido, entidades resolvidas) em
 * `hypito_pending_actions`; `confirmPendingAction` só executa depois que
 * o PRÓPRIO usuário confirma essa linha específica — a policy RLS
 * (`user_id = auth.uid()`) já impede outra pessoa de confirmar, e a
 * transição condicional `status='pending' -> 'confirmed'` impede
 * execução dupla em reenvio/duplo clique.
 *
 * Extração de texto (`hypito-extract.ts`) e resolução de entidades
 * (`hypito-tools.server.ts`) acontecem ANTES de chegar aqui, orquestradas
 * por `hypito-conversation.server.ts` — este arquivo só persiste/executa,
 * nunca interpreta linguagem natural.
 *
 * Nenhuma tabela de tarefa tem hoje uma coluna de "criado por Hypito" —
 * fica registrado dentro do próprio `data` JSONB (`createdVia`,
 * `requestedBy`) e em `hypito_action_log` (auditoria consultável sem
 * depender de abrir a tarefa).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { HypitoError } from "@/lib/hypito-errors";
import { assertCan, type UserAccess } from "@/lib/hypito-permissions.server";

type DB = SupabaseClient<Database>;

const PENDING_ACTION_TTL_MS = 15 * 60_000;

export type TaskDraft = {
  title: string;
  assigneeName: string | null;
  assigneeId: string | null;
  /** `true` quando `assigneeId` é um default sugerido (o próprio
   * solicitante), não um nome dado explicitamente — só informativo pro
   * log de auditoria, não muda a persistência. */
  assigneeIsRequester?: boolean;
  scope: "projeto" | "campanha" | null;
  scopeId: string | null;
  scopeName: string | null;
  dueAtIso: string | null;
  priority: "Urgente" | "Alta" | "Normal" | "Baixa";
  /** Presente só quando a tarefa nasceu de uma mensagem do chat (pedido,
   * seção 5) — gravado dentro do JSON da tarefa (`createdFrom`), nunca
   * inventado quando a origem foi uma conversa digitada direto. */
  sourceMessage?: {
    messageId: string;
    convoId: string;
    channelName: string;
    authorName: string;
    excerpt: string;
    createdAtIso: string;
  } | null;
};

export type ReminderDraft = {
  title: string;
  remindAtIso: string;
  relatedKind: "task" | "project" | "campaign" | "meeting" | "none";
  relatedId: string | null;
  relatedLink: string | null;
};

async function resolveScopeStillValid(
  db: DB,
  scope: "projeto" | "campanha",
  scopeId: string,
): Promise<boolean> {
  const table = scope === "projeto" ? "projetos" : "clientes";
  if (scope === "projeto") {
    const { data } = await db.from(table).select("id").eq("id", scopeId).maybeSingle();
    return Boolean(data);
  }
  // Campanha vive dentro do JSONB de `clientes` — confirma percorrendo,
  // já que não há uma linha própria por campanha nessa tabela.
  const { data } = await db.from("clientes").select("data");
  type RawCampanha = { id?: string };
  return (data ?? []).some((row) =>
    ((row.data as { campanhas?: RawCampanha[] } | null)?.campanhas ?? []).some(
      (c) => c.id === scopeId,
    ),
  );
}

export async function createPendingAction(
  db: DB,
  userId: string,
  kind: "create_task" | "create_reminder",
  payload: TaskDraft | ReminderDraft,
): Promise<string> {
  const { data, error } = await db
    .from("hypito_pending_actions")
    .insert({
      user_id: userId,
      kind,
      payload: payload as unknown as never,
      expires_at: new Date(Date.now() + PENDING_ACTION_TTL_MS).toISOString(),
    })
    .select("id")
    .single();
  if (error || !data) {
    throw new HypitoError("persistence_unavailable");
  }
  return data.id;
}

/** Ação pendente ainda em aberto pra este usuário — usada pra restaurar
 * o card de confirmação quando a conversa é reaberta/a página é
 * recarregada (pedido, seção 16: "atualização da página no meio de uma
 * ação"), em vez de depender só do estado efêmero do componente React. */
export async function getActivePendingAction(
  db: DB,
  userId: string,
): Promise<{ id: string; kind: string; payload: TaskDraft | ReminderDraft } | null> {
  const { data } = await db
    .from("hypito_pending_actions")
    .select("id, kind, payload, expires_at")
    .eq("user_id", userId)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  if (new Date(data.expires_at).getTime() < Date.now()) return null;
  return {
    id: data.id,
    kind: data.kind,
    payload: data.payload as unknown as TaskDraft | ReminderDraft,
  };
}

export type ConfirmResult =
  | {
      ok: true;
      alreadyDone: boolean;
      kind: "create_task" | "create_reminder";
      taskId: string;
      title: string;
      /** Nunca uma rota — só o suficiente pra quem monta o card
       * (`hypito-chat.functions.ts`) construir uma `HypitoEntityRef` real
       * (a navegação de verdade é decidida pelo frontend, nunca por uma
       * URL vinda daqui). `null`/`null` = tarefa sem campanha/projeto. */
      scope: "projeto" | "campanha" | null;
      scopeId: string | null;
      scopeName: string | null;
      assigneeName: string | null;
      assigneeIsRequester: boolean;
      dueAtIso: string | null;
      priority: "Urgente" | "Alta" | "Normal" | "Baixa";
      sourceMessage?: TaskDraft["sourceMessage"];
    }
  | { ok: false; error: string };

export async function confirmPendingAction(
  db: DB,
  access: UserAccess,
  requesterId: string,
  pendingActionId: string,
): Promise<ConfirmResult> {
  const { data: pending, error } = await db
    .from("hypito_pending_actions")
    .select("*")
    .eq("id", pendingActionId)
    .eq("user_id", requesterId)
    .maybeSingle();
  if (error || !pending) {
    return { ok: false, error: new HypitoError("action_not_found").message };
  }

  if (pending.status === "confirmed" && pending.result) {
    const result = pending.result as (ConfirmResult & { ok: true }) | null;
    if (result?.taskId) {
      return { ...result, alreadyDone: true };
    }
  }
  if (pending.status !== "pending") {
    return { ok: false, error: new HypitoError("action_already_resolved").message };
  }
  if (new Date(pending.expires_at).getTime() < Date.now()) {
    await db.from("hypito_pending_actions").update({ status: "expired" }).eq("id", pendingActionId);
    return { ok: false, error: new HypitoError("action_expired").message };
  }

  // Transição condicional: só UMA chamada concorrente consegue passar de
  // "pending" pra "confirmed" (evita execução dupla em reenvio/duplo clique).
  const { data: claimed, error: claimError } = await db
    .from("hypito_pending_actions")
    .update({ status: "confirmed", resolved_at: new Date().toISOString() })
    .eq("id", pendingActionId)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (claimError || !claimed) {
    return { ok: false, error: new HypitoError("action_already_resolved").message };
  }

  try {
    if (pending.kind === "create_task") {
      const draft = pending.payload as unknown as TaskDraft;
      if (!draft.title) throw new HypitoError("missing_field", "Falta o título da tarefa.");
      // Revalida permissão NO MOMENTO da confirmação, não só quando o
      // rascunho foi preparado (pedido, seção 12: "deve respeitar as
      // permissões atuais no momento da confirmação").
      assertCan(access, draft.scope === "campanha" ? "campanhas" : "projetos");
      if (draft.scope && draft.scopeId) {
        // Revalida (dado pode ter mudado entre o preparo e a confirmação
        // — pedido: "invalidar se os dados de origem mudarem").
        const stillValid = await resolveScopeStillValid(db, draft.scope, draft.scopeId);
        if (!stillValid) {
          throw new HypitoError(
            "entity_not_found",
            "O projeto/campanha desta tarefa não existe mais.",
          );
        }
      }
      const id = crypto.randomUUID();
      const taskData = {
        id,
        title: draft.title,
        status: "Aberto",
        priority: draft.priority,
        dueDate: draft.dueAtIso ?? undefined,
        assignees: draft.assigneeName ? [draft.assigneeName] : [],
        createdAt: new Date().toISOString(),
        createdVia: "hypito",
        requestedBy: requesterId,
        createdFrom: draft.sourceMessage ?? undefined,
      };
      let insertError: { message: string } | null = null;
      if (draft.scope === "projeto" && draft.scopeId) {
        insertError = (
          await db
            .from("projeto_tarefas")
            .insert({ id, projeto_id: draft.scopeId, data: taskData as unknown as never })
        ).error;
      } else if (draft.scope === "campanha" && draft.scopeId) {
        insertError = (
          await db
            .from("campanha_tarefas")
            .insert({ id, campanha_id: draft.scopeId, data: taskData as unknown as never })
        ).error;
      } else {
        insertError = (
          await db
            .from("marketing_standalone_tasks")
            .insert({ id, data: taskData as unknown as never })
        ).error;
      }
      if (insertError) throw new HypitoError("persistence_unavailable");

      const result: ConfirmResult = {
        ok: true,
        alreadyDone: false,
        kind: "create_task",
        taskId: id,
        title: draft.title,
        scope: draft.scope,
        scopeId: draft.scopeId,
        scopeName: draft.scopeName,
        assigneeName: draft.assigneeName,
        assigneeIsRequester: draft.assigneeIsRequester ?? false,
        dueAtIso: draft.dueAtIso,
        priority: draft.priority,
        sourceMessage: draft.sourceMessage ?? undefined,
      };
      await db
        .from("hypito_pending_actions")
        .update({ result: result as unknown as never })
        .eq("id", pendingActionId);
      await db.from("hypito_action_log").insert({
        user_id: requesterId,
        kind: "create_task",
        target_kind: draft.scope ?? "marketing",
        target_id: id,
        detail: { title: draft.title, scopeId: draft.scopeId, viaHypito: true } as unknown as never,
      });
      return result;
    }

    if (pending.kind === "create_reminder") {
      const draft = pending.payload as unknown as ReminderDraft;
      if (!draft.remindAtIso)
        throw new HypitoError("missing_field", "Falta o horário do lembrete.");
      const { data: reminder, error: insertError } = await db
        .from("hypito_reminders")
        .insert({
          user_id: requesterId,
          title: draft.title,
          remind_at: draft.remindAtIso,
          related_kind: draft.relatedKind ?? "none",
          related_id: draft.relatedId ?? null,
          related_link: draft.relatedLink ?? null,
          created_by: requesterId,
        })
        .select("id")
        .single();
      if (insertError || !reminder) throw new HypitoError("persistence_unavailable");

      const result: ConfirmResult = {
        ok: true,
        alreadyDone: false,
        kind: "create_reminder",
        taskId: reminder.id,
        title: draft.title,
        scope: null,
        scopeId: null,
        scopeName: null,
        assigneeName: null,
        assigneeIsRequester: false,
        dueAtIso: draft.remindAtIso,
        priority: "Normal",
      };
      await db
        .from("hypito_pending_actions")
        .update({ result: result as unknown as never })
        .eq("id", pendingActionId);
      await db.from("hypito_action_log").insert({
        user_id: requesterId,
        kind: "create_reminder",
        target_kind: "reminder",
        target_id: reminder.id,
        detail: { title: draft.title, remindAtIso: draft.remindAtIso } as unknown as never,
      });
      return result;
    }

    throw new HypitoError("unknown");
  } catch (err) {
    const message = err instanceof HypitoError ? err.message : new HypitoError("unknown").message;
    if (!(err instanceof HypitoError)) {
      console.error("[hypito:confirmPendingAction]", err);
    }
    await db.from("hypito_pending_actions").update({ status: "expired" }).eq("id", pendingActionId);
    return { ok: false, error: message };
  }
}

/** "Concluir" no alerta de tarefas atrasadas (pedido, seção 2) — o clique
 * no botão nomeado já É a confirmação explícita exigida (não abre um
 * segundo questionário pra uma ação de um único campo, já claramente
 * rotulada). Revalida permissão E localiza a linha real antes de gravar —
 * nunca confia no `scope`/`scopeId` informado sem checar que a tarefa
 * realmente está lá. Não escreve no `activity[]` visual da tarefa (isso
 * exigiria replicar o formato de `Activity` de `TaskBoard.tsx`, um
 * componente client-side grande demais pra importar aqui) — fica só
 * registrado em `hypito_action_log`, mesma auditoria de toda ação do
 * Hypito (limitação documentada, não um descuido). */
export async function completeTaskFromAlert(
  db: DB,
  access: UserAccess,
  requesterId: string,
  task: { id: string; scope: "projeto" | "campanha" | "marketing" | null; scopeId?: string | null },
): Promise<{ ok: true } | { ok: false; error: string }> {
  assertCan(access, task.scope === "campanha" ? "campanhas" : "projetos");
  const table =
    task.scope === "projeto"
      ? "projeto_tarefas"
      : task.scope === "campanha"
        ? "campanha_tarefas"
        : "marketing_standalone_tasks";
  const { data: row, error: fetchError } = await db
    .from(table)
    .select("id, data")
    .eq("id", task.id)
    .maybeSingle();
  if (fetchError || !row) return { ok: false, error: new HypitoError("entity_not_found").message };
  const data = { ...(row.data as Record<string, unknown>) };
  data.status = "Concluído";
  data.completedAt = new Date().toISOString();
  const { error: updateError } = await db
    .from(table)
    .update({ data: data as unknown as never })
    .eq("id", task.id);
  if (updateError) return { ok: false, error: new HypitoError("persistence_unavailable").message };
  await db.from("hypito_action_log").insert({
    user_id: requesterId,
    kind: "complete_task_from_alert",
    target_kind: task.scope ?? "marketing",
    target_id: task.id,
    detail: { viaHypito: true } as unknown as never,
  });
  return { ok: true };
}

export async function cancelPendingAction(
  db: DB,
  requesterId: string,
  pendingActionId: string,
): Promise<{ ok: true }> {
  await db
    .from("hypito_pending_actions")
    .update({ status: "cancelled", resolved_at: new Date().toISOString() })
    .eq("id", pendingActionId)
    .eq("user_id", requesterId)
    .eq("status", "pending");
  return { ok: true };
}
