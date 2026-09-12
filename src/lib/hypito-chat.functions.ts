/**
 * Server functions do lado do cliente pra conversar com o Hypito —
 * `createServerFn` + `requireSupabaseAuth`, mesmo padrão de
 * `team.functions.ts`/`integrations.functions.ts`. Nunca decide sozinho:
 * só encaminha pro motor determinístico (`hypito-conversation.server.ts`)
 * e pras ações de confirmação (`hypito-actions.server.ts`), sempre no
 * contexto do usuário autenticado da própria sessão.
 *
 * Toda mensagem do Hypito grava `text` (fallback legível, pra busca/
 * notificações/histórico/clientes antigos) E `hypito_payload` (o
 * `HypitoMessage` estruturado que o frontend usa pra escolher o
 * componente visual certo). Confirmar/cancelar/editar uma ação ATUALIZA
 * o card original em vez de postar uma mensagem nova solta (pedido,
 * seção 10: "substituir ou atualizar o card"), encontrado pelo
 * `pendingActionId` já gravado no próprio payload — nunca por um id de
 * mensagem que o cliente teria que rastrear à parte.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { HYPITO_AUTHOR_ID, HYPITO_NAME, HYPITO_AVATAR_URL } from "@/lib/hypito";
import { logHypitoError, HypitoError } from "@/lib/hypito-errors";
import {
  HYPITO_MESSAGE_VERSION,
  type HypitoMessage,
  type HypitoEntityRef,
} from "@/lib/hypito-messages";
import type { ConfirmResult } from "@/lib/hypito-actions.server";

/** Mesmo formato de `dmId()` em `chat-store.ts` — reimplementado aqui
 * (em vez de importar `chat-store.ts`, um módulo client com estado de
 * `localStorage`/Realtime) pra manter este arquivo server-safe. */
function dmId(a: string, b: string): string {
  return "dm:" + [a, b].sort().join("|");
}

const MAX_MESSAGE_LENGTH = 2000;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 12;

function fmtDate(iso?: string | null): string {
  if (!iso) return "sem prazo";
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}
function fmtTime(iso?: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

/** Card final "Tarefa criada"/"Lembrete criado" — substitui o
 * `task_draft` no MESMO card assim que a confirmação é bem-sucedida
 * (pedido, seção 10). Aponta pro ID exato criado, nunca pra uma página
 * genérica de campanhas. */
function buildSuccessMessage(result: ConfirmResult & { ok: true }): HypitoMessage {
  const scope: HypitoEntityRef | null =
    result.scope && result.scopeId
      ? {
          type: result.scope === "projeto" ? "project" : "campaign",
          id: result.scopeId,
          name: result.scopeName ?? "",
        }
      : null;
  if (result.kind === "create_reminder") {
    const lines = [
      "Lembrete criado",
      result.title,
      `Quando: ${fmtDate(result.dueAtIso)} às ${fmtTime(result.dueAtIso)}`,
    ];
    return {
      version: HYPITO_MESSAGE_VERSION,
      kind: "success",
      title: "Lembrete criado",
      textFallback: lines.join("\n"),
      state: "success",
      timestamp: new Date().toISOString(),
      actions: [],
      data: { message: `Lembrete criado: ${result.title}`, entity: null },
    };
  }
  const task: HypitoEntityRef = {
    type: "task",
    id: result.taskId,
    name: result.title,
    meta: { scope: result.scope, scopeId: result.scopeId },
  };
  const lines = [
    "✓ Tarefa criada",
    result.title,
    `Prazo: ${result.dueAtIso ? `${fmtDate(result.dueAtIso)} às ${fmtTime(result.dueAtIso)}` : "sem prazo"}`,
    `Responsável: ${result.assigneeIsRequester ? "você" : (result.assigneeName ?? "não definido")}`,
    scope
      ? `${result.scope === "projeto" ? "Projeto" : "Campanha"}: ${scope.name}`
      : "Sem projeto/campanha",
    `Prioridade: ${result.priority}`,
  ];
  return {
    version: HYPITO_MESSAGE_VERSION,
    kind: "task_created",
    title: "Tarefa criada",
    textFallback: lines.join("\n"),
    state: "success",
    timestamp: new Date().toISOString(),
    actions: [{ id: "open_task", label: "Abrir tarefa", variant: "primary", entity: task }],
    data: {
      task,
      assignee: result.assigneeName ? { type: "user", id: "", name: result.assigneeName } : null,
      assigneeIsRequester: result.assigneeIsRequester,
      scope,
      dueAtIso: result.dueAtIso,
      priority: result.priority,
    },
  };
}

function buildCancelledMessage(reason: "cancel" | "edit"): HypitoMessage {
  const textFallback =
    reason === "edit" ? "Cancelado para editar." : "Ação cancelada. Nenhuma alteração foi feita.";
  return {
    version: HYPITO_MESSAGE_VERSION,
    kind: "friendly_error",
    title: reason === "edit" ? "Em edição" : "Criação cancelada",
    textFallback,
    state: "cancelled",
    timestamp: new Date().toISOString(),
    actions: [],
    data: {
      message: textFallback,
      whatWasNotChanged: "Nenhuma tarefa foi criada.",
      canRetry: false,
    },
  };
}

function buildFailedConfirmMessage(error: string): HypitoMessage {
  return {
    version: HYPITO_MESSAGE_VERSION,
    kind: "friendly_error",
    title: "Não consegui concluir",
    textFallback: error,
    state: "error",
    timestamp: new Date().toISOString(),
    actions: [],
    data: { message: error, whatWasNotChanged: "Nenhuma alteração foi feita.", canRetry: false },
  };
}

/** Atualiza o card original (achado pelo `pendingActionId` já gravado
 * dentro do próprio `hypito_payload`) em vez de postar uma mensagem nova
 * — mantém o histórico coeso, sem duplicar bolhas pra cada etapa de uma
 * mesma ação. */
async function updateCardByPendingAction(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- client service-role tipado só onde é usado
  supabaseAdmin: any,
  convoId: string,
  pendingActionId: string,
  payload: HypitoMessage,
) {
  await supabaseAdmin
    .from("chat_messages")
    .update({ text: payload.textFallback, hypito_payload: payload })
    .eq("convo_id", convoId)
    .eq("author_id", HYPITO_AUTHOR_ID)
    .eq("hypito_payload->>pendingActionId", pendingActionId);
}

const SendInput = z.object({ text: z.string().min(1).max(MAX_MESSAGE_LENGTH) });

/** Recebe a mensagem que o usuário JÁ enviou normalmente pro Chat
 * (inserida pelo fluxo padrão, cliente-a-cliente) e publica a resposta
 * do Hypito como uma segunda mensagem — inserida via service-role
 * (author_id = HYPITO_AUTHOR_ID, sem linha de `profiles`), entregue a
 * todo mundo pelo mesmo Realtime que já existe. */
export const sendHypitoMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.infer<typeof SendInput>) => SendInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const convoId = dmId(context.userId, HYPITO_AUTHOR_ID);

    const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();
    const { count } = await supabaseAdmin
      .from("chat_messages")
      .select("id", { count: "exact", head: true })
      .eq("convo_id", convoId)
      .eq("author_id", context.userId)
      .gte("created_at", since);
    if ((count ?? 0) > RATE_LIMIT_MAX) {
      return {
        ok: false as const,
        error: "Muitas mensagens em pouco tempo — aguarde um instante.",
      };
    }

    const { handleUserMessage } = await import("@/lib/hypito-conversation.server");
    const { payload } = await handleUserMessage(supabaseAdmin, context.userId, data.text);

    const { error } = await supabaseAdmin.from("chat_messages").insert({
      convo_id: convoId,
      author_id: HYPITO_AUTHOR_ID,
      author_name: HYPITO_NAME,
      author_photo: HYPITO_AVATAR_URL,
      text: payload.textFallback,
      hypito_payload: payload as unknown as never,
    });
    if (error) {
      logHypitoError("sendHypitoMessage:insert", error, { userId: context.userId });
      return { ok: false as const, error: new HypitoError("persistence_unavailable").message };
    }
    return {
      ok: true as const,
      pendingActionId: payload.kind === "task_draft" ? payload.pendingActionId : null,
    };
  });

/** Restaura o estado do card de confirmação ao (re)abrir a conversa — a
 * ação pendente vive em `hypito_pending_actions` (persistida), nunca só
 * no estado efêmero do componente React, então sobrevive a um F5
 * (pedido, seção 19: "cards funcionarem após recarregar a página"). */
export const getHypitoActivePendingAction = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getActivePendingAction } = await import("@/lib/hypito-actions.server");
    const active = await getActivePendingAction(supabaseAdmin, context.userId);
    return { pendingActionId: active?.id ?? null };
  });

const ConfirmInput = z.object({ pendingActionId: z.string().uuid() });

export const confirmHypitoAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.infer<typeof ConfirmInput>) => ConfirmInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { confirmPendingAction } = await import("@/lib/hypito-actions.server");
    const { loadUserAccess } = await import("@/lib/hypito-permissions.server");
    const access = await loadUserAccess(supabaseAdmin, context.userId);
    const result = await confirmPendingAction(
      supabaseAdmin,
      access,
      context.userId,
      data.pendingActionId,
    );

    const convoId = dmId(context.userId, HYPITO_AUTHOR_ID);
    const payload = result.ok
      ? buildSuccessMessage(result)
      : buildFailedConfirmMessage(result.error);
    await updateCardByPendingAction(supabaseAdmin, convoId, data.pendingActionId, payload);
    return result;
  });

const CancelInput = z.object({
  pendingActionId: z.string().uuid(),
  reason: z.enum(["cancel", "edit"]).default("cancel"),
});

export const cancelHypitoAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.infer<typeof CancelInput>) => CancelInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { cancelPendingAction } = await import("@/lib/hypito-actions.server");
    const result = await cancelPendingAction(supabaseAdmin, context.userId, data.pendingActionId);
    const convoId = dmId(context.userId, HYPITO_AUTHOR_ID);
    await updateCardByPendingAction(
      supabaseAdmin,
      convoId,
      data.pendingActionId,
      buildCancelledMessage(data.reason),
    );
    if (data.reason === "edit") {
      await supabaseAdmin.from("chat_messages").insert({
        convo_id: convoId,
        author_id: HYPITO_AUTHOR_ID,
        author_name: HYPITO_NAME,
        author_photo: HYPITO_AVATAR_URL,
        text: "Sem problema — me diga de novo os detalhes, com o que quiser mudar.",
      });
    }
    return result;
  });
