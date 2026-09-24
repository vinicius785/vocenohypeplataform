/**
 * Ativação da V2 — este repositório não tem nenhuma infra de feature flag
 * (confirmado: sem GrowthBook/LaunchDarkly em `package.json`), então esta é
 * uma trava simples e explícita até uma real ser adotada:
 *
 * - Em desenvolvimento: sempre visível (facilita homologar).
 * - Em produção: só pra quem é `client_admin` do cliente ativo — nunca
 *   exposta a `client_member`/`client_viewer` até a V2 ser validada e a
 *   troca definitiva ser decidida (ver CLAUDE.md desta função).
 *
 * A V1 (`/portal-app`, `/portal/$token`) nunca é desligada por este flag —
 * ele só controla se `/portal-v2` responde ou redireciona de volta.
 */
export function isClientPortalV2Enabled(role: string | undefined): boolean {
  if (import.meta.env.DEV) return true;
  return role === "client_admin";
}
