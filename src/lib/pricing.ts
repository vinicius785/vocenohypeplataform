/**
 * Precificação de pacotes de influenciadores — traz pra plataforma a lógica
 * da planilha "Calculadora custos op" (Custos por Tier × Simulador de
 * Pacote): soma o custo médio dos influenciadores selecionados (por Tier de
 * audiência × Formato de entrega) e aplica os percentuais fixos da agência
 * (imposto, comissão, bonificação, margem) pra chegar no preço final a
 * cobrar do cliente. Módulo puro, sem React/browser — usado tanto pelo
 * simulador (Comercial) quanto pela tela de configuração dos percentuais e
 * da matriz de custo (Configurações → Precificação).
 */

export const TIERS = [
  { id: "ugc", label: "UGC", min: 0, max: 0 },
  { id: "nano", label: "Nano (1 - 1.000)", min: 1, max: 1_000 },
  { id: "nano_plus", label: "Nano+ (1.001 - 5.000)", min: 1_001, max: 5_000 },
  { id: "micro", label: "Micro (5.001 - 10.000)", min: 5_001, max: 10_000 },
  { id: "micro_plus", label: "Micro+ (10.001 - 30.000)", min: 10_001, max: 30_000 },
  { id: "mid_tier", label: "Mid-Tier (30.001 - 70.000)", min: 30_001, max: 70_000 },
  { id: "mid_tier_plus", label: "Mid-Tier+ (70.001 - 100.000)", min: 70_001, max: 100_000 },
  { id: "macro", label: "Macro (100.001 - 200.000)", min: 100_001, max: 200_000 },
  { id: "macro_plus", label: "Macro+ (200.001 - 300.000)", min: 200_001, max: 300_000 },
  { id: "mega", label: "Mega (300.001 - 500.000)", min: 300_001, max: 500_000 },
  { id: "top", label: "Top (500.001 - 1.000.000)", min: 500_001, max: 1_000_000 },
  { id: "platinum", label: "Platinum (1.000.001 - 3.000.000)", min: 1_000_001, max: 3_000_000 },
] as const;
export type TierId = (typeof TIERS)[number]["id"];

export const FORMATOS = [
  { id: "feed_post", label: "Feed / Post" },
  { id: "stories_3x", label: "Stories 3x" },
  { id: "reels_video", label: "Reels / Vídeo" },
  { id: "live", label: "Live" },
  { id: "ugc_sem_postagem", label: "UGC sem postagem" },
  { id: "pacote_basico", label: "Pacote Básico (Reels + Stories)" },
] as const;
export type FormatoId = (typeof FORMATOS)[number]["id"];

/** Sugere um Tier a partir do número de seguidores — só uma sugestão de
 * partida, sempre editável manualmente (o tier final é uma decisão do time,
 * não só um cálculo de faixa). */
export function suggestTier(seguidores: number): TierId {
  if (!seguidores || seguidores <= 0) return "ugc";
  const found = TIERS.find((t) => t.id !== "ugc" && seguidores >= t.min && seguidores <= t.max);
  if (found) return found.id;
  return seguidores > TIERS[TIERS.length - 1].max ? "platinum" : "nano";
}

export type PacoteLinha = { id: string; tier: TierId; formato: FormatoId; qtd: number };

/** Frações (0.085 = 8,5%), não percentuais inteiros — evita conversão
 * repetida nos cálculos e na persistência. */
export type PricingPercentuais = {
  imposto: number;
  comissao: number;
  bonificacao: number;
  margem: number;
};

export const DEFAULT_PERCENTUAIS: PricingPercentuais = {
  imposto: 0.085,
  comissao: 0.05,
  bonificacao: 0.03,
  margem: 0.3,
};

export type CustoTierFormato = Record<TierId, Partial<Record<FormatoId, number>>>;

export const EMPTY_CUSTOS: CustoTierFormato = Object.fromEntries(
  TIERS.map((t) => [t.id, {}]),
) as CustoTierFormato;

export function custoUnitario(custos: CustoTierFormato, tier: TierId, formato: FormatoId): number {
  return custos[tier]?.[formato] ?? 0;
}

export type PacoteResultado = {
  custoTotal: number;
  totalPercentuais: number;
  precoFinal: number;
  lucro: number;
  imposto: number;
  comissao: number;
  bonificacao: number;
};

/**
 * `Preço final = Custo total ÷ (1 − soma dos percentuais)` — mesma fórmula
 * da planilha: os percentuais incidem sobre o PREÇO FINAL, não sobre o
 * custo, então é preciso "destravar" o preço com essa divisão em vez de só
 * somar uma margem simples sobre o custo.
 */
export function calcPacote(
  linhas: PacoteLinha[],
  custos: CustoTierFormato,
  percentuais: PricingPercentuais,
): PacoteResultado {
  const custoTotal = linhas.reduce(
    (sum, l) => sum + custoUnitario(custos, l.tier, l.formato) * Math.max(0, l.qtd || 0),
    0,
  );
  const totalPercentuais =
    percentuais.imposto + percentuais.comissao + percentuais.bonificacao + percentuais.margem;
  const precoFinal = totalPercentuais < 1 ? custoTotal / (1 - totalPercentuais) : custoTotal;
  return {
    custoTotal,
    totalPercentuais,
    precoFinal,
    lucro: precoFinal * percentuais.margem,
    imposto: precoFinal * percentuais.imposto,
    comissao: precoFinal * percentuais.comissao,
    bonificacao: precoFinal * percentuais.bonificacao,
  };
}
