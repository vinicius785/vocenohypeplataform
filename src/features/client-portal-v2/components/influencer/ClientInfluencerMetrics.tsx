import { BarChart3 } from "lucide-react";
import { InfluencerDrawerSection } from "./InfluencerDrawerSection";
import { formatMetricValue } from "../../lib/metric-format";
import type { PublicInfluencer } from "@/lib/portal-types";

/** Métricas — nunca mostra zero fingindo dado real; usa "Não informado"
 * quando o campo não existe. Separa métricas de PERFIL (cadastradas pelo
 * time) de RESULTADOS DESTA CAMPANHA (agregado das entregas publicadas)
 * — nunca a mesma seção misturando as duas fontes. */
export function ClientInfluencerMetrics({ influencer }: { influencer: PublicInfluencer }) {
  const porRede = influencer.profileMetrics?.porRede;
  const redeEntries = porRede ? Object.entries(porRede) : [];

  const publishedEntregas = influencer.entregas.filter((e) => e.stage === "PUBLICADA" && e.metrics);
  const hasCampaignResults = publishedEntregas.length > 0;

  if (redeEntries.length === 0 && !hasCampaignResults) return null;

  const campaignTotals = publishedEntregas.reduce(
    (acc, e) => ({
      views: acc.views + (e.metrics?.views ?? 0),
      likes: acc.likes + (e.metrics?.likes ?? 0),
      comments: acc.comments + (e.metrics?.comments ?? 0),
      reach: acc.reach + (e.metrics?.reach ?? 0),
    }),
    { views: 0, likes: 0, comments: 0, reach: 0 },
  );

  return (
    <InfluencerDrawerSection icon={<BarChart3 className="h-4 w-4" />} title="Métricas">
      {redeEntries.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
            Métricas do perfil
          </p>
          {redeEntries.map(([rede, m]) => (
            <div
              key={rede}
              className="grid grid-cols-2 gap-3 rounded-2xl bg-card p-4 dark:shadow-none sm:grid-cols-4"
            >
              <p className="col-span-2 text-xs font-medium text-foreground sm:col-span-4">{rede}</p>
              <Metric label="Interações" value={m.interacoes} />
              <Metric label="Visualizações" value={m.visualizacoes} />
              <Metric label="Taxa de interação" value={m.taxaInteracao} suffix="%" />
              <Metric label="Atenção inicial" value={m.taxaAtencaoInicial} suffix="%" />
            </div>
          ))}
        </div>
      )}

      {hasCampaignResults && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
            Resultados nesta campanha
          </p>
          <div className="grid grid-cols-2 gap-3 rounded-2xl bg-card p-4 dark:shadow-none sm:grid-cols-4">
            <Metric label="Alcance" value={campaignTotals.reach} />
            <Metric label="Visualizações" value={campaignTotals.views} />
            <Metric label="Curtidas" value={campaignTotals.likes} />
            <Metric label="Comentários" value={campaignTotals.comments} />
          </div>
        </div>
      )}
    </InfluencerDrawerSection>
  );
}

function Metric({
  label,
  value,
  suffix,
}: {
  label: string;
  value: number | undefined;
  suffix?: string;
}) {
  return (
    <div>
      <p className="text-xs text-text-secondary">{label}</p>
      <p className="mt-0.5 text-sm font-semibold tabular-nums text-foreground">
        {formatMetricValue(value, suffix)}
      </p>
    </div>
  );
}
