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
): { plataforma: string; seguidores?: string; metrics: RedeMetrics }[] {
  const porRede = influencer.profileMetrics?.porRede;
  if (!porRede) return [];
  const entries: { plataforma: string; seguidores?: string; metrics: RedeMetrics }[] = [];
  for (const [redeId, metrics] of Object.entries(porRede)) {
    const rede = influencer.redes.find((r) => r.id === redeId);
    if (rede?.plataforma) {
      entries.push({ plataforma: rede.plataforma, seguidores: rede.seguidores, metrics });
    }
  }
  return entries;
}
