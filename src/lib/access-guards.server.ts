/**
 * Composable, testable authorization guards for the new organization-based
 * environments (internal workspace vs. client portal). These are plain
 * functions usable both in a route's `beforeLoad` and inside server
 * functions — NOT React components.
 *
 * Deliberately reuses the existing permission machinery instead of building
 * a second, parallel one: `requirePermission` delegates to
 * `hypito-permissions.server.ts`'s `can`/`assertCan` (the same functions
 * that already gate the Hypito bot against `has_permission`/`is_admin`),
 * and organization/role checks reuse `is_admin` via `loadUserAccess` only
 * where relevant. See CLAUDE.md, "Phase 1 of a large, high-risk auth/
 * authorization overhaul".
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCan, type HypitoPermission, type UserAccess } from "@/lib/hypito-permissions.server";

type DB = SupabaseClient<Database>;

/** Thin wrapper confirming a valid session exists — reuses the same bearer
 * JWT validation `requireSupabaseAuth` already does, rather than
 * reinventing it. Exported so guard composition can require it explicitly
 * where useful. */
export const requireAuthentication = requireSupabaseAuth;

async function hasActiveMembership(
  db: DB,
  userId: string,
  organizationId: string,
  roles?: string[],
): Promise<boolean> {
  const query = db
    .from("organization_members")
    .select("role, status, organizations!inner(status)")
    .eq("user_id", userId)
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .eq("organizations.status", "active");
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as { role: string; status: string }[];
  if (rows.length === 0) return false;
  if (!roles || roles.length === 0) return true;
  return rows.some((r) => roles.includes(r.role));
}

/** Generic version: works for either org type (internal or client). Both
 * `requireInternalAccess` and `requireClientAccess` call this. */
export async function requireOrganizationMembership(
  db: DB,
  userId: string,
  organizationId: string,
  roles?: string[],
): Promise<boolean> {
  return hasActiveMembership(db, userId, organizationId, roles);
}

async function internalOrgId(db: DB): Promise<string | null> {
  const { data, error } = await db
    .from("organizations")
    .select("id")
    .eq("slug", "vocenohype")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.id ?? null;
}

/** True unless the user has an ACTIVE `internal_admin`/`internal_member`
 * membership in the internal org. */
export async function requireInternalAccess(db: DB, userId: string): Promise<boolean> {
  const orgId = await internalOrgId(db);
  if (!orgId) return false;
  return requireOrganizationMembership(db, userId, orgId, ["internal_admin", "internal_member"]);
}

/** True unless the user has an ACTIVE membership in that specific client
 * organization. */
export async function requireClientAccess(
  db: DB,
  userId: string,
  organizationId: string,
): Promise<boolean> {
  return requireOrganizationMembership(db, userId, organizationId, [
    "client_admin",
    "client_member",
    "client_viewer",
  ]);
}

/** For internal users, delegate to the existing `has_permission`/
 * `assertCan` pattern (`hypito-permissions.server.ts`) — never a second,
 * parallel authorization mechanism. */
export function requirePermission(access: UserAccess, permission: HypitoPermission): void {
  assertCan(access, permission);
}
