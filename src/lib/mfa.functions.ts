/**
 * Phase 3 part 2 of the auth overhaul (see CLAUDE.md): Supabase Auth's
 * native MFA (`supabase.auth.mfa.*`, backed by `auth.mfa_factors` /
 * `auth.mfa_challenges`, entirely Supabase-managed — no app tables, no RLS
 * of ours involved). This is a SEPARATE, unrelated feature from the
 * existing password-vault TOTP in `vault-totp.functions.ts`
 * (`vault_totp_secrets`/`vault_totp_attempts`) — do not conflate the two.
 *
 * This file holds:
 *  - `shouldRequireMfaChallenge`: the one piece of pure logic behind the
 *    login-flow gate in `src/routes/index.tsx` and the route guard in
 *    `src/routes/_authenticated/route.tsx`, extracted so it's unit-testable
 *    without a live Supabase session (see `mfa.functions.test.ts`).
 *  - `checkMfaVerifyRateLimit`: a modest server-side rate limit on MFA
 *    verify attempts, mirroring `rate-limit.functions.ts`'s
 *    `checkLoginRateLimit` shape but bucketed by the (already-authenticated,
 *    aal1) user id from the session's own bearer token — never a
 *    client-supplied id, so it can't be used to grief someone else's bucket.
 *  - `unenrollUserMfaFactor`: the admin-assisted recovery path for a user
 *    who lost their device. Supabase's native MFA does not ship backup
 *    codes in this SDK version (verified against the installed
 *    `@supabase/auth-js` types — `GoTrueMFAApi` has no
 *    recovery-codes method), and building a custom backup-code scheme was
 *    explicitly out of scope (real crypto surface, not worth rushing here).
 *    So THIS admin-assisted unenroll *is* the recovery path: another admin
 *    verifies the locked-out user's identity out-of-band, then removes
 *    their factor here so they can sign in with just their password again
 *    (and re-enroll a new device from Configurações afterward).
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/** Pure gate: does this session need to complete an MFA challenge before
 * the app treats it as fully authenticated? `currentLevel`/`nextLevel` are
 * exactly what `supabase.auth.mfa.getAuthenticatorAssuranceLevel()` returns.
 * True only when the user has a verified factor (`nextLevel === 'aal2'`)
 * AND the current session hasn't satisfied it yet (`currentLevel === 'aal1'`).
 * Any other combination (no factor enrolled, or already at aal2) means
 * "proceed exactly as before" — this is the single invariant the whole
 * non-MFA login path relies on staying unchanged. */
export function shouldRequireMfaChallenge(
  currentLevel: string | null | undefined,
  nextLevel: string | null | undefined,
): boolean {
  return currentLevel === "aal1" && nextLevel === "aal2";
}

/** ~10 attempts / 15 min per user — same shape/generosity as
 * `checkLoginRateLimit`, just bucketed by user id (there's already a
 * session at this point, unlike the pre-session login/recovery checks in
 * `rate-limit.functions.ts`) instead of email. Call before every
 * `mfa.challenge()`/`mfa.verify()` pair, both during login-time challenge
 * and during enrollment's own confirm step. */
export const checkMfaVerifyRateLimit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { checkRateLimit, emailBucket } = await import("@/lib/rate-limit.server");
    const allowed = await checkRateLimit(emailBucket("mfa_verify", context.userId), 10, 15 * 60);
    return { allowed };
  });

const UnenrollInput = z.object({
  userId: z.string().uuid(),
  // Optional: when omitted, every verified TOTP factor found for this user
  // is removed (the common "lost device, has exactly one factor" case).
  factorId: z.string().uuid().optional(),
});

/** Admin-only. Uses `supabaseAdmin.auth.admin.mfa.listFactors`/`.deleteFactor`
 * (verified against the installed `@supabase/auth-js` `GoTrueAdminMFAApi`
 * types — both take `{ userId }`/`{ id, userId }`). Logs one
 * `mfa_unenrolled_by_admin` audit row per factor removed, with
 * `target_user_id` set to the affected user (distinct from
 * `logMfaUnenrolled` in `audit-log.functions.ts`, which is the user's own
 * self-service disable). */
export const unenrollUserMfaFactor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => UnenrollInput.parse(raw))
  .handler(async ({ data, context }) => {
    const { assertAdmin } = await import("@/lib/team.functions");
    await assertAdmin(context.supabase, context.userId);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { writeAuditLog } = await import("@/lib/audit-log.functions");

    let factorIds = data.factorId ? [data.factorId] : [];
    if (factorIds.length === 0) {
      const { data: listed, error: listErr } = await supabaseAdmin.auth.admin.mfa.listFactors({
        userId: data.userId,
      });
      if (listErr) throw new Error(listErr.message);
      factorIds = (listed?.factors ?? []).filter((f) => f.factor_type === "totp").map((f) => f.id);
    }
    if (factorIds.length === 0) {
      throw new Error("Nenhum fator de autenticação encontrado para este usuário.");
    }

    for (const factorId of factorIds) {
      const { error } = await supabaseAdmin.auth.admin.mfa.deleteFactor({
        id: factorId,
        userId: data.userId,
      });
      if (error) throw new Error(error.message);
      await writeAuditLog(supabaseAdmin, {
        actorUserId: context.userId,
        action: "mfa_unenrolled_by_admin",
        targetUserId: data.userId,
        newValue: { factorId },
      });
    }

    return { ok: true, count: factorIds.length };
  });
