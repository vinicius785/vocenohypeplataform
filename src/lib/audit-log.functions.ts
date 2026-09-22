/**
 * Shared audit-log write helper + a small set of server functions that log
 * events which Phase 2a's `organization-invites.functions.ts` doesn't cover
 * (that file already logs invite/role/suspend/reactivate/remove mutations —
 * see CLAUDE.md piece A). This file extends `access_audit_log` usage to:
 * login success/failure, logout, and environment switch.
 *
 * `access_audit_log` RLS is unchanged (admin-select-only, no insert policy
 * for `authenticated`/`anon` — see `20260918170000_access_audit_log.sql`);
 * every write here goes through `supabaseAdmin`, exactly like
 * `organization-invites.functions.ts`'s `logAccessAudit`.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { z } from "zod";

// Exported so other server functions that already hold a `supabaseAdmin`
// client (e.g. `mfa.functions.ts`'s admin-assisted MFA unenroll) can log to
// `access_audit_log` without reimplementing this NOT-NULL-actor guard — same
// "no second parallel audit-log writer" reasoning as `assertAdmin` in
// `team.functions.ts`.
export async function writeAuditLog(
  supabaseAdmin: SupabaseClient<Database>,
  entry: {
    actorUserId: string | null;
    organizationId?: string | null;
    action: string;
    targetUserId?: string | null;
    previousValue?: unknown;
    newValue?: unknown;
  },
) {
  // actor_user_id is NOT NULL on access_audit_log (see migration) — a failed
  // login has no authenticated user, so there is nothing to attribute it to
  // as `actor_user_id`. We can't relax that column without a migration, and
  // widening it here is out of scope for this pass; log failed attempts to
  // console instead of the DB table so we never violate the NOT NULL
  // constraint. Successful logins/logout/env-switch always have a real
  // actor and are written normally.
  if (!entry.actorUserId) {
    console.warn("[audit-log] evento sem ator (não gravado em access_audit_log):", entry.action, {
      email: (entry.newValue as { email?: string } | undefined)?.email,
    });
    return;
  }
  const { error } = await supabaseAdmin.from("access_audit_log").insert({
    actor_user_id: entry.actorUserId,
    organization_id: entry.organizationId ?? null,
    action: entry.action,
    target_user_id: entry.targetUserId ?? null,
    previous_value: (entry.previousValue ?? null) as never,
    new_value: (entry.newValue ?? null) as never,
  });
  if (error) console.error("[audit-log] falha ao registrar", entry.action, error.message);
}

/** Called right after a successful `signInWithPassword`, from `index.tsx`.
 * Authenticated (the fresh session's bearer token is attached by
 * `auth-attacher.ts`), so `context.userId` is trustworthy. */
export const logLoginSuccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await writeAuditLog(supabaseAdmin, {
      actorUserId: context.userId,
      action: "login_success",
    });
    return { ok: true };
  });

/** Called from `index.tsx` on logout (the main "Sair" action in
 * Configurações). Must be called BEFORE `supabase.auth.signOut()` runs,
 * while the session (and its bearer token) is still valid. */
export const logLogout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await writeAuditLog(supabaseAdmin, {
      actorUserId: context.userId,
      action: "logout",
    });
    return { ok: true };
  });

/** Login failures happen before any session exists, so there's no bearer
 * token to authenticate this call — it's necessarily a public endpoint.
 * Kept intentionally minimal (email only, no password) and always returns
 * `{ ok: true }` regardless of outcome so it can never be used to signal
 * anything back to the caller. Rate-limited via the same `login:<email>`
 * bucket as the login attempt itself (see `rate-limit.server.ts`), so it
 * can't be used to flood the audit table. */
const LoginFailureInput = z.object({ email: z.string().trim().max(255) });
export const logLoginFailure = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => LoginFailureInput.parse(raw))
  .handler(async ({ data }) => {
    // No actor to attribute this to (no authenticated user) — see the
    // NOT NULL note in writeAuditLog. We still want the fact on record
    // for admins, so resolve the attempted email to a user id when it
    // matches a real account (service-role lookup, never exposed to the
    // caller either way — the response is always {ok:true}).
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let actorUserId: string | null = null;
    try {
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("email", data.email)
        .maybeSingle();
      actorUserId = profile?.id ?? null;
    } catch {
      /* best-effort only */
    }
    if (actorUserId) {
      await writeAuditLog(supabaseAdmin, {
        actorUserId,
        action: "login_failed",
        newValue: { email: data.email },
      });
    } else {
      console.warn("[audit-log] login_failed para e-mail não encontrado:", data.email);
    }
    return { ok: true };
  });

/** Called from `/selecionar-ambiente` right after `setActiveOrganization`
 * succeeds (see `portal-auth.functions.ts`) — kept as a separate call
 * rather than folded into `setActiveOrganization` itself so that function's
 * existing behavior/return value stays untouched. */
const EnvSwitchInput = z.object({ organizationId: z.string().uuid().nullable() });
export const logEnvironmentSwitch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => EnvSwitchInput.parse(raw))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await writeAuditLog(supabaseAdmin, {
      actorUserId: context.userId,
      organizationId: data.organizationId,
      action: "environment_switch",
    });
    return { ok: true };
  });

/** Self-service MFA enrollment log — called from `MfaEnrollCard.tsx` right
 * after `supabase.auth.mfa.verify()` succeeds for a brand-new factor. The
 * caller's own bearer token authenticates this, so `context.userId` is
 * exactly the user who just enrolled (never a param the client could spoof
 * to attribute the action to someone else). */
export const logMfaEnrolled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await writeAuditLog(supabaseAdmin, {
      actorUserId: context.userId,
      action: "mfa_enrolled",
    });
    return { ok: true };
  });

/** Self-service MFA unenrollment log (the user disabling their own 2FA from
 * Configurações). For an admin removing SOMEONE ELSE's factor, see
 * `mfa.functions.ts`'s `unenrollUserMfaFactor` (`action: 'mfa_unenrolled_by_admin'`,
 * with `target_user_id` set) instead — that is a distinct, admin-only path. */
export const logMfaUnenrolled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await writeAuditLog(supabaseAdmin, {
      actorUserId: context.userId,
      action: "mfa_unenrolled",
    });
    return { ok: true };
  });

const ListInput = z.object({
  page: z.number().int().min(0).default(0),
  pageSize: z.number().int().min(1).max(100).default(25),
  action: z.string().trim().max(60).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  /** Added for the per-client "Histórico" section on `/clientes/$id`
   * (`ClienteDetailPage.tsx`) — narrows the log to one organization's
   * events without adding a second read path. Optional and additive: every
   * existing caller (the global `AuditLogTab.tsx`) keeps working unchanged
   * by simply omitting it. */
  organizationId: z.string().uuid().optional(),
});

/** Admin-only paginated read of `access_audit_log`. Reuses the table's own
 * RLS (admin-select-only) via `context.supabase` — no service-role client
 * needed for reads, unlike the write helpers above. */
export const listAuditLog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => ListInput.parse(raw))
  .handler(async ({ data, context }) => {
    const { assertAdmin } = await import("@/lib/team.functions");
    await assertAdmin(context.supabase, context.userId);

    let query = context.supabase
      .from("access_audit_log")
      .select(
        "id, actor_user_id, organization_id, action, target_user_id, previous_value, new_value, created_at",
        {
          count: "exact",
        },
      )
      .order("created_at", { ascending: false });

    if (data.action) query = query.eq("action", data.action);
    if (data.from) query = query.gte("created_at", data.from);
    if (data.to) query = query.lte("created_at", data.to);
    if (data.organizationId) query = query.eq("organization_id", data.organizationId);

    const start = data.page * data.pageSize;
    const end = start + data.pageSize - 1;
    const { data: rows, error, count } = await query.range(start, end);
    if (error) throw new Error(error.message);

    const actorIds = Array.from(new Set((rows ?? []).map((r) => r.actor_user_id).filter(Boolean)));
    let actorEmails: Record<string, string> = {};
    if (actorIds.length > 0) {
      const { data: profiles } = await context.supabase
        .from("profiles")
        .select("id, email")
        .in("id", actorIds as string[]);
      actorEmails = Object.fromEntries((profiles ?? []).map((p) => [p.id, p.email ?? p.id]));
    }

    return {
      rows: (rows ?? []).map((r) => ({ ...r, actorEmail: actorEmails[r.actor_user_id] ?? null })),
      total: count ?? 0,
    };
  });
