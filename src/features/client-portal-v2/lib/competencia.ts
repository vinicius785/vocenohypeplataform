import type { PublicCampaignCycle } from "@/lib/portal-types";

const MONTH_LABEL = [
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

/** Chave curta usada na URL (`?competencia=2026-09`) e pra comparar com
 * `PublicRelatorioMensal.mes`, que já usa o mesmo formato. */
export function cycleKey(cycle: Pick<PublicCampaignCycle, "competenceYear" | "competenceMonth">) {
  return `${cycle.competenceYear}-${String(cycle.competenceMonth).padStart(2, "0")}`;
}

export function formatCompetenceLabel(
  cycle: Pick<PublicCampaignCycle, "competenceYear" | "competenceMonth">,
) {
  return `${MONTH_LABEL[cycle.competenceMonth - 1]} de ${cycle.competenceYear}`;
}

function sortedCycles(cycles: PublicCampaignCycle[]): PublicCampaignCycle[] {
  return [...cycles].sort((a, b) =>
    a.competenceYear !== b.competenceYear
      ? a.competenceYear - b.competenceYear
      : a.competenceMonth - b.competenceMonth,
  );
}

/**
 * Resolve qual ciclo fica ativo, na ordem exigida: (1) o da URL, só se
 * existir de verdade nesta campanha; (2) o ciclo do mês corrente, se
 * existir; (3) o ciclo mais recente disponível; (4) `null` (estado vazio —
 * "campanha recorrente sem ciclo ainda"). Nunca mistura dados de vários
 * meses como fallback — sempre um ciclo só, ou nenhum.
 */
export function resolveActiveCycle(
  cycles: PublicCampaignCycle[] | undefined,
  urlParam: string | undefined,
  now = new Date(),
): PublicCampaignCycle | null {
  const all = sortedCycles(cycles ?? []);
  if (all.length === 0) return null;

  if (urlParam) {
    const fromUrl = all.find((c) => cycleKey(c) === urlParam);
    if (fromUrl) return fromUrl;
    // Parâmetro inválido/de outra campanha: nunca usa — cai no default,
    // nunca mostra o mês errado nem mistura tudo.
  }

  const currentKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const current = all.find((c) => cycleKey(c) === currentKey);
  if (current) return current;

  return all[all.length - 1];
}

export function cycleOptions(cycles: PublicCampaignCycle[] | undefined) {
  return sortedCycles(cycles ?? []);
}

export function adjacentCycle(
  cycles: PublicCampaignCycle[] | undefined,
  active: PublicCampaignCycle | null,
  direction: -1 | 1,
): PublicCampaignCycle | null {
  const all = sortedCycles(cycles ?? []);
  if (!active) return null;
  const idx = all.findIndex((c) => c.id === active.id);
  if (idx === -1) return null;
  const next = all[idx + direction];
  return next ?? null;
}
