import { BarChart3 } from "lucide-react";
import { EmptyState } from "@/components/shared/EmptyState";
import { CampaignSection } from "./CampaignSection";
import type { PublicEntrega } from "@/lib/portal-types";

const fmt = new Intl.NumberFormat("pt-BR");

/** Resultados — só aparece com dado real; nunca zeros fingindo métrica.
 * Não repete progresso/publicados (já na faixa de resumo do topo). */
export function ClientCampaignResults({ entregas }: { entregas: PublicEntrega[] }) {
  const published = entregas.filter((e) => e.stage === "PUBLICADA" && e.metrics);

  if (published.length === 0) {
    return (
      <CampaignSection icon={<BarChart3 className="h-4 w-4" />} title="Resultados">
        <EmptyState
          compact
          icon={<BarChart3 className="h-4 w-4" aria-hidden="true" />}
          title="Ainda não há resultados de conteúdos publicados"
        />
      </CampaignSection>
    );
  }

  const totals = published.reduce(
    (acc, e) => ({
      views: acc.views + (e.metrics?.views ?? 0),
      likes: acc.likes + (e.metrics?.likes ?? 0),
      comments: acc.comments + (e.metrics?.comments ?? 0),
      shares: acc.shares + (e.metrics?.shares ?? 0),
      reach: acc.reach + (e.metrics?.reach ?? 0),
    }),
    { views: 0, likes: 0, comments: 0, shares: 0, reach: 0 },
  );

  const cards = [
    { label: "Alcance", value: totals.reach },
    { label: "Visualizações", value: totals.views },
    { label: "Curtidas", value: totals.likes },
    { label: "Comentários", value: totals.comments },
    { label: "Compartilhamentos", value: totals.shares },
  ].filter((c) => c.value > 0);

  const latestUpdate = published
    .map((e) => e.ultimaAtualizacao)
    .filter((d): d is string => !!d)
    .sort()
    .at(-1);

  return (
    <CampaignSection
      icon={<BarChart3 className="h-4 w-4" />}
      title="Resultados"
      description={
        latestUpdate
          ? `Atualizado em ${new Date(latestUpdate).toLocaleDateString("pt-BR")}`
          : undefined
      }
    >
      <div className="grid grid-cols-2 gap-3 rounded-2xl bg-card p-4 dark:shadow-none sm:grid-cols-3">
        {cards.map((c) => (
          <div key={c.label}>
            <p className="text-xs text-text-secondary">{c.label}</p>
            <p className="mt-0.5 text-lg font-semibold tabular-nums text-foreground">
              {fmt.format(c.value)}
            </p>
          </div>
        ))}
      </div>
    </CampaignSection>
  );
}
