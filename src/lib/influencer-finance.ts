import {
  normalizePagamento,
  pagamentoCashValue,
  parseMoney,
  type BankInfo,
  type PagamentoEntrega,
} from "@/lib/influencer-model";

/**
 * Regras PURAS do financeiro do influenciador na campanha. Separa, sem criar dado novo:
 *  - REMUNERAÇÃO = o que foi combinado (`pagamento.tipos/config`);
 *  - PAGAMENTO = o que aconteceu com esse valor. Há DUAS camadas reais no sistema:
 *      1. a SOLICITAÇÃO (`pagamento.aprovacao` pendente/aceito/recusado) — "Aceitar" é a aprovação
 *         que lança a despesa no Financeiro (só `aceito` vira lançamento `inf:<campanha>:<influ>`);
 *      2. a EXECUÇÃO, que vive no módulo Financeiro (`financeiro_status_overrides`: pago/cancelado,
 *         data do pagamento). Aqui só se LÊ essa execução;
 *  - DADOS PARA PAGAMENTO = `bank`;  - CONTRATO = `contrato`.
 */
export type PaymentStateKey =
  | "nao_iniciado"
  | "pendente"
  | "agendado"
  | "vencido"
  | "pago"
  | "recusado"
  | "cancelado";

export const PAYMENT_STATE_LABEL: Record<PaymentStateKey, string> = {
  nao_iniciado: "Não iniciado",
  pendente: "Pendente",
  agendado: "Agendado",
  vencido: "Vencido",
  pago: "Pago",
  recusado: "Recusado",
  cancelado: "Cancelado",
};

/** O que o módulo Financeiro sabe sobre o lançamento deste influenciador (se tiver acesso). */
export type PaymentExecution = {
  status?: "a_pagar" | "pago" | "vencido" | "cancelado" | string;
  /** Data (YYYY-MM-DD) em que o pagamento foi confirmado. */
  paidOn?: string;
};

export type PaymentState = {
  key: PaymentStateKey;
  label: string;
  /** Valor em caixa (0 quando só há permuta/comissão). */
  amount: number;
  /** Vencimento (YYYY-MM-DD) quando existe. */
  due?: string;
  paidOn?: string;
};

export function hasRemuneracao(p?: PagamentoEntrega): boolean {
  const n = normalizePagamento(p);
  return !!n && n.tipos.length > 0;
}

export function paymentState(
  pagamento: PagamentoEntrega | undefined,
  execution: PaymentExecution | undefined,
  todayIso: string,
): PaymentState {
  const p = normalizePagamento(pagamento);
  if (!p || p.tipos.length === 0) {
    return { key: "nao_iniciado", label: PAYMENT_STATE_LABEL.nao_iniciado, amount: 0 };
  }
  const amount = pagamentoCashValue(p);
  const base = { amount, due: p.data };
  if (p.aprovacao === "recusado")
    return { key: "recusado", label: PAYMENT_STATE_LABEL.recusado, ...base };
  if (p.aprovacao === "pendente")
    return { key: "pendente", label: PAYMENT_STATE_LABEL.pendente, ...base };
  // aprovado: a execução manda
  if (execution?.status === "pago") {
    return { key: "pago", label: PAYMENT_STATE_LABEL.pago, ...base, paidOn: execution.paidOn };
  }
  if (execution?.status === "cancelado") {
    return { key: "cancelado", label: PAYMENT_STATE_LABEL.cancelado, ...base };
  }
  if (p.data && p.data < todayIso) {
    return { key: "vencido", label: PAYMENT_STATE_LABEL.vencido, ...base };
  }
  return { key: "agendado", label: PAYMENT_STATE_LABEL.agendado, ...base };
}

/* ---------------- Remuneração ---------------- */

export type RemuneracaoSummary = {
  /** Soma do que sai em caixa; `null` quando não há valor monetário (só permuta/comissão). */
  total: number | null;
  tipoLabel: string;
  /** Linhas de detalhamento por modalidade. */
  lines: { label: string; value: string }[];
};

const brl = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
export { brl as formatBRLValue };

export function remuneracaoSummary(
  pagamento: PagamentoEntrega | undefined,
): RemuneracaoSummary | null {
  const p = normalizePagamento(pagamento);
  if (!p || p.tipos.length === 0) return null;
  const lines: RemuneracaoSummary["lines"] = [];
  for (const t of p.tipos) {
    const c = p.config[t] ?? {};
    if (t === "Valor") lines.push({ label: "Valor fechado", value: brl(parseMoney(c.valor)) });
    else if (t === "Por Hora")
      lines.push({
        label: "Por hora",
        value: `${brl(parseMoney(c.porHoraValor))}/h${c.porHoraDescricao ? ` — ${c.porHoraDescricao}` : ""}`,
      });
    else if (t === "Comissão")
      lines.push({
        label: "Comissão",
        value: `${c.comissaoPct || "0"}${c.comissaoPct?.includes("%") ? "" : "%"} sobre ${c.comissaoSobre || "vendas"}`,
      });
    else if (t === "Permuta") lines.push({ label: "Permuta", value: c.permutaDescricao || "—" });
    else
      lines.push({
        label: c.outroDescricao?.trim() || "Outro",
        value: c.outroValor ? brl(parseMoney(c.outroValor)) : (c.outroCriterios ?? "—"),
      });
  }
  const cash = pagamentoCashValue(p);
  const tipoLabel =
    p.tipos.length === 1
      ? p.tipos[0] === "Valor"
        ? "Valor fechado"
        : p.tipos[0]
      : p.tipos.map((t) => (t === "Valor" ? "Valor fechado" : t)).join(" + ");
  return { total: cash > 0 ? cash : null, tipoLabel, lines };
}

/* ---------------- Dados para pagamento ---------------- */

const PIX_LABEL: Record<string, string> = {
  cpf: "CPF",
  cnpj: "CNPJ",
  email: "E-mail",
  telefone: "Telefone",
  aleatoria: "Aleatória",
};

export function hasBankData(b: BankInfo | undefined): boolean {
  return Object.values(b ?? {}).some((v) => typeof v === "string" && v.trim() !== "");
}

/** Só os campos preenchidos, na ordem de leitura. */
export function bankFields(b: BankInfo | undefined): { label: string; value: string }[] {
  if (!b) return [];
  const out: { label: string; value: string }[] = [];
  const add = (label: string, value?: string) => {
    if (value && value.trim()) out.push({ label, value: value.trim() });
  };
  add("Titular", b.titular);
  add("CPF/CNPJ", b.cpfCnpj);
  add("Banco", b.banco);
  add("Agência", b.agencia);
  add("Conta", b.conta);
  add(
    "Tipo",
    b.tipoConta === "corrente" ? "Corrente" : b.tipoConta === "poupanca" ? "Poupança" : "",
  );
  if (b.pixChave?.trim()) {
    add("PIX", `${b.pixChave.trim()}${b.pixTipo ? ` (${PIX_LABEL[b.pixTipo] ?? b.pixTipo})` : ""}`);
  }
  return out;
}

/* ---------------- Contrato ---------------- */

export type ContratoInfo = { present: boolean; name: string; kind: "pdf" | "imagem" | "arquivo" };
export function contratoInfo(contrato: string | undefined, nome?: string): ContratoInfo {
  if (!contrato) return { present: false, name: "", kind: "arquivo" };
  const mime = contrato.startsWith("data:") ? (contrato.match(/^data:([^;,]+)/)?.[1] ?? "") : "";
  const fromName = (nome ?? "").toLowerCase();
  const kind: ContratoInfo["kind"] =
    mime === "application/pdf" || fromName.endsWith(".pdf")
      ? "pdf"
      : mime.startsWith("image/") || /\.(png|jpe?g|webp)$/.test(fromName)
        ? "imagem"
        : "arquivo";
  const fallback =
    kind === "pdf" ? "Contrato (PDF)" : kind === "imagem" ? "Contrato (imagem)" : "Contrato";
  return { present: true, name: nome?.trim() || fallback, kind };
}

/** `data:` URLs são bloqueadas ao abrir direto numa nova aba: converte em Blob antes. */
export function openFileUrl(url: string) {
  if (!url.startsWith("data:")) {
    window.open(url, "_blank", "noopener,noreferrer");
    return;
  }
  const [header, base64] = url.split(",");
  const mime = header.match(/data:(.*?)(;base64)?$/)?.[1] || "application/octet-stream";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const blobUrl = URL.createObjectURL(new Blob([bytes], { type: mime }));
  window.open(blobUrl, "_blank", "noopener,noreferrer");
  setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
}

/** "2026-10-05" → "05/10/2026" (sem passar por Date, evita deslocamento de fuso). */
export function formatIsoDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}
