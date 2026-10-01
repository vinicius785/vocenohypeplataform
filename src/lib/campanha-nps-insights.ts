/**
 * Consulta interna (time) do NPS mensal de UMA campanha — Campanha →
 * Ferramentas → NPS. Funções puras (testadas em
 * `campanha-nps-insights.test.ts`), usadas pelo servidor
 * (`campanha-nps.functions.ts`) pra devolver o resumo já calculado; o
 * frontend só escolhe o mês e exibe.
 *
 * Decisão sobre a "distribuição" com N=1 por mês: o modelo é UMA resposta
 * por (campanha, mês) — `UNIQUE(campanha_id, reference_month)`. Então:
 *  - a nota de um mês é só aquela resposta (0-10) e sua categoria
 *    (Promotor/Neutro/Detrator) — nunca um "NPS do mês" de +100/-100
 *    fingindo amostra;
 *  - o índice NPS (%Promotores − %Detratores) e a distribuição são
 *    calculados sobre os MESES da própria campanha até o mês selecionado
 *    (inclusive), cada mês contando como uma avaliação. Nunca mistura
 *    outras campanhas/clientes;
 *  - com menos de `MIN_MONTHS_FOR_NPS_INDEX` meses o índice é `null`
 *    (exibido "—"): um índice com 1 avaliação seria +100/0/−100, um
 *    número artificial.
 * Ausência de resposta é sempre `null`, nunca 0.
 */
import { NPS_RATING_OPTIONS, type NpsRating } from "@/lib/campanha-nps";

export const MIN_MONTHS_FOR_NPS_INDEX = 2;

export type NpsCategory = "promotor" | "neutro" | "detrator";

export const NPS_CATEGORY_LABEL: Record<NpsCategory, string> = {
  promotor: "Promotor",
  neutro: "Neutro",
  detrator: "Detrator",
};

export function classifyNpsScore(score: number): NpsCategory {
  if (score >= 9) return "promotor";
  if (score >= 7) return "neutro";
  return "detrator";
}

export type NpsDistribution = {
  promotores: number;
  neutros: number;
  detratores: number;
  total: number;
};

export function npsDistribution(scores: number[]): NpsDistribution {
  const d: NpsDistribution = { promotores: 0, neutros: 0, detratores: 0, total: scores.length };
  for (const s of scores) {
    const c = classifyNpsScore(s);
    if (c === "promotor") d.promotores++;
    else if (c === "neutro") d.neutros++;
    else d.detratores++;
  }
  return d;
}

/** %Promotores − %Detratores, arredondado. `null` sem amostra suficiente. */
export function npsIndex(
  scores: number[],
  minSample: number = MIN_MONTHS_FOR_NPS_INDEX,
): number | null {
  if (scores.length === 0 || scores.length < minSample) return null;
  const d = npsDistribution(scores);
  return Math.round(((d.promotores - d.detratores) / d.total) * 100);
}

/** Escala 1-5 das opções textuais (muito_ruim=1 … excelente=5). */
export function ratingToScore(rating: string): number | null {
  const idx = NPS_RATING_OPTIONS.findIndex((o) => o.value === rating);
  return idx === -1 ? null : idx + 1;
}

export function ratingLabel(rating: string): string {
  return NPS_RATING_OPTIONS.find((o) => o.value === rating)?.label ?? "—";
}

export type CampanhaNpsEntry = {
  id: string;
  referenceMonth: string;
  score: number;
  satisfactionScore: number;
  deliveryQuality: NpsRating | string;
  communicationRating: NpsRating | string;
  comment: string | null;
  answeredBy: string | null;
  answeredByName: string | null;
  answeredAt: string;
};

export type CampanhaNpsMonthSummary = {
  referenceMonth: string;
  entry: CampanhaNpsEntry;
  category: NpsCategory;
  deliveryScore: number | null;
  communicationScore: number | null;
  /** Índice e distribuição sobre os meses da campanha até este (inclusive). */
  cumulative: { nps: number | null; distribution: NpsDistribution; fromMonth: string };
};

/** Meses em ordem crescente, cada um com o acumulado até ele. Duplicatas
 * por mês não deveriam existir (UNIQUE no banco); se aparecerem, a
 * primeira vence — nunca soma duas respostas do mesmo mês. */
export function buildCampanhaNpsMonths(entries: CampanhaNpsEntry[]): CampanhaNpsMonthSummary[] {
  const seen = new Set<string>();
  const sorted = [...entries]
    .sort((a, b) => a.referenceMonth.localeCompare(b.referenceMonth))
    .filter((e) => (seen.has(e.referenceMonth) ? false : (seen.add(e.referenceMonth), true)));
  const scores: number[] = [];
  return sorted.map((entry) => {
    scores.push(entry.score);
    return {
      referenceMonth: entry.referenceMonth,
      entry,
      category: classifyNpsScore(entry.score),
      deliveryScore: ratingToScore(entry.deliveryQuality),
      communicationScore: ratingToScore(entry.communicationRating),
      cumulative: {
        nps: npsIndex(scores),
        distribution: npsDistribution(scores),
        fromMonth: sorted[0].referenceMonth,
      },
    };
  });
}

const MONTHS_PT = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

/** "2026-10" → "Outubro 2026" (sem Date: nunca sofre com fuso). */
export function formatReferenceMonth(ym: string, short = false): string {
  const [y, m] = ym.split("-");
  const name = MONTHS_PT[Number(m) - 1];
  if (!name) return ym;
  return short ? `${name.slice(0, 3)}/${y.slice(2)}` : `${name} ${y}`;
}

export function formatNpsIndex(nps: number | null): string {
  if (nps === null) return "—";
  return nps > 0 ? `+${nps}` : String(nps);
}

/** "4,5/5" — `null` vira "—". */
export function formatOutOfFive(value: number | null): string {
  if (value === null) return "—";
  return `${value.toFixed(1).replace(".", ",")}/5`;
}

/** Quem pode consultar o NPS interno de uma campanha: admin, ou membro do
 * time INTERNO (`is_internal_team_member` — organização `type='internal'`)
 * com permissão `campanhas` ou `clientes` (mesmas permissões da policy
 * interna de SELECT em `campanha_nps`). Usuário do Portal do Cliente nunca
 * é membro interno, então é sempre negado aqui — mesmo que a policy
 * "org members read own campanha_nps" o deixe ler as próprias linhas. */
export function canReadCampanhaNpsInterno(a: {
  isAdmin: boolean;
  isInternalMember: boolean;
  hasCampanhas: boolean;
  hasClientes: boolean;
}): boolean {
  if (a.isAdmin) return true;
  return a.isInternalMember && (a.hasCampanhas || a.hasClientes);
}
