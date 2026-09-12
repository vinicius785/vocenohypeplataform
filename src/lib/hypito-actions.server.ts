/**
 * Ações do Hypito (mutações) — SEMPRE em duas etapas (pedido, seção 3):
 * `prepare*` interpreta o pedido e grava um rascunho em
 * `hypito_pending_actions` (nunca escreve no dado real); `confirm*` só
 * executa depois que o PRÓPRIO usuário confirma essa linha específica —
 * a policy RLS de `hypito_pending_actions` já impede outra pessoa de
 * confirmar (USING/WITH CHECK `user_id = auth.uid()`), e a transição
 * condicional `status='pending' -> 'confirmed'` (`.eq("status","pending")`
 * no UPDATE) impede execução dupla em reenvio/duplo clique.
 *
 * Nenhuma tabela de tarefa tem hoje uma coluna de "criado por Hypito" —
 * fica registrado dentro do próprio `data` JSONB (`createdVia`,
 * `requestedBy`) e em `hypito_action_log` (auditoria consultável sem
 * depender de abrir a tarefa).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { assertCan, type UserAccess } from "@/lib/hypito-permissions.server";
import { resolvePersonByName } from "@/lib/hypito-tools.server";
import {
  extractAssigneeName,
  extractDateTime,
  extractedDateTimeToUtcMs,
  extractPriority,
  extractScopeName,
  extractTitle,
} from "@/lib/hypito-extract";

type DB = SupabaseClient<Database>;

const PENDING_ACTION_TTL_MS = 15 * 60_000;

export type TaskDraft = {
  title: string;
  assigneeName: string | null;
  assigneeId: string | null;
  scope: "projeto" | "campanha" | null;
  scopeId: string | null;
  scopeName: string | null;
  dueAtIso: string | null;
  priority: "Urgente" | "Alta" | "Normal" | "Baixa";
  warnings: string[];
};

async function resolveScope(
  db: DB,
  scope: "projeto" | "campanha",
  nameQuery: string,
): Promise<{ id: string; name: string } | null> {
  const table = scope === "projeto" ? "projetos" : "clientes";
  const { data, error } = await db.from(table).select("id, data");
  if (error) return null;
  const q = nameQuery.trim().toLowerCase();
  if (scope === "projeto") {
    const match = (data ?? []).find((row) =>
      ((row.data as { name?: string } | null)?.name ?? "").toLowerCase().includes(q),
    );
    return match
      ? { id: match.id, name: (match.data as { name?: string }).name ?? nameQuery }
      : null;
  }
  type RawCampanha = { id?: string; nome?: string };
  for (const row of data ?? []) {
    const campanhas = ((row.data as { campanhas?: RawCampanha[] } | null)?.campanhas ??
      []) as RawCampanha[];
    const match = campanhas.find((c) => (c.nome ?? "").toLowerCase().includes(q));
    if (match?.id) return { id: match.id, name: match.nome ?? nameQuery };
  }
  return null;
}

/** Interpreta o texto e grava um rascunho — NUNCA cria a tarefa de
 * verdade aqui. Ambiguidade/erro viram `warnings` no rascunho, exibidas
 * no card de confirmação, nunca decididas sozinhas. */
export async function prepareTaskCreation(
  db: DB,
  access: UserAccess,
  requesterId: string,
  rawText: string,
): Promise<{ pendingActionId: string; draft: TaskDraft }> {
  assertCan(access, "projetos");
  const warnings: string[] = [];

  const assigneeName = extractAssigneeName(rawText);
  let assigneeId: string | null = null;
  if (assigneeName) {
    const person = await resolvePersonByName(db, assigneeName);
    if (person === "ambiguous") {
      warnings.push(
        `Existe mais de uma pessoa chamada "${assigneeName}" — informe o nome completo.`,
      );
    } else if (!person) {
      warnings.push(`Não encontrei "${assigneeName}" no time.`);
    } else {
      assigneeId = person.id;
    }
  }

  const scopeMatch = extractScopeName(rawText);
  let scopeId: string | null = null;
  let scopeName: string | null = null;
  if (scopeMatch) {
    if (scopeMatch.scope === "campanha") assertCan(access, "campanhas");
    const resolved = await resolveScope(db, scopeMatch.scope, scopeMatch.name);
    if (!resolved) {
      warnings.push(
        `Não encontrei ${scopeMatch.scope === "projeto" ? "o projeto" : "a campanha"} "${scopeMatch.name}".`,
      );
    } else {
      scopeId = resolved.id;
      scopeName = resolved.name;
    }
  }

  const dt = extractDateTime(rawText);
  const dueAtIso = dt ? new Date(extractedDateTimeToUtcMs(dt)).toISOString() : null;
  if (rawText.match(/\bàs?\s*\d/) && !dt) {
    warnings.push("Não consegui entender o horário informado — confira antes de confirmar.");
  }

  const draft: TaskDraft = {
    title: extractTitle(rawText),
    assigneeName,
    assigneeId,
    scope: scopeMatch?.scope ?? null,
    scopeId,
    scopeName,
    dueAtIso,
    priority: extractPriority(rawText) ?? "Normal",
    warnings,
  };

  const { data: inserted, error } = await db
    .from("hypito_pending_actions")
    .insert({
      user_id: requesterId,
      kind: "create_task",
      payload: draft as unknown as never,
      expires_at: new Date(Date.now() + PENDING_ACTION_TTL_MS).toISOString(),
    })
    .select("id")
    .single();
  if (error || !inserted) throw new Error(error?.message ?? "falha ao preparar tarefa");

  return { pendingActionId: inserted.id, draft };
}

export type ConfirmResult =
  | { ok: true; alreadyDone: boolean; taskId: string; link: string }
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
  if (error || !pending) return { ok: false, error: "Ação não encontrada." };

  if (pending.status === "confirmed" && pending.result) {
    const result = pending.result as { taskId?: string; link?: string };
    if (result.taskId && result.link) {
      return { ok: true, alreadyDone: true, taskId: result.taskId, link: result.link };
    }
  }
  if (pending.status !== "pending") {
    return { ok: false, error: "Esta ação já foi confirmada, cancelada ou expirou." };
  }
  if (new Date(pending.expires_at).getTime() < Date.now()) {
    await db.from("hypito_pending_actions").update({ status: "expired" }).eq("id", pendingActionId);
    return { ok: false, error: "Essa confirmação expirou — peça novamente." };
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
    return { ok: false, error: "Esta ação já foi processada." };
  }

  try {
    if (pending.kind === "create_task") {
      const draft = pending.payload as unknown as TaskDraft;
      if (!draft.scope || !draft.scopeId) {
        throw new Error("Escolha um projeto ou campanha antes de confirmar.");
      }
      // Revalida (dado pode ter mudado entre o preparo e a confirmação —
      // pedido: "invalidar se os dados de origem mudarem").
      const stillExists = await resolveScope(db, draft.scope, draft.scopeName ?? "");
      if (!stillExists || stillExists.id !== draft.scopeId) {
        throw new Error("O projeto/campanha desta tarefa não existe mais.");
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
      };
      const insertError =
        draft.scope === "projeto"
          ? (
              await db
                .from("projeto_tarefas")
                .insert({ id, projeto_id: draft.scopeId, data: taskData as unknown as never })
            ).error
          : (
              await db
                .from("campanha_tarefas")
                .insert({ id, campanha_id: draft.scopeId, data: taskData as unknown as never })
            ).error;
      if (insertError) throw new Error(insertError.message);

      const link =
        draft.scope === "projeto"
          ? `/projeto/${draft.scopeId}?taskId=${id}`
          : `/time?section=campanhas`;
      await db
        .from("hypito_pending_actions")
        .update({ result: { taskId: id, link } })
        .eq("id", pendingActionId);
      await db.from("hypito_action_log").insert({
        user_id: requesterId,
        kind: "create_task",
        target_kind: draft.scope,
        target_id: id,
        detail: { title: draft.title, scopeId: draft.scopeId, viaHypito: true } as unknown as never,
      });
      return { ok: true, alreadyDone: false, taskId: id, link };
    }

    if (pending.kind === "create_reminder") {
      const draft = pending.payload as unknown as ReminderDraft;
      if (!draft.remindAtIso) throw new Error("Não entendi quando você quer ser avisado.");
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
      if (insertError || !reminder)
        throw new Error(insertError?.message ?? "falha ao criar lembrete");

      const link = "/time?section=chat";
      await db
        .from("hypito_pending_actions")
        .update({ result: { taskId: reminder.id, link } })
        .eq("id", pendingActionId);
      await db.from("hypito_action_log").insert({
        user_id: requesterId,
        kind: "create_reminder",
        target_kind: "reminder",
        target_id: reminder.id,
        detail: { title: draft.title, remindAtIso: draft.remindAtIso } as unknown as never,
      });
      return { ok: true, alreadyDone: false, taskId: reminder.id, link };
    }

    throw new Error("Tipo de ação desconhecido.");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .from("hypito_pending_actions")
      .update({ status: "expired", result: { error: message } as unknown as never })
      .eq("id", pendingActionId);
    return { ok: false, error: message };
  }
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

export type ReminderDraft = {
  title: string;
  remindAtIso: string | null;
  relatedKind: "task" | "project" | "campaign" | "meeting" | "none";
  relatedId: string | null;
  relatedLink: string | null;
  warnings: string[];
};

export async function prepareReminderCreation(
  db: DB,
  requesterId: string,
  rawText: string,
): Promise<{ pendingActionId: string; draft: ReminderDraft }> {
  const warnings: string[] = [];
  const dt = extractDateTime(rawText);
  const remindAtIso = dt ? new Date(extractedDateTimeToUtcMs(dt)).toISOString() : null;
  if (!dt) warnings.push("Não entendi quando você quer ser avisado — informe dia e horário.");

  const draft: ReminderDraft = {
    title: extractTitle(rawText),
    remindAtIso,
    relatedKind: "none",
    relatedId: null,
    relatedLink: null,
    warnings,
  };

  const { data: inserted, error } = await db
    .from("hypito_pending_actions")
    .insert({
      user_id: requesterId,
      kind: "create_reminder",
      payload: draft as unknown as never,
      expires_at: new Date(Date.now() + PENDING_ACTION_TTL_MS).toISOString(),
    })
    .select("id")
    .single();
  if (error || !inserted) throw new Error(error?.message ?? "falha ao preparar lembrete");

  return { pendingActionId: inserted.id, draft };
}
