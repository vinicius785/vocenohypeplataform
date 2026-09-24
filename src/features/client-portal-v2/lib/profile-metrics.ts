import type { PublicInfluencer, RedeMetrics } from "@/lib/portal-types";

/**
 * `influencer.profileMetrics.porRede` é um `Record<string, RedeMetrics>`
 * chaveado por `rede.id` (um UUID interno — ver `InfluencerBoard.tsx`'s
 * `ProfileMetricsEditor`, que grava `porRede[activeRede.id]`), nunca pelo
 * nome da plataforma. Renderizar a chave crua vazava o UUID como se fosse
 * um título. Esta função resolve cada entrada pro nome real da rede via
 * `influencer.redes`; uma entrada cuja rede foi removida do perfil depois
 * é descartada (nunca mostrada com um UUID no lugar do nome).
 */
export function resolveProfileMetricEntries(
  influencer: Pick<PublicInfluencer, "profileMetrics" | "redes">,
): { plataforma: string; metrics: RedeMetrics }[] {
  const porRede = influencer.profileMetrics?.porRede;
  if (!porRede) return [];
  const entries: { plataforma: string; metrics: RedeMetrics }[] = [];
  for (const [redeId, metrics] of Object.entries(porRede)) {
    const plataforma = influencer.redes.find((r) => r.id === redeId)?.plataforma;
    if (plataforma) entries.push({ plataforma, metrics });
  }
  return entries;
}
