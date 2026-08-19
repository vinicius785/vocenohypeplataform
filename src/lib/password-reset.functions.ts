import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const RequestInput = z.object({
  email: z.string().trim().min(3).max(200),
});

/**
 * "Esqueci minha senha" (tela de login, sem sessão) — esta plataforma não
 * tem fluxo de e-mail de recuperação: contas são criadas/resetadas pelo
 * admin (ver `resetMemberPassword` em `team.functions.ts`). Este pedido só
 * registra a solicitação e avisa os admins via push — não valida se o
 * e-mail pertence a uma conta de verdade (evita virar um jeito de
 * descobrir quais e-mails têm cadastro) nem reseta nada sozinho.
 */
export const requestPasswordReset = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => RequestInput.parse(raw))
  .handler(async ({ data }) => {
    const email = data.email.trim().toLowerCase();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { error: insertError } = await supabaseAdmin
      .from("password_reset_requests")
      .insert({ email });
    if (insertError) throw new Error(insertError.message);

    // Best-effort — o pedido já foi registrado mesmo se o push falhar
    // (VAPID não configurado, nenhum admin com notificação ativa, etc).
    try {
      const { data: roles } = await supabaseAdmin
        .from("user_roles")
        .select("user_id")
        .eq("role", "admin");
      const adminIds = (roles ?? []).map((r) => r.user_id);
      if (adminIds.length > 0) {
        const { deliverPush } = await import("@/lib/push.functions");
        await deliverPush(adminIds, {
          title: "Pedido de senha esquecida",
          body: `${email} esqueceu a senha e precisa de reset.`,
          url: "/time",
        });
      }
    } catch (err) {
      console.warn("[password-reset] aviso aos admins falhou", err);
    }

    return { ok: true };
  });
