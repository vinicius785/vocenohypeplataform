/**
 * Pure PT-BR label mapping for `access_audit_log.action` values, shared
 * between `AuditLogTab.tsx` (Configurações → global log) and the new
 * per-client "Histórico" section on `/clientes/$id`
 * (`ClienteDetailPage.tsx`). Extracted so both surfaces show the exact same
 * human label for the same action string, and so the mapping itself is unit
 * testable without pulling in either React component.
 *
 * Every action string actually written by `organization-invites.functions.ts`
 * and `clientes.functions.ts` as of this pass is covered — see those files'
 * `logAccessAudit`/`writeAuditLog` call sites for the source of truth.
 */
export const ACCESS_AUDIT_ACTION_LABELS: Record<string, string> = {
  login_success: "Login bem-sucedido",
  login_failed: "Login falhou",
  logout: "Logout",
  environment_switch: "Troca de ambiente",
  token_deactivated: "Link antigo desativado",
  invite_sent: "Convite enviado",
  invite_sent_existing_account: "Convite enviado (conta existente vinculada)",
  invite_resent: "Convite reenviado",
  invite_revoked: "Convite revogado",
  role_changed: "Função alterada",
  campaigns_changed: "Campanhas liberadas alteradas",
  suspended: "Acesso suspenso",
  reactivated: "Acesso reativado",
  removed: "Acesso removido",
  member_suspended: "Membro suspenso",
  member_reactivated: "Membro reativado",
  member_removed: "Membro removido",
  role_migration_v2: "Função migrada (padrão/visualização)",
  mfa_enrolled: "MFA ativado",
  mfa_unenrolled: "MFA desativado",
};

/** Falls back to the raw action string (never hides an unmapped event). */
export function accessAuditActionLabel(action: string): string {
  return ACCESS_AUDIT_ACTION_LABELS[action] ?? action;
}

/**
 * Cosmetic-only "Convite expirado" computation — NOT enforced anywhere on
 * the server (`organization_members.status` never transitions to anything
 * but invited/active/suspended/removed). Purely a display label: a member
 * still `status === 'invited'` after `expiryDays` (default 7) shows this
 * label in the UI instead of the raw "Convidado" one. See CLAUDE.md /
 * PortalAccessSection.tsx for the same note at the call site.
 */
export function isInviteCosmeticallyExpired(
  member: { status: string; invited_at: string | null },
  now: Date = new Date(),
  expiryDays = 7,
): boolean {
  if (member.status !== "invited" || !member.invited_at) return false;
  const invitedAt = new Date(member.invited_at).getTime();
  if (Number.isNaN(invitedAt)) return false;
  const ageMs = now.getTime() - invitedAt;
  return ageMs > expiryDays * 24 * 60 * 60 * 1000;
}
