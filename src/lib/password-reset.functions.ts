import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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
