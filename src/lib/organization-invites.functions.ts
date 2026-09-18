/**
 * Client invite (backend function only, minimal admin UI this phase) — see
 * CLAUDE.md, "Phase 1 of a large, high-risk auth/authorization overhaul",
 * section 5. Mirrors `team.functions.ts`'s `createTeamMember`: same
 * temp-password-out-of-band pattern (no transactional email this phase,
 * decision #1), same `assertAdmin` gate.
 *
 * OUT OF SCOPE this phase (left for phase 2, see CLAUDE.md "Known
 * incomplete / in-progress work" once this lands): reenviar convite,
 * alterar função, alterar campanhas liberadas, suspender, reativar,
 * remover — this file only proves invite-creation works end-to-end.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { z } from "zod";

const ClientRoleEnum = z.enum(["client_admin", "client_member", "client_viewer"]);

async function assertAdmin(supabase: SupabaseClient<Database>, userId: string) {
  const { data, error } = await supabase.rpc("is_admin", { _user_id: userId });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Apenas administradores podem convidar usuários de clientes.");
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

    return (members ?? []).map((m) => ({
      ...m,
      email: profileById.get(m.user_id)?.email ?? null,
      fullName: profileById.get(m.user_id)?.full_name ?? null,
    }));
  });
