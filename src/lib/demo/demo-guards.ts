import { isDemoCliente } from "./demo-visibility";

/**
 * Guardas de EFEITOS EXTERNOS da Demo (e-mail, convite). Isomórfico e puro: sem Supabase
 * (o cliente é injetado). Ver docs/decisions/0004-etapa-0-relatorio.md §6 (S4/S5).
 */

/** Domínio reservado (RFC 2606): um endereço `.invalid` nunca é entregável. Toda demo que
 * precisar de e-mail usa um endereço assim — e `sendEmail` o recusa. */
export const DEMO_RESERVED_EMAIL_SUFFIX = ".invalid";

export const DEMO_EMAIL_BLOCKED_MESSAGE = "Destinatário de demonstração: envio bloqueado.";

/** O destinatário é de demonstração (domínio `.invalid`)? Ignora caixa e espaços. */
export function isDemoRecipient(email: string | null | undefined): boolean {
  if (typeof email !== "string") return false;
  const at = email.lastIndexOf("@");
  if (at < 0) return false;
  const domain = email
    .slice(at + 1)
    .trim()
    .toLowerCase();
  return domain === "invalid" || domain.endsWith(DEMO_RESERVED_EMAIL_SUFFIX);
}

type OrgClienteReader = {
  from: (table: "clientes") => {
    select: (cols: "data") => {
      eq: (
        col: "organization_id",
        value: string,
      ) => PromiseLike<{
        data: Array<{ data: unknown }> | null;
        error: { message: string } | null;
      }>;
    };
  };
};

export const DEMO_ORG_NO_INVITE_MESSAGE = "Não é possível convidar usuários para uma demonstração.";

/**
 * Recusa operações de acesso (convite) sobre a organização de uma demo. A organização da
 * demo é `suspended` e sem membros; esta checagem protege mesmo se um admin tentar convidar
 * alguém para ela por fora da interface (que já esconde a Demo).
 */
export async function assertOrganizationIsNotDemo(
  admin: OrgClienteReader,
  organizationId: string,
): Promise<void> {
  const { data, error } = await admin
    .from("clientes")
    .select("data")
    .eq("organization_id", organizationId);
  // Erro ao verificar NUNCA libera (fail-closed), sem vazar o detalhe.
  if (error) throw new Error("Não foi possível validar a organização.");
  if ((data ?? []).some((row) => isDemoCliente(row.data as { demoSessionId?: unknown }))) {
    throw new Error(DEMO_ORG_NO_INVITE_MESSAGE);
  }
}
