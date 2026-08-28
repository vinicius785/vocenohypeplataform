/** Pequenos helpers puros compartilhados entre os componentes de Metas —
 * evita duplicar entre `MetasSection`, `MetaCard`, os diálogos etc. */

import { comparadorEfetivo, COMPARISON_OPERATOR_SYMBOL, metaEfetiva } from "@/lib/metas-engine";
import type { Indicador } from "@/lib/metas-store";

/** Tom/ícone da tendência — compartilhado entre `IndicadorRow` (card) e
 * `ObjetivoIndicadorRow` (lista densa), pra nunca divergir. */
export const TENDENCIA_TONE: Record<"melhorando" | "piorando" | "estavel", string> = {
  melhorando: "text-emerald-600 dark:text-emerald-400",
  piorando: "text-rose-600 dark:text-rose-400",
  estavel: "text-muted-foreground",
};
export const TENDENCIA_ICON: Record<"melhorando" | "piorando" | "estavel", string> = {
  melhorando: "↑",
  piorando: "↓",
  estavel: "=",
};

export function initialsOf(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

const AVATAR_COLORS = [
  "bg-rose-500",
  "bg-sky-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-violet-500",
  "bg-teal-500",
];

export function colorFor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

export function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1).toLocaleDateString("pt-BR");
}

const MONTH_ABBR = [
  "Jan",
  "Fev",
  "Mar",
  "Abr",
  "Mai",
  "Jun",
  "Jul",
  "Ago",
  "Set",
  "Out",
  "Nov",
  "Dez",
];

/** "2026-09-15" → "Set 2026" — usado nas linhas de período compactas
 * (cards de objetivo, header da página do objetivo). */
export function fmtMonthYear(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  return `${MONTH_ABBR[(m || 1) - 1]} ${y}`;
}

/** Faixa de período pronta pra exibir — "Set 2026 — Dez 2026", só o
 * início, só o fim, ou `null` quando nenhuma data foi definida. */
export function fmtPeriodo(dataInicio?: string, dataFim?: string): string | null {
  if (dataInicio && dataFim) return `${fmtMonthYear(dataInicio)} — ${fmtMonthYear(dataFim)}`;
  if (dataInicio) return `Desde ${fmtMonthYear(dataInicio)}`;
  if (dataFim) return `Até ${fmtMonthYear(dataFim)}`;
  return null;
}

/** Tempo relativo simples ("hoje", "há 2 dias", "há 3 semanas") — só pra
 * dar contexto de frescor no "Atualizado há X", sem precisão de horas. */
export function timeAgo(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "hoje";
  if (days === 1) return "há 1 dia";
  if (days < 7) return `há ${days} dias`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return weeks === 1 ? "há 1 semana" : `há ${weeks} semanas`;
  const months = Math.floor(days / 30);
  if (months < 12) return months === 1 ? "há 1 mês" : `há ${months} meses`;
  const years = Math.floor(days / 365);
  return years === 1 ? "há 1 ano" : `há ${years} anos`;
}

/** Formata um valor numérico de acordo com o tipo de medição do
 * indicador — única função que decide "63" vira "63%" ou "R$ 63" ou
 * "63 clientes", reaproveitada em todo lugar que mostra um valor de
 * indicador (evita cada card formatando na mão, diferente um do outro). */
export function formatIndicadorValor(
  tipo: "numero" | "percentual" | "moeda" | "min" | "max" | "binario" | "marco" | "manual",
  value: number | undefined,
  unidade?: string,
): string {
  if (value == null) return "—";
  if (tipo === "percentual") return `${value.toLocaleString("pt-BR")}%`;
  if (tipo === "moeda") return `R$ ${value.toLocaleString("pt-BR")}`;
  const suffix = unidade ? ` ${unidade}` : "";
  return `${value.toLocaleString("pt-BR")}${suffix}`;
}

/** Valor atual formatado do indicador — binário/marco viram rótulo de
 * status ("Concluído"/"Em aberto"/"Em andamento"), o resto passa por
 * `formatIndicadorValor`. Compartilhado entre `IndicadorRow` e
 * `ObjetivoIndicadorRow`, nunca duplicado. */
export function formatValorAtual(ind: Indicador): string {
  if (ind.tipo === "binario") return ind.concluido ? "Concluído" : "Em aberto";
  if (ind.tipo === "marco") {
    if (ind.marcoStatus === "concluido") return "Concluído";
    if (ind.marcoStatus === "em_andamento") return "Em andamento";
    return "Não iniciado";
  }
  return formatIndicadorValor(ind.tipo, ind.valorAtual, ind.unidade);
}

/** Meta formatada NESTE vínculo (indicador↔objetivo) com o símbolo do
 * operador — ex. "≥ 63%" — ou `null` quando o vínculo não tem meta
 * efetiva configurada (nem por override, nem via `niveis.esperado`). */
export function formatMetaVinculo(ind: Indicador, objetivoId: string): string | null {
  if (ind.tipo === "binario" || ind.tipo === "marco") return null;
  const meta = metaEfetiva(ind, objetivoId);
  if (meta == null) return null;
  const simbolo = COMPARISON_OPERATOR_SYMBOL[comparadorEfetivo(ind, objetivoId)];
  return `${simbolo} ${formatIndicadorValor(ind.tipo, meta, ind.unidade)}`;
}
