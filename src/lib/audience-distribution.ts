/** Lógica pura da apresentação de AUDIÊNCIA do influenciador (gênero, faixa etária, países,
 * cidades) — compartilhada pelo Portal do Time e pelo Portal do Cliente. Não busca dado nem decide
 * permissão: recebe as entradas que cada portal já tem e só as organiza para leitura. */
export type DistributionInput = { label: string; percentual: number };
export type DistributionItem = { label: string; percent: number };

export type Distribution = {
  /** Itens válidos, do maior para o menor (empate mantém a ordem original). */
  items: DistributionItem[];
  /** Quantos itens válidos ficaram de fora por causa do `limit`. */
  hidden: number;
};

/** Mantém só entradas com rótulo e percentual > 0 (nunca uma barra vazia fingindo dado), ordena
 * do maior para o menor e corta em `limit`. */
export function toDistribution(
  entries: readonly DistributionInput[] | null | undefined,
  limit = Infinity,
): Distribution {
  const valid = (entries ?? [])
    .map((e, index) => ({ label: (e.label ?? "").trim(), percent: Number(e.percentual), index }))
    .filter((e) => e.label !== "" && Number.isFinite(e.percent) && e.percent > 0)
    .sort((a, b) => b.percent - a.percent || a.index - b.index);
  const items = valid.slice(0, limit).map(({ label, percent }) => ({ label, percent }));
  return { items, hidden: Math.max(0, valid.length - items.length) };
}

/** "79,6%", "96%", "0,7%" — pt-BR, no máximo 1 casa, sem ",0" sobrando. */
export function formatShare(percent: number, locale = "pt-BR"): string {
  const rounded = Math.round(percent * 10) / 10;
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(rounded)}%`;
}

/** Largura da barra (0–100). `share`: o percentual é a própria fração do todo (gênero, faixa
 * etária). `relative`: proporcional ao maior item do grupo (países, cidades), para que valores
 * pequenos continuem legíveis. Sempre um mínimo visível para valor > 0. */
export function barWidth(
  percent: number,
  max: number,
  scale: "share" | "relative" = "share",
): number {
  if (!(percent > 0)) return 0;
  const raw = scale === "relative" ? (max > 0 ? (percent / max) * 100 : 0) : percent;
  return Math.min(100, Math.max(2, raw));
}

export type AudienceData = {
  genero?: readonly DistributionInput[] | null;
  faixaEtaria?: readonly DistributionInput[] | null;
  paises?: readonly DistributionInput[] | null;
  cidades?: readonly DistributionInput[] | null;
};

/** Há algo demográfico de verdade para mostrar? */
export function hasAudienceData(data: AudienceData | null | undefined): boolean {
  if (!data) return false;
  return (
    toDistribution(data.genero).items.length > 0 ||
    toDistribution(data.faixaEtaria).items.length > 0 ||
    toDistribution(data.paises).items.length > 0 ||
    toDistribution(data.cidades).items.length > 0
  );
}
