/**
 * Resolves which "environment" (internal workspace vs. client organization)
 * a given authenticated user should land in, based ONLY on live
 * `organization_members`/`organizations` data — never anything cached
 * client-side. See CLAUDE.md, "Phase 1 of a large, high-risk auth/
 * authorization overhaul".
 *
 * Only ACTIVE memberships (`status = 'active'`) in ACTIVE organizations
 * (`status = 'active'`) count. An active membership in a suspended org is
 * treated as zero active environments for that org — it must not count.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type DB = SupabaseClient<Database>;

export type AvailableEnvironment = {
  organizationId: string;
  name: string;
  type: "internal" | "client";
  role: string;
  logoUrl?: string | null;
  lastAccessAt?: string | null;
};

export type UserEnvironment =
  | { type: "internal"; organizationId: string; redirectTo: string }
  | { type: "client"; organizationId: string; redirectTo: string }
  | { type: "multiple"; environments: AvailableEnvironment[]; redirectTo: string }
  | { type: "pending"; redirectTo: string }
  | { type: "suspended"; redirectTo: string };

// Internal app home per CLAUDE.md ("time.tsx — the actual application
// 'home'"). Client portal home is the new minimal authenticated route added
// this phase (parallel to the existing token-based portal.$token/** routes).
//
// Route choice note: `/portal/inicio` was NOT usable here — the existing
// `src/routes/portal.$token/**` tree already claims every `/portal/:x`
// path (a plain second segment is captured by the `$token` dynamic param,
// so `/portal/inicio` would resolve to the OLD token-based route with
// `token = "inicio"`, not a new route). `/portal-app/*` is a distinct
// top-level segment with no collision, per the file-based routing rules in
// src/routes/README.md.
export const INTERNAL_HOME_ROUTE = "/time";
export const CLIENT_PORTAL_HOME_ROUTE = "/portal-app/inicio";
export const ENVIRONMENT_PICKER_ROUTE = "/selecionar-ambiente";
export const PENDING_ACCESS_ROUTE = "/acesso-pendente";
export const SUSPENDED_ACCESS_ROUTE = "/acesso-bloqueado";

type MembershipRow = {
  organization_id: string;
  role: string;
  status: string;
  last_access_at: string | null;
  organizations: {
    id: string;
    name: string;
    type: "internal" | "client";
    status: string;
    logo_url: string | null;
  } | null;
};

export async function resolveUserEnvironment(db: DB, userId: string): Promise<UserEnvironment> {
  const { data, error } = await db
    .from("organization_members")
    .select(
      "organization_id, role, status, last_access_at, organizations!inner(id, name, type, status, logo_url)",
    )
    .eq("user_id", userId)
    .eq("status", "active")
    .eq("organizations.status", "active");

  if (error) throw new Error(error.message);

  const rows = (data ?? []) as unknown as MembershipRow[];
  const environments: AvailableEnvironment[] = rows
    .filter((row) => row.organizations)
    .map((row) => ({
      organizationId: row.organization_id,
      name: row.organizations!.name,
      type: row.organizations!.type,
      role: row.role,
      logoUrl: row.organizations!.logo_url,
      lastAccessAt: row.last_access_at,
    }));

  if (environments.length === 0) {
    // Distinguish "genuinely no membership at all" from "membership(s)
    // exist but are suspended (or in a suspended org)" — see module doc.
    // A second, unfiltered-by-status query is needed because the ACTIVE
    // query above already excludes suspended rows/orgs by design.
    const { data: allRows, error: allErr } = await db
      .from("organization_members")
      .select(
        "organization_id, role, status, last_access_at, organizations!inner(id, name, type, status, logo_url)",
      )
      .eq("user_id", userId);
    if (allErr) throw new Error(allErr.message);

    const hasSuspendedRow = ((allRows ?? []) as unknown as MembershipRow[]).some(
      (row) =>
        row.status === "suspended" ||
        (row.status === "active" && row.organizations?.status === "suspended"),
    );

    if (hasSuspendedRow) {
      return { type: "suspended", redirectTo: SUSPENDED_ACCESS_ROUTE };
    }
    return { type: "pending", redirectTo: PENDING_ACCESS_ROUTE };
  }

  if (environments.length === 1) {
    const env = environments[0];
    if (env.type === "internal") {
      return {
        type: "internal",
        organizationId: env.organizationId,
        redirectTo: INTERNAL_HOME_ROUTE,
      };
    }
    return {
      type: "client",
      organizationId: env.organizationId,
      redirectTo: CLIENT_PORTAL_HOME_ROUTE,
    };
  }

  return { type: "multiple", environments, redirectTo: ENVIRONMENT_PICKER_ROUTE };
}
