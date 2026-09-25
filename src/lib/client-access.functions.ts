/**
 * "Pessoas e acessos" (Portal V2 → Configurações) — autoatendimento pro
 * PRÓPRIO cliente conceder/gerenciar acesso da sua empresa, distinto de
 * `organization-invites.functions.ts` (que é a equipe INTERNA convidando
 * um cliente, gated por `assertAdmin` = admin interno). Aqui o gate é
 * "sou `client_standard` ATIVO desta organização" — o mesmo papel que
 * `is_active_client_admin_of` (SQL) já reconhece como admin.
 *
 * Reaproveita a estrutura de dados existente por inteiro: `organization_members`
 * já é a relação usuário↔cliente↔papel↔status (`invited`/`active`/`removed`)
 * — nenhuma tabela nova de convite. "Convite pendente" é literalmente uma
 * linha com `status = 'invited'`; aceitar já é o próprio login funcionar
 * (ver `accept-invite.functions.ts`, reaproveitado sem mudança). O "link
 * seguro" do e-mail é gerado pelo próprio Supabase Auth
 * (`auth.admin.generateLink`) — nunca um token nosso guardado em texto
 * puro.
 *
 * Toda função aqui: (1) exige sessão real, (2) resolve a organização
 * ATIVA do chamador via `resolveActiveClientOrganization` (nunca confia
 * num `organizationId`/`clientId` vindo do corpo da requisição), (3)
 * confirma `client_standard` ativo antes de qualquer leitura/escrita de
 * outro membro, (4) confirma que o alvo pertence à MESMA organização
 * antes de alterar/remover, (5) aplica a proteção do último admin
 * (`client-access-rules.ts`) antes de rebaixar/remover, (6) registra
 * auditoria via `writeAuditLog` (mesma tabela `access_audit_log` já
 * usada pelo resto do app).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveActiveClientOrganization } from "@/lib/portal-auth.functions";
import { findClienteByOrganizationId } from "@/lib/cliente-link.functions";
import {
  isClientAdminRole,
  isValidClientAccessRole,
  wouldRemoveLastAdmin,
  type ClientAccessRole,
} from "@/lib/client-access-rules";

type DB = SupabaseClient<Database>;
type Ctx = { supabase: DB; userId: string };

function assertClientAdmin(role: string): void {
  if (!isClientAdminRole(role)) {
    throw new Error("Só administradores podem gerenciar pessoas e acessos.");
  }
}

/** Resolve a org ativa do chamador E confirma que é admin dela — usado no
 * início de toda mutação/leitura desta feature. */
async function requireCallerIsClientAdmin(ctx: Ctx) {
  const { organizationId, role } = await resolveActiveClientOrganization(ctx);
  assertClientAdmin(role);
  return { organizationId };
}

const ROLE_LABEL: Record<ClientAccessRole, string> = {
  client_standard: "Administrador",
  client_approver: "Aprovador",
  client_viewer: "Visualizador",
};

async function sendInviteEmail(opts: {
  to: string;
  clienteName: string;
  inviterName: string;
  role: ClientAccessRole;
  actionLink: string;
}) {
  const { sendEmail } = await import("@/lib/email-provider.server");
  const roleLabel = ROLE_LABEL[opts.role];
  const html = `
    <p>${opts.inviterName} convidou você para acessar o portal da ${opts.clienteName} na Você no Hype.</p>
    <p>Seu nível de acesso será: <strong>${roleLabel}</strong>.</p>
    <p><a href="${opts.actionLink}">Aceitar convite</a></p>
    <p style="color:#6b6862;font-size:12px;">Este convite expira em 7 dias.</p>
  `;
  const result = await sendEmail({
    to: opts.to,
    subject: `Você recebeu acesso ao portal da ${opts.clienteName}`,
    html,
  });
  if (!result.ok) console.error("[client-access] falha ao enviar e-mail de convite", result.error);
}

/** Lista membros + convites pendentes da organização ativa do chamador —
 * só campos seguros pro frontend (nunca IDs de auth crus além do
 * necessário pra ação, nunca token). */
export const listClientAccessMembers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { organizationId } = await requireCallerIsClientAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: members, error } = await supabaseAdmin
      .from("organization_members")
      .select("id, user_id, role, status, invited_by, invited_at, accepted_at, last_access_at")
      .eq("organization_id", organizationId)
      .neq("status", "removed")
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);

    const userIds = Array.from(
      new Set(
        (members ?? []).flatMap((m) => [m.user_id, m.invited_by].filter((v): v is string => !!v)),
      ),
    );
    const { data: profiles } = userIds.length
      ? await supabaseAdmin
          .from("profiles")
          .select("id, full_name, email, photo_url")
          .in("id", userIds)
      : { data: [] };
    const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));

    return (members ?? []).map((m) => {
      const profile = profileById.get(m.user_id);
      const inviter = m.invited_by ? profileById.get(m.invited_by) : undefined;
      return {
        id: m.id,
        name: profile?.full_name || null,
        email: profile?.email ?? "",
        photoUrl: profile?.photo_url ?? null,
        role: m.role,
        status: m.status,
        invitedByName: inviter?.full_name || null,
        invitedAt: m.invited_at,
        acceptedAt: m.accepted_at,
        lastAccessAt: m.last_access_at,
      };
    });
  });

const InviteMemberInput = z.object({
  email: z.string().trim().toLowerCase().email().max(255),
  role: z.enum(["client_standard", "client_approver", "client_viewer"]),
});

export const inviteClientAccessMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => InviteMemberInput.parse(raw))
  .handler(async ({ data, context }) => {
    const { organizationId } = await requireCallerIsClientAdmin(context);
    if (!isValidClientAccessRole(data.role)) throw new Error("Papel inválido.");

    const { checkRateLimit } = await import("@/lib/rate-limit.server");
    const allowed = await checkRateLimit(`client-invite:${context.userId}`, 20, 60 * 60);
    if (!allowed) throw new Error("Muitas tentativas. Tente novamente em alguns minutos.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: callerProfile } = await supabaseAdmin
      .from("profiles")
      .select("email, full_name")
      .eq("id", context.userId)
      .maybeSingle();
    if (callerProfile?.email?.toLowerCase() === data.email) {
      throw new Error("Você já tem acesso — não é possível convidar a si mesmo.");
    }

    const foundCliente = await findClienteByOrganizationId(organizationId);
    if (!foundCliente) throw new Error("Cliente não encontrado para esta organização.");

    const { data: existingUsersPage, error: listErr } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });
    if (listErr) throw new Error(listErr.message);
    const existingAuthUser = existingUsersPage?.users.find(
      (u) => u.email?.toLowerCase() === data.email,
    );

    const { getAppUrl } = await import("@/lib/google-oauth-config");
    const appUrl = getAppUrl();
    const inviterName = callerProfile?.full_name || "Um administrador";

    if (existingAuthUser) {
      const { data: existingLink } = await supabaseAdmin
        .from("organization_members")
        .select("id, status")
        .eq("organization_id", organizationId)
        .eq("user_id", existingAuthUser.id)
        .maybeSingle();
      if (existingLink && existingLink.status !== "removed") {
        throw new Error("Esta pessoa já tem acesso ou um convite pendente.");
      }

      if (existingLink) {
        const { error: updateErr } = await supabaseAdmin
          .from("organization_members")
          .update({
            status: "invited",
            role: data.role,
            invited_by: context.userId,
            invited_at: new Date().toISOString(),
            removed_at: null,
          })
          .eq("id", existingLink.id);
        if (updateErr) throw new Error(updateErr.message);
      } else {
        const { error: insertErr } = await supabaseAdmin.from("organization_members").insert({
          organization_id: organizationId,
          user_id: existingAuthUser.id,
          role: data.role,
          status: "invited",
          invited_by: context.userId,
          invited_at: new Date().toISOString(),
        });
        if (insertErr) throw new Error(insertErr.message);
      }

      const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
        type: "magiclink",
        email: data.email,
        options: { redirectTo: `${appUrl}/portal-v2/inicio` },
      });
      if (linkErr) console.error("[client-access] falha ao gerar link de convite", linkErr.message);
      if (linkData?.properties?.action_link) {
        await sendInviteEmail({
          to: data.email,
          clienteName: foundCliente.cliente.empresa,
          inviterName,
          role: data.role,
          actionLink: linkData.properties.action_link,
        });
      }
    } else {
      const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
        type: "invite",
        email: data.email,
        options: { redirectTo: `${appUrl}/criar-senha` },
      });
      if (linkErr || !linkData?.user) {
        throw new Error(linkErr?.message ?? "Falha ao criar convite.");
      }

      const { error: insertErr } = await supabaseAdmin.from("organization_members").insert({
        organization_id: organizationId,
        user_id: linkData.user.id,
        role: data.role,
        status: "invited",
        invited_by: context.userId,
        invited_at: new Date().toISOString(),
      });
      if (insertErr) throw new Error(insertErr.message);

      if (linkData.properties?.action_link) {
        await sendInviteEmail({
          to: data.email,
          clienteName: foundCliente.cliente.empresa,
          inviterName,
          role: data.role,
          actionLink: linkData.properties.action_link,
        });
      }
    }

    const { writeAuditLog } = await import("@/lib/audit-log.functions");
    await writeAuditLog(supabaseAdmin, {
      actorUserId: context.userId,
      organizationId,
      action: "client_invite_sent",
      newValue: { email: data.email, role: data.role },
    });

    return { ok: true };
  });

const MemberIdInput = z.object({ memberId: z.string().uuid() });

/** Carrega a linha do membro e CONFIRMA que pertence à organização ATIVA
 * do chamador — nunca opera sobre um `memberId` de outro cliente, mesmo
 * que o id em si seja um UUID válido de outra organização. */
async function loadMemberInCallerOrg(
  supabaseAdmin: SupabaseClient<Database>,
  organizationId: string,
  memberId: string,
) {
  const { data, error } = await supabaseAdmin
    .from("organization_members")
    .select("id, organization_id, user_id, role, status")
    .eq("id", memberId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || data.organization_id !== organizationId) {
    throw new Error("Vínculo não encontrado nesta organização.");
  }
  return data;
}

export const resendClientAccessInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => MemberIdInput.parse(raw))
  .handler(async ({ data, context }) => {
    const { organizationId } = await requireCallerIsClientAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const member = await loadMemberInCallerOrg(supabaseAdmin, organizationId, data.memberId);
    if (member.status !== "invited") throw new Error("Este convite não está mais pendente.");

    const { checkRateLimit } = await import("@/lib/rate-limit.server");
    const allowed = await checkRateLimit(`client-invite-resend:${member.id}`, 1, 45);
    if (!allowed) {
      throw new Error("Aguarde um pouco antes de reenviar este convite novamente.");
    }

    const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(member.user_id);
    const email = authUser?.user?.email;
    if (!email) throw new Error("Não foi possível localizar o e-mail deste convite.");

    const foundCliente = await findClienteByOrganizationId(organizationId);
    if (!foundCliente) throw new Error("Cliente não encontrado para esta organização.");

    const { data: callerProfile } = await supabaseAdmin
      .from("profiles")
      .select("full_name")
      .eq("id", context.userId)
      .maybeSingle();

    const { getAppUrl } = await import("@/lib/google-oauth-config");
    const appUrl = getAppUrl();
    // `email_confirm` pendente (usuário nunca fez login) → link "invite"
    // (primeiro acesso); já confirmado → "magiclink" (já existe senha).
    const linkType = authUser?.user?.email_confirmed_at ? "magiclink" : "invite";
    const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
      type: linkType,
      email,
      options: {
        redirectTo: linkType === "invite" ? `${appUrl}/criar-senha` : `${appUrl}/portal-v2/inicio`,
      },
    });
    if (linkErr || !linkData?.properties?.action_link) {
      throw new Error(linkErr?.message ?? "Falha ao gerar novo link de convite.");
    }

    await sendInviteEmail({
      to: email,
      clienteName: foundCliente.cliente.empresa,
      inviterName: callerProfile?.full_name || "Um administrador",
      role: member.role as ClientAccessRole,
      actionLink: linkData.properties.action_link,
    });

    const now = new Date().toISOString();
    await supabaseAdmin
      .from("organization_members")
      .update({ invited_by: context.userId, invited_at: now, updated_at: now })
      .eq("id", member.id);

    const { writeAuditLog } = await import("@/lib/audit-log.functions");
    await writeAuditLog(supabaseAdmin, {
      actorUserId: context.userId,
      organizationId,
      action: "client_invite_resent",
      targetUserId: member.user_id,
    });

    return { ok: true, email };
  });

export const cancelClientAccessInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => MemberIdInput.parse(raw))
  .handler(async ({ data, context }) => {
    const { organizationId } = await requireCallerIsClientAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const member = await loadMemberInCallerOrg(supabaseAdmin, organizationId, data.memberId);
    if (member.status !== "invited") throw new Error("Este convite não está mais pendente.");

    const now = new Date().toISOString();
    const { error } = await supabaseAdmin
      .from("organization_members")
      .update({ status: "removed", removed_at: now, updated_at: now })
      .eq("id", member.id);
    if (error) throw new Error(error.message);

    const { writeAuditLog } = await import("@/lib/audit-log.functions");
    await writeAuditLog(supabaseAdmin, {
      actorUserId: context.userId,
      organizationId,
      action: "client_invite_cancelled",
      targetUserId: member.user_id,
    });

    return { ok: true };
  });

const UpdateRoleInput = z.object({
  memberId: z.string().uuid(),
  role: z.enum(["client_standard", "client_approver", "client_viewer"]),
});

export const updateClientAccessMemberRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => UpdateRoleInput.parse(raw))
  .handler(async ({ data, context }) => {
    const { organizationId } = await requireCallerIsClientAdmin(context);
    if (!isValidClientAccessRole(data.role)) throw new Error("Papel inválido.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const member = await loadMemberInCallerOrg(supabaseAdmin, organizationId, data.memberId);

    const { data: allMembers, error: allErr } = await supabaseAdmin
      .from("organization_members")
      .select("id, role, status")
      .eq("organization_id", organizationId);
    if (allErr) throw new Error(allErr.message);

    if (member.role !== data.role && wouldRemoveLastAdmin(allMembers ?? [], member.id)) {
      throw new Error("Adicione outro administrador antes de alterar este acesso.");
    }

    const previousRole = member.role;
    const { error } = await supabaseAdmin
      .from("organization_members")
      .update({ role: data.role, updated_at: new Date().toISOString() })
      .eq("id", member.id);
    if (error) throw new Error(error.message);

    const { writeAuditLog } = await import("@/lib/audit-log.functions");
    await writeAuditLog(supabaseAdmin, {
      actorUserId: context.userId,
      organizationId,
      action: "client_role_changed",
      targetUserId: member.user_id,
      previousValue: { role: previousRole },
      newValue: { role: data.role },
    });

    return { ok: true };
  });

export const removeClientAccessMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => MemberIdInput.parse(raw))
  .handler(async ({ data, context }) => {
    const { organizationId } = await requireCallerIsClientAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const member = await loadMemberInCallerOrg(supabaseAdmin, organizationId, data.memberId);
    if (member.status === "removed") throw new Error("Este acesso já foi removido.");

    const { data: allMembers, error: allErr } = await supabaseAdmin
      .from("organization_members")
      .select("id, role, status")
      .eq("organization_id", organizationId);
    if (allErr) throw new Error(allErr.message);

    if (wouldRemoveLastAdmin(allMembers ?? [], member.id)) {
      throw new Error("Adicione outro administrador antes de remover este acesso.");
    }

    const now = new Date().toISOString();
    // Nunca exclui `auth.users`/`profiles` — só encerra o VÍNCULO com esta
    // organização. Comentários/decisões/histórico ficam intactos (não
    // referenciam `organization_members`, referenciam o usuário/cliente
    // diretamente).
    const { error } = await supabaseAdmin
      .from("organization_members")
      .update({ status: "removed", removed_at: now, updated_at: now })
      .eq("id", member.id);
    if (error) throw new Error(error.message);

    const { writeAuditLog } = await import("@/lib/audit-log.functions");
    await writeAuditLog(supabaseAdmin, {
      actorUserId: context.userId,
      organizationId,
      action: "client_access_removed",
      targetUserId: member.user_id,
      previousValue: { role: member.role, status: member.status },
    });

    return { ok: true };
  });
