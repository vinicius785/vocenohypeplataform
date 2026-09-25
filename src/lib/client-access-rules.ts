/**
 * Regras puras por trás de "Pessoas e acessos" — extraídas pra serem
 * testáveis sem Supabase. `client_access.functions.ts` chama estas funções
 * antes de qualquer escrita; nunca decide sozinho inline, pra nunca haver
 * dois lugares com a mesma regra podendo divergir.
 */

export type ClientAccessRole = "client_standard" | "client_approver" | "client_viewer";

export const CLIENT_ACCESS_ROLES = ["client_standard", "client_approver", "client_viewer"] as const;

/** Só `client_standard` administra pessoas/acessos — o mesmo papel que
 * `is_active_client_admin_of` (SQL) já reconhece como admin. Nunca
 * decidido só na interface: todo endpoint mutante chama o equivalente
 * desta checagem contra o papel resolvido no servidor. */
export function isClientAdminRole(role: string): boolean {
  return role === "client_standard";
}

export function isValidClientAccessRole(role: string): role is ClientAccessRole {
  return (CLIENT_ACCESS_ROLES as readonly string[]).includes(role);
}

type MemberForAdminCount = { role: string; status: string };

/** Quantos administradores ATIVOS existem — usado pelas duas proteções do
 * último admin abaixo. */
export function countActiveAdmins(members: MemberForAdminCount[]): number {
  return members.filter((m) => m.status === "active" && isClientAdminRole(m.role)).length;
}

/**
 * Nunca deixa a empresa sem administrador. Chamado antes de:
 * - alterar o papel de alguém que hoje é admin pra outro papel;
 * - remover o acesso de um admin.
 * `targetMemberId` é quem está sendo alterado/removido; `members` é a
 * lista COMPLETA (antes da mudança) da organização.
 */
export function wouldRemoveLastAdmin(
  members: (MemberForAdminCount & { id: string })[],
  targetMemberId: string,
): boolean {
  const target = members.find((m) => m.id === targetMemberId);
  if (!target || target.status !== "active" || !isClientAdminRole(target.role)) return false;
  return countActiveAdmins(members) <= 1;
}
