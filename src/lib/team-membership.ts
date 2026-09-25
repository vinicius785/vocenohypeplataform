import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/**
 * Single source of truth (TS side) for "is this an internal team member",
 * mirroring the SQL `public.is_internal_team_member()` helper added by
 * `20260925090000_internal_team_membership_gate.sql`. Every server function
 * that lists/filters "the team" (Time tab, chat DM/mention/participant
 * selectors, score/ranking, presence) must go through this instead of
 * querying `profiles` directly — `profiles` gets a row for EVERY auth user,
 * client-portal accounts included (see `handle_new_user`), so "has a
 * profiles row" was never a valid proxy for "is internal team".
 *
 * `organization_members`/`organizations` themselves are the real source of
 * truth (Phase 1: `20260918160000_client_organizations_phase1.sql`); this
 * module just gives every call site one place to ask the question instead
 * of re-deriving it inline.
 */

type DB = SupabaseClient<Database>;

const INTERNAL_ROLES = ["internal_admin", "internal_member"] as const;

/** IDs of every user with an ACTIVE internal_admin/internal_member
 * membership in the ACTIVE internal org. Uses the service-role client
 * (bypasses RLS) since this is meant for admin-only aggregate listings like
 * `getTeamDirectory` — callers scoped to RLS should prefer the SQL
 * `is_internal_team_member()` function inside a policy/query instead. */
export async function listInternalTeamUserIds(supabaseAdmin: DB): Promise<Set<string>> {
  // Union with `user_roles.role = 'admin'` mirrors the SQL helper's
  // `is_admin(_user_id) OR <membership>` — an admin must always count as
  // internal even in the edge case of a missing/out-of-sync
  // organization_members backfill row (see the SQL function's comment).
  const { data: adminRoles, error: adminErr } = await supabaseAdmin
    .from("user_roles")
    .select("user_id")
    .eq("role", "admin");
  if (adminErr) throw new Error(adminErr.message);
  const ids = new Set((adminRoles ?? []).map((r) => r.user_id));

  const { data: org, error: orgErr } = await supabaseAdmin
    .from("organizations")
    .select("id")
    .eq("slug", "vocenohype")
    .eq("status", "active")
    .maybeSingle();
  if (orgErr) throw new Error(orgErr.message);
  if (!org) return ids;

  const { data: members, error: memErr } = await supabaseAdmin
    .from("organization_members")
    .select("user_id")
    .eq("organization_id", org.id)
    .eq("status", "active")
    .in("role", INTERNAL_ROLES);
  if (memErr) throw new Error(memErr.message);

  for (const m of members ?? []) ids.add(m.user_id);
  return ids;
}

/** True iff `userId` has an ACTIVE internal_admin/internal_member membership
 * in the ACTIVE internal org. Prefer `listInternalTeamUserIds` when checking
 * many users at once (one query instead of N). */
export async function isInternalTeamMember(supabaseAdmin: DB, userId: string): Promise<boolean> {
  const ids = await listInternalTeamUserIds(supabaseAdmin);
  return ids.has(userId);
}

/** Active client-portal user ids (role client_standard/client_viewer),
 * regardless of which client organization — used by defense-in-depth checks
 * that need "is this a client account at all", not scoped to one org. */
export async function listClientPortalUserIds(supabaseAdmin: DB): Promise<Set<string>> {
  const { data: members, error } = await supabaseAdmin
    .from("organization_members")
    .select("user_id, organizations!inner(type)")
    .eq("status", "active")
    .eq("organizations.type", "client");
  if (error) throw new Error(error.message);
  return new Set((members ?? []).map((m) => m.user_id));
}
