/**
 * Server functions do lado do cliente pra conversar com o Hypito —
 * `createServerFn` + `requireSupabaseAuth`, mesmo padrão de
 * `team.functions.ts`/`integrations.functions.ts`. Nunca decide sozinho:
 * só encaminha pro motor determinístico (`hypito-conversation.server.ts`)
 * e pras ações de confirmação (`hypito-actions.server.ts`), sempre no
 * contexto do usuário autenticado da própria sessão.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { HYPITO_AUTHOR_ID, HYPITO_NAME, HYPITO_AVATAR_URL } from "@/lib/hypito";
import { logHypitoError, HypitoError } from "@/lib/hypito-errors";

/** Mesmo formato de `dmId()` em `chat-store.ts` — reimplementado aqui
 * (em vez de importar `chat-store.ts`, um módulo client com estado de
 * `localStorage`/Realtime) pra manter este arquivo server-safe. */
function dmId(a: string, b: string): string {
  return "dm:" + [a, b].sort().join("|");
}

const MAX_MESSAGE_LENGTH = 2000;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 12;

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
    const reply = await handleUserMessage(supabaseAdmin, context.userId, data.text);

    const { error } = await supabaseAdmin.from("chat_messages").insert({
      convo_id: convoId,
      author_id: HYPITO_AUTHOR_ID,
      author_name: HYPITO_NAME,
      author_photo: HYPITO_AVATAR_URL,
      text: reply.text,
    });
    if (error) {
      logHypitoError("sendHypitoMessage:insert", error, { userId: context.userId });
      return { ok: false as const, error: new HypitoError("persistence_unavailable").message };
    }
    // `chat_messages` não tem (ainda) uma coluna pra referenciar a
    // confirmação pendente — ver nota em `hypito-actions.server.ts`.
    // Por isso o card de confirmação não fica anexado à MENSAGEM (o
    // Realtime só entrega o texto normal pra quem está na conversa); o
    // id volta aqui na resposta síncrona pra quem enviou renderizar os
    // botões Confirmar/Cancelar localmente, sem depender de nova coluna.
    return { ok: true as const, pendingActionId: reply.pendingActionId ?? null };
  });

/** Restaura o card de confirmação ao (re)abrir a conversa — a ação
 * pendente vive em `hypito_pending_actions` (persistida), nunca só no
 * estado efêmero do componente React, então sobrevive a um F5 (pedido,
 * seção 16: "atualização da página no meio de uma ação"). */
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
    const text = result.ok
      ? `${result.alreadyDone ? "(Já confirmado.) " : ""}Feito! → ${result.link}`
      : `Não consegui: ${result.error}`;
    await supabaseAdmin.from("chat_messages").insert({
      convo_id: convoId,
      author_id: HYPITO_AUTHOR_ID,
      author_name: HYPITO_NAME,
      author_photo: HYPITO_AVATAR_URL,
      text,
    });
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
    const text =
      data.reason === "edit"
        ? "Sem problema — me diga de novo os detalhes, com o que quiser mudar."
        : "Ok, cancelei essa ação. Se quiser, me diga de novo o que precisa.";
    await supabaseAdmin.from("chat_messages").insert({
      convo_id: convoId,
      author_id: HYPITO_AUTHOR_ID,
      author_name: HYPITO_NAME,
      author_photo: HYPITO_AVATAR_URL,
      text,
    });
    return result;
  });
