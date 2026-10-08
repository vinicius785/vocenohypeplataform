type ClienteBasics = { responsavel?: string; clienteDesde?: string };
import type { Campaign } from "@/components/VincularCampanhaDialog";
import { campanhaStatus } from "@/components/campanhas/campanha-ui";
import { dueBucket, kpiTotals, todayISO } from "@/lib/financeiro-entries";

/** Regras puras dos núcleos da Central do Cliente — só recortam/agregam dado que já existe. */

type FinanceEntry = Parameters<typeof kpiTotals>[0][number];

export type CampanhasOverview = { total: number; ativas: number };
export function campanhasOverview(campanhas: readonly Campaign[]): CampanhasOverview {
  return {
    total: campanhas.length,
    ativas: campanhas.filter((c) => campanhaStatus(c) === "active").length,
  };
}

export type FinanceOverview =
  | { hasMovement: false }
  | { hasMovement: true; aReceber: number; vencido: number };

/** `vencido` = só RECEITA a receber já vencida (custos a pagar não são "dívida do cliente"). */
export function financeOverview(
  entries: readonly FinanceEntry[],
  hoje: string = todayISO(),
): FinanceOverview {
  if (entries.length === 0) return { hasMovement: false };
  const totals = kpiTotals([...entries]);
  const vencido = entries
    .filter(
      (e) =>
        e.kind === "receita" &&
        e.status === "a_receber" &&
        dueBucket(e.vencimento, hoje) === "vencido",
    )
    .reduce((s, e) => s + e.amount, 0);
  return { hasMovement: true, aReceber: totals.aReceber, vencido };
}

/** Quantas campanhas mostrar antes de "Ver todas". */
export const CAMPANHAS_INICIAIS = 5;
export function visibleCampanhas<T>(items: readonly T[], expanded: boolean): T[] {
  return expanded ? [...items] : items.slice(0, CAMPANHAS_INICIAIS);
}

/** O bloco Comercial só existe para Captação E quando há ao menos um dado preenchido. */
export function hasComercialData(c: {
  proximoPasso?: string;
  previsaoFechamento?: string;
  observacaoNegociacao?: string;
}): boolean {
  return Boolean(
    c.proximoPasso?.trim() || c.previsaoFechamento?.trim() || c.observacaoNegociacao?.trim(),
  );
}

/** "Responsável · Cliente desde 12/03/2025" — só os pedaços que existem. */
export function clienteSubtitle(c: Pick<ClienteBasics, "responsavel" | "clienteDesde">): string {
  const parts: string[] = [];
  if (c.responsavel?.trim()) parts.push(c.responsavel.trim());
  if (c.clienteDesde) {
    const d = new Date(c.clienteDesde);
    if (!Number.isNaN(d.getTime())) parts.push(`Cliente desde ${d.toLocaleDateString("pt-BR")}`);
  }
  return parts.join(" · ");
}
