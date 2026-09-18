import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const RequestInput = z.object({
  email: z.string().trim().min(3).max(200),
});

/**
 * OLD flow (Phase 1) — "Esqueci minha senha" that only notified an admin,
 * who then reset the password manually. Kept intact-but-unused rather than
 * removed: grepping the repo shows it was only ever called from the login
 * page's "esqueci minha senha" button (`src/routes/index.tsx`), which now
 * calls `sendPasswordResetEmail` below instead — but this still writes a
 * real `password_reset_requests` row and pings admins, so deleting it
 * outright felt riskier than just leaving it unreferenced from the UI.
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

/**
 * Self-service recovery (Phase 2a, see CLAUDE.md piece B): the actual email
 * send happens client-side via the anon client's `resetPasswordForEmail`
 * (needs the browser's own supabase-js instance to set `redirectTo`
 * correctly, so it isn't a server function — see `src/routes/index.tsx`).
 * This one only exists for the step right after `updateUser({password})`
 * succeeds on `/redefinir-senha`: revoke every OTHER active session for
 * that user so a stolen/shared device doesn't stay logged in past a
 * recovery. Reuses the current request's own bearer token (already
 * validated by `requireSupabaseAuth`) as the "current" session to keep —
 * `admin.signOut(jwt, 'others')` is the exact API for that, confirmed
 * against the installed @supabase/supabase-js v2.110 types
 * (`GoTrueAdminApi.signOut(jwt: string, scope?: SignOutScope)`), no
 * assumption about a userId-based variant that doesn't exist.
 */
export const signOutOtherSessions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { getRequest } = await import("@tanstack/react-start/server");
    const request = getRequest();
    const authHeader = request?.headers.get("authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) throw new Error("Sessão inválida.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.signOut(token, "others");
    if (error) throw new Error(error.message);
    return { ok: true };
  });
