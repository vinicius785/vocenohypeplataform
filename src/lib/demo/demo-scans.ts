import { isDemoCliente } from "./demo-visibility";

/**
 * Varreduras de `clientes` feitas pelas funções PÚBLICAS (por token), extraídas para serem
 * testáveis. Todas PULAM clientes de demonstração: nenhum token público de produção
 * (`publicToken`, `signupToken`, link de NPS) pode resolver para uma demo — a Demo tem seu
 * próprio acesso, por `/demo/$token`, com regras próprias de expiração e revogação.
 *
 * Para clientes reais o comportamento é exatamente o de antes.
 */

type ClienteRow<D> = { id: string; data: D };

/** Cliente cujo `publicToken` (portal por token) é igual a `token`. */
export function findClienteRowByPublicToken<
  D extends { publicToken?: string | null; demoSessionId?: unknown },
>(rows: ReadonlyArray<ClienteRow<D>>, token: string): ClienteRow<D> | null {
  for (const row of rows) {
    if (isDemoCliente(row.data)) continue;
    if (row.data.publicToken === token) return row;
  }
  return null;
}

type CampanhaWithSignup = { signupToken?: string | null };
type CampanhaWithId = { id: string };

type CampanhaOf<D extends { campanhas?: ReadonlyArray<unknown> | undefined }> = NonNullable<
  D["campanhas"]
>[number];

/** Campanha cujo `signupToken` (inscrição pública de influenciador) é igual a `token`. */
export function findCampanhaBySignupTokenInRows<
  D extends { campanhas?: ReadonlyArray<CampanhaWithSignup> | undefined; demoSessionId?: unknown },
>(
  rows: ReadonlyArray<ClienteRow<D>>,
  token: string,
): { clienteId: string; cliente: D; campanha: CampanhaOf<D> } | null {
  for (const row of rows) {
    if (isDemoCliente(row.data)) continue;
    const campanha = row.data.campanhas?.find((c) => c.signupToken === token);
    if (campanha)
      return { clienteId: row.id, cliente: row.data, campanha: campanha as CampanhaOf<D> };
  }
  return null;
}

/** Campanha (de cliente real) com o id informado — usada pelo link público de NPS. */
export function findCampanhaByIdInRows<
  D extends { campanhas?: ReadonlyArray<CampanhaWithId> | undefined; demoSessionId?: unknown },
>(rows: ReadonlyArray<{ data: D }>, campanhaId: string): CampanhaOf<D> | null {
  for (const row of rows) {
    if (isDemoCliente(row.data)) continue;
    const campanha = row.data.campanhas?.find((c) => c.id === campanhaId);
    if (campanha) return campanha as CampanhaOf<D>;
  }
  return null;
}

export type ClientePickerOption = {
  id: string;
  empresa: string;
  email: string;
  responsavel: string;
};

/**
 * Opções do seletor de destinatários de e-mail (Campanhas de e-mail → clientes). Só clientes
 * REAIS com e-mail: a demonstração nunca é destinatário.
 */
export function toClientePickerOptions(
  rows: ReadonlyArray<{ id: string; data: unknown }>,
): ClientePickerOption[] {
  return rows
    .filter((row) => !isDemoCliente(row.data as { demoSessionId?: unknown }))
    .map((row) => {
      const d = row.data as Record<string, unknown>;
      return {
        id: row.id,
        empresa: (d.empresa as string) ?? "",
        email: (d.email as string) ?? "",
        responsavel: (d.responsavel as string) ?? "",
      };
    })
    .filter((c) => !!c.email);
}
