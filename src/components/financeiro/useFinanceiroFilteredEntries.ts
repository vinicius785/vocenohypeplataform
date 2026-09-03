import { useMemo, useState } from "react";
import {
  useFinanceiroEntries,
  todayISO,
  type Entry,
  type EntryStatus,
  type Kind,
  type Source,
} from "@/lib/financeiro-entries";

/** Substitui o `PeriodMode` antigo (mes/7dias/30dias/1ano/personalizado) —
 * mais opções, e serve TODAS as abas/widgets do Financeiro, não só a lista. */
export type PeriodMode =
  | "hoje"
  | "esta_semana"
  | "este_mes"
  | "mes_passado"
  | "30dias"
  | "3meses"
  | "6meses"
  | "este_ano"
  | "personalizado";

export const PERIOD_OPTIONS: { value: PeriodMode; label: string }[] = [
  { value: "hoje", label: "Hoje" },
  { value: "esta_semana", label: "Esta semana" },
  { value: "este_mes", label: "Este mês" },
  { value: "mes_passado", label: "Mês passado" },
  { value: "30dias", label: "Últimos 30 dias" },
  { value: "3meses", label: "Últimos 3 meses" },
  { value: "6meses", label: "Últimos 6 meses" },
  { value: "este_ano", label: "Este ano" },
  { value: "personalizado", label: "Período personalizado" },
];

export type DateRange = { from: string; to: string };

function toIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function daysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return toIso(d);
}
function startOfWeek(now: Date): Date {
  const d = new Date(now);
  const dow = d.getDay();
  const diff = dow === 0 ? 6 : dow - 1; // segunda como início
  d.setDate(d.getDate() - diff);
  return d;
}

/** `anchorMonth` só é usado no modo "este_mes" — permite navegar com
 * `< Mês >` sem sair do modo. Nos demais modos, sempre relativo a hoje. */
export function periodRange(
  mode: PeriodMode,
  anchorMonth: Date,
  customFrom: string,
  customTo: string,
): DateRange {
  const today = todayISO();
  switch (mode) {
    case "hoje":
      return { from: today, to: today };
    case "esta_semana": {
      const start = startOfWeek(new Date());
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      return { from: toIso(start), to: toIso(end) };
    }
    case "este_mes": {
      const start = new Date(anchorMonth.getFullYear(), anchorMonth.getMonth(), 1);
      const end = new Date(anchorMonth.getFullYear(), anchorMonth.getMonth() + 1, 0);
      return { from: toIso(start), to: toIso(end) };
    }
    case "mes_passado": {
      const start = new Date(anchorMonth.getFullYear(), anchorMonth.getMonth() - 1, 1);
      const end = new Date(anchorMonth.getFullYear(), anchorMonth.getMonth(), 0);
      return { from: toIso(start), to: toIso(end) };
    }
    case "30dias":
      return { from: daysAgo(29), to: today };
    case "3meses":
      return { from: daysAgo(89), to: today };
    case "6meses":
      return { from: daysAgo(179), to: today };
    case "este_ano": {
      const y = new Date().getFullYear();
      return { from: `${y}-01-01`, to: `${y}-12-31` };
    }
    case "personalizado":
      return { from: customFrom, to: customTo };
  }
}

/** Filtros avançados — o "+Filtros" completo (item 17 do pedido) é
 * implementado por etapas; os campos já existem aqui desde já pra não
 * precisar mudar o shape do hook central depois. */
export type AdvancedFilters = {
  tipo: "todos" | Kind;
  status: EntryStatus[]; // vazio = todos
  clienteId?: string;
  campanhaId?: string;
  categoria?: string;
  query: string;
  responsavelId?: string;
  valorMin?: number;
  valorMax?: number;
  possuiNotaFiscal?: boolean;
  possuiComprovante?: boolean;
  formaPagamento?: string;
  origem?: Source;
};

export const DEFAULT_FILTERS: AdvancedFilters = { tipo: "todos", status: [], query: "" };

/** Janela de mesma duração imediatamente anterior ao período atual — usada
 * na comparação "vs. período anterior" dos KPIs. */
export function previousPeriodRange(range: DateRange): DateRange {
  const from = new Date(`${range.from}T00:00:00`);
  const to = new Date(`${range.to}T00:00:00`);
  const days = Math.max(1, Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1);
  const prevTo = new Date(from);
  prevTo.setDate(prevTo.getDate() - 1);
  const prevFrom = new Date(prevTo);
  prevFrom.setDate(prevFrom.getDate() - (days - 1));
  return { from: toIso(prevFrom), to: toIso(prevTo) };
}

export function matchesFilters(e: Entry, f: AdvancedFilters): boolean {
  if (f.tipo !== "todos" && e.kind !== f.tipo) return false;
  if (f.status.length > 0 && !f.status.includes(e.status)) return false;
  if (f.clienteId && e.clienteId !== f.clienteId) return false;
  if (f.campanhaId && e.campanhaId !== f.campanhaId) return false;
  if (f.categoria && e.category !== f.categoria) return false;
  if (f.responsavelId && e.responsavelId !== f.responsavelId) return false;
  if (f.valorMin != null && e.amount < f.valorMin) return false;
  if (f.valorMax != null && e.amount > f.valorMax) return false;
  if (f.formaPagamento && e.formaPagamento !== f.formaPagamento) return false;
  if (f.origem && e.source !== f.origem) return false;
  if (f.possuiNotaFiscal != null) {
    const hasNf = (e.anexos ?? []).some((a) => a.categoria === "Nota fiscal") || !!e.invoice;
    if (hasNf !== f.possuiNotaFiscal) return false;
  }
  if (f.possuiComprovante != null) {
    const hasComp = (e.anexos ?? []).some((a) => a.categoria === "Comprovante");
    if (hasComp !== f.possuiComprovante) return false;
  }
  if (f.query.trim()) {
    const q = f.query.trim().toLowerCase();
    const haystack = [e.description, e.category, e.meta, e.clienteNome, e.campanhaNome]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    if (!haystack.includes(q)) return false;
  }
  return true;
}

/**
 * Fonte de dados ÚNICA pra todos os widgets/abas do novo Financeiro —
 * nenhum widget faz sua própria query/filtro (requisito explícito de
 * performance do pedido). `all` é todo o histórico (sem filtro de
 * período/avançado); `visible` já aplica período + filtros avançados.
 */
export function useFinanceiroFilteredEntries() {
  const all = useFinanceiroEntries();
  const [periodMode, setPeriodMode] = useState<PeriodMode>("este_mes");
  const [anchorMonth, setAnchorMonth] = useState(() => new Date());
  const [customFrom, setCustomFrom] = useState(() => todayISO());
  const [customTo, setCustomTo] = useState(() => todayISO());
  const [filters, setFilters] = useState<AdvancedFilters>(DEFAULT_FILTERS);

  const range = useMemo(
    () => periodRange(periodMode, anchorMonth, customFrom, customTo),
    [periodMode, anchorMonth, customFrom, customTo],
  );

  const inPeriod = useMemo(
    () => all.filter((e) => e.vencimento >= range.from && e.vencimento <= range.to),
    [all, range],
  );

  const visible = useMemo(
    () => inPeriod.filter((e) => matchesFilters(e, filters)),
    [inPeriod, filters],
  );

  return {
    all,
    inPeriod,
    visible,
    periodMode,
    setPeriodMode,
    anchorMonth,
    setAnchorMonth,
    customFrom,
    setCustomFrom,
    customTo,
    setCustomTo,
    range,
    filters,
    setFilters,
  };
}
