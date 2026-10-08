/**
 * Contexto operacional do card de influenciador na grade (triagem): UMA informação principal e,
 * no máximo, UMA secundária discreta. Tudo que não ajuda a decidir o próximo passo (NPS, contrato,
 * mensagens negativas como "não elegível") fica no detalhe ou no menu. Funções puras.
 */

export type CardPrimary =
  | { kind: "aguardando"; days: number }
  | { kind: "recusa"; motivo: string }
  | { kind: "producao"; publicadas: number; total: number };

export type CardSecondary =
  | { kind: "proxima"; data: string }
  | { kind: "valor"; amount: number; origem: "acordado" | "inscricao" };

export type CardContext = { primary: CardPrimary | null; secondary: CardSecondary | null };

export function pickCardContext(input: {
  /** Dias de espera da aprovação do cliente — já vem `null/0` quando não há alerta relevante. */
  overdueDays: number | null | undefined;
  motivoRecusa?: string | null;
  /** Só informar quando o influenciador é elegível a entregas (senão `null`). */
  producao: { publicadas: number; total: number } | null;
  proximaPostagem?: string | null;
  /** Total acordado/pago (só quando a seção de pagamentos está habilitada). */
  totalPago?: number | null;
  /** Valor informado na inscrição. */
  budget?: number | null;
}): CardContext {
  let primary: CardPrimary | null = null;
  if (input.overdueDays && input.overdueDays > 0) {
    primary = { kind: "aguardando", days: input.overdueDays };
  } else if (input.motivoRecusa?.trim()) {
    primary = { kind: "recusa", motivo: input.motivoRecusa.trim() };
  } else if (input.producao && input.producao.total > 0) {
    primary = { kind: "producao", ...input.producao };
  }

  let secondary: CardSecondary | null = null;
  if (input.proximaPostagem) secondary = { kind: "proxima", data: input.proximaPostagem };
  else if (input.totalPago && input.totalPago > 0)
    secondary = { kind: "valor", amount: input.totalPago, origem: "acordado" };
  else if (input.budget && input.budget > 0)
    secondary = { kind: "valor", amount: input.budget, origem: "inscricao" };

  return { primary, secondary };
}
