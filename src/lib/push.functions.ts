import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SubscriptionInput = z.object({
  endpoint: z.string().url(),
  p256dh: z.string().min(1),
  auth: z.string().min(1),
});

/** Salva (ou atualiza) a assinatura de push deste navegador/dispositivo pro
 * usuário autenticado — chamado depois que `Notification.requestPermission()`
 * + `pushManager.subscribe()` já rodaram no cliente. */
export const savePushSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.infer<typeof SubscriptionInput>) => SubscriptionInput.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("push_subscriptions").upsert(
      {
        user_id: context.userId,
        endpoint: data.endpoint,
        p256dh: data.p256dh,
        auth: data.auth,
      },
      { onConflict: "endpoint" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Remove a assinatura deste navegador (ex: usuário desativou notificações). */
export const deletePushSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { endpoint: string }) => z.object({ endpoint: z.string() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("push_subscriptions")
      .delete()
      .eq("endpoint", data.endpoint)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Núcleo do envio — roda com service-role porque precisa ler as assinaturas
 * de push de OUTRAS pessoas (não só as minhas), o que RLS não permitiria pro
 * usuário comum. Usado por todo evento que deveria virar notificação no
 * celular: mensagem de chat, tarefa atribuída, convite de reunião.
 */
export async function deliverPush(
  userIds: string[],
  payload: { title: string; body: string; url: string },
): Promise<{ sent: number }> {
  if (userIds.length === 0) return { sent: 0 };
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: subs, error } = await supabaseAdmin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .in("user_id", userIds);
  if (error || !subs?.length) return { sent: 0 };

  const webpush = await import("web-push");
  const publicKey = process.env.VITE_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) {
    console.warn("[push] VAPID não configurado — pulando envio.");
    return { sent: 0 };
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);

  const body = JSON.stringify(payload);
  const results = await Promise.allSettled(
    subs.map((s) =>
      webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        body,
      ),
    ),
  );

  // Endpoints que o navegador/OS já invalidou (a pessoa desinstalou, trocou
  // de dispositivo, etc) voltam 404/410 — limpa em vez de tentar de novo
  // pra sempre.
  const expired = subs.filter((_, i) => {
    const r = results[i];
    return (
      r.status === "rejected" &&
      typeof r.reason === "object" &&
      r.reason !== null &&
      "statusCode" in r.reason &&
      (r.reason.statusCode === 404 || r.reason.statusCode === 410)
    );
  });
  if (expired.length > 0) {
    await supabaseAdmin
      .from("push_subscriptions")
      .delete()
      .in(
        "id",
        expired.map((s) => s.id),
      );
  }

  return { sent: results.filter((r) => r.status === "fulfilled").length };
}

const ChatPushInput = z.object({
  convoId: z.string(),
  text: z.string(),
  authorName: z.string(),
  mentionedUserIds: z.array(z.string()).default([]),
});

/** Dispara push pra quem deveria ser avisado de uma mensagem de chat: o
 * outro lado de uma DM, ou quem foi @mencionado num canal. Chamado
 * (best-effort, fire-and-forget) logo após enviar a mensagem — ver
 * `sendMessage` em chat-store.ts. */
export const sendChatPush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.infer<typeof ChatPushInput>) => ChatPushInput.parse(input))
  .handler(async ({ data, context }) => {
    const recipients = new Set<string>(data.mentionedUserIds);
    if (data.convoId.startsWith("dm:")) {
      for (const id of data.convoId.slice(3).split("|")) recipients.add(id);
    }
    recipients.delete(context.userId);
    return deliverPush(Array.from(recipients), {
      title: data.authorName,
      body: data.text.slice(0, 140),
      url: "/time?section=chat",
    });
  });

const AppPushInput = z.object({
  userIds: z.array(z.string()).min(1),
  title: z.string(),
  body: z.string(),
  url: z.string().default("/time"),
});

/** Push genérico pra eventos fora do chat — hoje usado por tarefa atribuída
 * (TaskBoard.tsx) e convite de reunião (ReunioesSection.tsx). Quem chama já
 * resolveu os ids de destino (nunca inclui o próprio autor da ação). */
export const sendAppPush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.infer<typeof AppPushInput>) => AppPushInput.parse(input))
  .handler(async ({ data, context }) => {
    const targets = data.userIds.filter((id) => id !== context.userId);
    return deliverPush(targets, { title: data.title, body: data.body, url: data.url });
  });
