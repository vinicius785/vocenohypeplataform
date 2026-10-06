import type { HistoricoEvento } from "@/lib/entrega-historico";
import {
  type Entry,
  type FinanceiroAnexo,
  entryAnexos,
  formatIsoDate,
  isPartiallyPaid,
  remainingBalance,
} from "@/lib/financeiro-entries";

/** Regras de apresentação do detalhe de um lançamento (só leitura do que já existe no `Entry`). */

/** Linha de situação logo abaixo do valor: sempre UMA frase com a data que importa. */
export function statusLine(e: Pick<Entry, "kind" | "status" | "vencimento" | "payment">): string {
  const pago = e.kind === "receita" ? "Recebido" : "Pago";
  if (e.status === "pago" || e.status === "recebido") {
    return e.payment?.pagamento ? `${pago} em ${formatIsoDate(e.payment.pagamento)}` : pago;
  }
  if (e.status === "cancelado") return "Cancelado";
  if (e.status === "vencido") return `Venceu em ${formatIsoDate(e.vencimento)}`;
  return `Vencimento em ${formatIsoDate(e.vencimento)}`;
}

export type EntryPhase = "aberto" | "vencido" | "quitado" | "cancelado";
export const entryPhase = (e: Pick<Entry, "status">): EntryPhase =>
  e.status === "pago" || e.status === "recebido"
    ? "quitado"
    : e.status === "cancelado"
      ? "cancelado"
      : e.status === "vencido"
        ? "vencido"
        : "aberto";

/** Há ação de quitar? (nada de "marcar como pago" em lançamento já terminal). */
export const canMarkPaid = (e: Pick<Entry, "status">): boolean =>
  entryPhase(e) === "aberto" || entryPhase(e) === "vencido";

/** Pagamento/recebimento parcial: o que já entrou e o saldo. `null` quando não é parcial. */
export function partialSummary(e: Entry): { paid: number; remaining: number } | null {
  return isPartiallyPaid(e)
    ? { paid: e.payment?.paidAmount ?? 0, remaining: remainingBalance(e) }
    : null;
}

export type DocGroups = {
  notaFiscal: FinanceiroAnexo[];
  comprovante: FinanceiroAnexo[];
};
export function docGroups(e: Pick<Entry, "invoice" | "anexos">): DocGroups {
  const all = entryAnexos(e);
  return {
    notaFiscal: all.filter((a) => a.categoria === "Nota fiscal"),
    comprovante: all.filter((a) => a.categoria === "Comprovante"),
  };
}

const noon = (iso: string) => (iso.includes("T") ? iso : `${iso}T12:00:00`);

/** Linha do tempo do lançamento — só o que o sistema realmente registra: pagamento, cobranças,
 * anexos e (para pagamento a influenciador) a atividade financeira dele. */
export function entryHistorico(
  e: Entry,
  influActivity: { id: string; action: string; author: string; createdAt: string }[] = [],
): HistoricoEvento[] {
  const out: HistoricoEvento[] = [];
  if (e.payment?.pagamento) {
    out.push({
      id: "pagamento",
      at: noon(e.payment.pagamento),
      autor: "Financeiro",
      kind: "outro",
      semHora: true,
      texto:
        (e.kind === "receita" ? "registrou o recebimento" : "registrou o pagamento") +
        (e.payment.paymentMethod ? ` via ${e.payment.paymentMethod}` : ""),
    });
  }
  (e.cobrancaHistorico ?? []).forEach((c, i) =>
    out.push({
      id: `cobranca-${i}`,
      at: noon(c.data),
      autor: "Financeiro",
      kind: "outro",
      semHora: true,
      texto: `registrou contato de cobrança${c.nota ? `: ${c.nota}` : ""}`,
    }),
  );
  for (const a of entryAnexos(e)) {
    if (!a.criadoEm) continue;
    out.push({
      id: `anexo-${a.id}`,
      at: noon(a.criadoEm),
      autor: "Financeiro",
      kind: "anexo",
      semHora: true,
      texto: `anexou ${a.categoria === "Nota fiscal" ? "a nota fiscal" : "o comprovante"} ${a.nome}`,
    });
  }
  for (const a of influActivity)
    out.push({
      id: `inf-${a.id}`,
      at: a.createdAt,
      autor: a.author,
      kind: "outro",
      texto: a.action,
    });
  return out.sort((a, b) => b.at.localeCompare(a.at));
}
