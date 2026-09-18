/**
 * Client invite + full portal-access management (Phase 2a) — see CLAUDE.md.
 * Mirrors `team.functions.ts`'s `createTeamMember`/`resetMemberPassword`:
 * same temp-password-out-of-band pattern, same `assertAdmin` gate reused
 * verbatim from `team.functions.ts` (no second parallel authorization
 * system).
 *
 * NOTE on `campaign_members` enforcement: `updateClientMemberCampaigns`
 * below correctly maintains the `campaign_members` rows, but as of this
 * phase `user_can_access_campanha()` (the Phase 1 migration
 * `20260918160000_client_organizations_phase1.sql`) grants access purely at
 * the organization level — it does not consult `campaign_members` at all.
 * So narrowing a client member to specific campaigns updates the table but
 * has NO effect yet on what that member can actually read; every client org
 * member still sees every campaign belonging to their org. Wiring
 * `campaign_members` into `user_can_access_campanha()` is left for a
 * follow-up phase.
 */
import { assertAdmin as assertAdminShared } from "@/lib/team.functions";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { z } from "zod";

const ClientRoleEnum = z.enum(["client_admin", "client_member", "client_viewer"]);
const assertAdmin = assertAdminShared;

/** Writes one row to `access_audit_log` via `supabaseAdmin` (bypasses RLS —
 * intentional, see migration `20260918170000_access_audit_log.sql`).
 * Best-effort logging failures never block the underlying mutation, which
 * has already succeeded by the time this is called — but they're surfaced
 * via console.error so they're not silently lost. */
async function logAccessAudit(
  supabaseAdmin: SupabaseClient<Database>,
  entry: {
    actorUserId: string;
    organizationId: string | null;
    action: string;
    targetUserId: string | null;
    previousValue?: unknown;
    newValue?: unknown;
  },
) {
  const { error } = await supabaseAdmin.from("access_audit_log").insert({
    actor_user_id: entry.actorUserId,
    organization_id: entry.organizationId,
    action: entry.action,
    target_user_id: entry.targetUserId,
    previous_value: (entry.previousValue ?? null) as never,
    new_value: (entry.newValue ?? null) as never,
  });
  if (error) console.error("[access-audit-log] falha ao registrar", entry.action, error.message);
}

/** Loads the membership row + owning organization (admin client, bypasses
 * RLS) — shared by every mutating function below so each one can validate
 * state (status, organization type) before writing. */
async function loadMembershipWithOrg(
  supabaseAdmin: SupabaseClient<Database>,
  organizationMemberId: string,
) {
  const { data, error } = await supabaseAdmin
    .from("organization_members")
    .select("id, organization_id, user_id, role, status, organizations(id, type, name)")
    .eq("id", organizationMemberId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Vínculo de acesso não encontrado.");
  return data;
}

function generateTempPassword(): string {
  // Same shape as the admin-mediated temp passwords used elsewhere in the
  // app (shared out-of-band, forces a real password on first access via
  // `must_change_password` — here modeled as `status: 'invited'` instead,
  // since client_admin/create UI for accept-invite isn't built this phase,
  // but the auth user itself is fully functional immediately).
  return `Vnh-${Math.random().toString(36).slice(2, 8)}${Math.random().toString(36).slice(2, 6)}!`;
}

const InviteInput = z.object({
  organizationId: z.string().uuid(),
  email: z.string().trim().email().max(255),
  fullName: z.string().trim().max(120).optional().default(""),
  role: ClientRoleEnum.default("client_member"),
});

export const inviteClientUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => InviteInput.parse(raw))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);

    const { data: org, error: orgErr } = await context.supabase
      .from("organizations")
      .select("id, type")
      .eq("id", data.organizationId)
      .maybeSingle();
    if (orgErr) throw new Error(orgErr.message);
    if (!org) throw new Error("Organização não encontrada.");
    if (org.type !== "client") {
      throw new Error("Só é possível convidar usuários para organizações de clientes.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const tempPassword = generateTempPassword();

    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: {
        full_name: data.fullName,
        must_change_password: true,
      },
    });
    if (createErr || !created?.user) {
      throw new Error(createErr?.message ?? "Falha ao criar usuário.");
    }

    const userId = created.user.id;
    const { error: memberErr } = await supabaseAdmin.from("organization_members").insert({
      organization_id: data.organizationId,
      user_id: userId,
      role: data.role,
      status: "invited",
      invited_by: context.userId,
      invited_at: new Date().toISOString(),
    });
    if (memberErr) throw new Error(memberErr.message);

    return { id: userId, email: data.email, tempPassword };
  });

/** The `clientes` client-side store only syncs the JSONB `data` column
 * (`createTableArrayStore`), not the new real `organization_id` column —
 * this small lookup avoids touching that shared sync module (out of scope
 * for this phase) just to plumb one id through to the invite UI. */
export const getClienteOrganizationId = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ clienteId: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("clientes")
      .select("organization_id")
      .eq("id", data.clienteId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { organizationId: row?.organization_id ?? null };
  });

export const listOrganizationMembers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ organizationId: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: members, error } = await supabaseAdmin
      .from("organization_members")
      .select("id, user_id, role, status, invited_at, accepted_at, last_access_at")
      .eq("organization_id", data.organizationId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);

    const userIds = (members ?? []).map((m) => m.user_id);
    const { data: profiles } = userIds.length
      ? await supabaseAdmin.from("profiles").select("id, email, full_name").in("id", userIds)
      : { data: [] as { id: string; email: string | null; full_name: string | null }[] };
    const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));

    const memberIds = (members ?? []).map((m) => m.user_id);
    const { data: campaignRows } = memberIds.length
      ? await supabaseAdmin
          .from("campaign_members")
          .select("user_id, campaign_id")
          .in("user_id", memberIds)
      : { data: [] as { user_id: string; campaign_id: string }[] };
    const campaignsByUser = new Map<string, string[]>();
    for (const row of campaignRows ?? []) {
      const list = campaignsByUser.get(row.user_id) ?? [];
      list.push(row.campaign_id);
      campaignsByUser.set(row.user_id, list);
    }

    return (members ?? []).map((m) => ({
      ...m,
      email: profileById.get(m.user_id)?.email ?? null,
      fullName: profileById.get(m.user_id)?.full_name ?? null,
      // Empty = full org access (Phase 1 design) — see the module-level note
      // above about `campaign_members` not yet being enforced.
      campaignIds: campaignsByUser.get(m.user_id) ?? [],
    }));
  });

/** Campaigns belonging to this client org, for the "campanhas liberadas"
 * picker — reads straight from the JSONB `clientes.data.campanhas[]`
 * (there's no normalized `campanhas` table, see `user_can_access_campanha`
 * in the Phase 1 migration for the same traversal pattern). */
export const listOrganizationCampaigns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ organizationId: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data: cliente, error } = await context.supabase
      .from("clientes")
      .select("data")
      .eq("organization_id", data.organizationId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const campanhas = ((cliente?.data as { campanhas?: unknown[] } | null)?.campanhas ?? []) as {
      id?: string;
      nome?: string;
    }[];
    return campanhas
      .filter((c): c is { id: string; nome?: string } => typeof c.id === "string")
      .map((c) => ({ id: c.id, nome: c.nome ?? c.id }));
  });

const OrgMemberIdInput = z.object({ organizationMemberId: z.string().uuid() });

export const resendClientInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => OrgMemberIdInput.parse(raw))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const membership = await loadMembershipWithOrg(supabaseAdmin, data.organizationMemberId);
    if (membership.status !== "invited") {
      throw new Error('Só é possível reenviar convite para acessos com status "Convidado".');
    }

    const tempPassword = generateTempPassword();
    const { error: pwErr } = await supabaseAdmin.auth.admin.updateUserById(membership.user_id, {
      password: tempPassword,
    });
    if (pwErr) throw new Error(pwErr.message);

    const invitedAt = new Date().toISOString();
    const { error: updErr } = await supabaseAdmin
      .from("organization_members")
      .update({ invited_at: invitedAt, updated_at: invitedAt })
      .eq("id", data.organizationMemberId);
    if (updErr) throw new Error(updErr.message);

    await logAccessAudit(supabaseAdmin, {
      actorUserId: context.userId,
      organizationId: membership.organization_id,
      action: "invite_resent",
      targetUserId: membership.user_id,
    });

    return { tempPassword };
  });

const UpdateRoleInput = z.object({
  organizationMemberId: z.string().uuid(),
  role: ClientRoleEnum,
});

/** Core logic behind `updateClientMemberRole`, extracted so it's directly
 * unit-testable without the `createServerFn`/request-middleware machinery —
 * mirrors the plain-function-under-a-server-fn pattern already used by
 * `hypito-tools.server.ts` (see `hypito-tools.server.test.ts`). The
 * defense-in-depth check below (never touch a membership belonging to a
 * non-'client' org, i.e. an internal team member) is the one CLAUDE.md
 * explicitly asks to be covered by a real test. */
export async function updateClientMemberRoleCore(
  supabaseAdmin: SupabaseClient<Database>,
  actorUserId: string,
  input: { organizationMemberId: string; role: "client_admin" | "client_member" | "client_viewer" },
) {
  const membership = await loadMembershipWithOrg(supabaseAdmin, input.organizationMemberId);

  // Defense-in-depth: never allow this endpoint to touch a membership in a
  // non-'client' (i.e. internal) organization, even though the UI never
  // offers that path — see CLAUDE.md, piece A, item 2.
  if (membership.organizations?.type !== "client") {
    throw new Error("Esta ação só é permitida para vínculos de organizações de clientes.");
  }

  const previousRole = membership.role;
  const { error } = await supabaseAdmin
    .from("organization_members")
    .update({ role: input.role, updated_at: new Date().toISOString() })
    .eq("id", input.organizationMemberId);
  if (error) throw new Error(error.message);

  await logAccessAudit(supabaseAdmin, {
    actorUserId,
    organizationId: membership.organization_id,
    action: "role_changed",
    targetUserId: membership.user_id,
    previousValue: { role: previousRole },
    newValue: { role: input.role },
  });

  return { ok: true };
}

export const updateClientMemberRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => UpdateRoleInput.parse(raw))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return updateClientMemberRoleCore(supabaseAdmin, context.userId, data);
  });

const UpdateCampaignsInput = z.object({
  organizationMemberId: z.string().uuid(),
  campaignIds: z.array(z.string()).default([]),
});

export const updateClientMemberCampaigns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => UpdateCampaignsInput.parse(raw))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const membership = await loadMembershipWithOrg(supabaseAdmin, data.organizationMemberId);

    const { data: currentRows, error: readErr } = await supabaseAdmin
      .from("campaign_members")
      .select("campaign_id")
      .eq("user_id", membership.user_id);
    if (readErr) throw new Error(readErr.message);
    const current = new Set((currentRows ?? []).map((r) => r.campaign_id));
    const next = new Set(data.campaignIds);

    const toInsert = [...next].filter((id) => !current.has(id));
    const toDelete = [...current].filter((id) => !next.has(id));

    if (toInsert.length > 0) {
      const { error } = await supabaseAdmin
        .from("campaign_members")
        .insert(toInsert.map((campaign_id) => ({ campaign_id, user_id: membership.user_id })));
      if (error) throw new Error(error.message);
    }
    if (toDelete.length > 0) {
      const { error } = await supabaseAdmin
        .from("campaign_members")
        .delete()
        .eq("user_id", membership.user_id)
        .in("campaign_id", toDelete);
      if (error) throw new Error(error.message);
    }

    await logAccessAudit(supabaseAdmin, {
      actorUserId: context.userId,
      organizationId: membership.organization_id,
      action: "campaigns_changed",
      targetUserId: membership.user_id,
      previousValue: { campaignIds: [...current] },
      newValue: { campaignIds: [...next] },
    });

    return { ok: true };
  });

async function setMembershipStatus(
  context: { supabase: SupabaseClient<Database>; userId: string },
  organizationMemberId: string,
  nextStatus: "active" | "suspended" | "removed",
  action: string,
) {
  await assertAdmin(context.supabase, context.userId);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const membership = await loadMembershipWithOrg(supabaseAdmin, organizationMemberId);

  const { error } = await supabaseAdmin
    .from("organization_members")
    .update({ status: nextStatus, updated_at: new Date().toISOString() })
    .eq("id", organizationMemberId);
  if (error) throw new Error(error.message);

  await logAccessAudit(supabaseAdmin, {
    actorUserId: context.userId,
    organizationId: membership.organization_id,
    action,
    targetUserId: membership.user_id,
    previousValue: { status: membership.status },
    newValue: { status: nextStatus },
  });

  return { ok: true };
}

export const suspendClientMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => OrgMemberIdInput.parse(raw))
  .handler(async ({ data, context }) =>
    setMembershipStatus(context, data.organizationMemberId, "suspended", "suspended"),
  );

export const reactivateClientMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => OrgMemberIdInput.parse(raw))
  .handler(async ({ data, context }) =>
    setMembershipStatus(context, data.organizationMemberId, "active", "reactivated"),
  );

export const removeClientAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => OrgMemberIdInput.parse(raw))
  .handler(async ({ data, context }) =>
    setMembershipStatus(context, data.organizationMemberId, "removed", "removed"),
  );
