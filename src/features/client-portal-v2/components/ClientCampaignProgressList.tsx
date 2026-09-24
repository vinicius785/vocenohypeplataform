import { Megaphone } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { Card, CardHeader } from "@/components/InicioDashboard";
import { EmptyState } from "@/components/shared/EmptyState";
import type { CampaignSummary } from "../types/attention";

const HEALTH_LABEL: Record<CampaignSummary["health"], string> = {
  on_track: "Em dia",
  attention: "Atenção",
  at_risk: "Em risco",
};
const HEALTH_TONE: Record<CampaignSummary["health"], string> = {
  on_track: "bg-success-soft text-success-soft-foreground",
  attention: "bg-warning-soft text-warning-soft-foreground",
  at_risk: "bg-danger-soft text-danger-soft-foreground",
};

/** Linhas compactas — nunca cards de capa/banner (regra explícita desta
 * rodada). Barra de progresso discreta: track neutro, preenchimento
 * `--brand`, sem gradiente. */
export function ClientCampaignProgressList({ campaigns }: { campaigns: CampaignSummary[] }) {
  const navigate = useNavigate();

  return (
    <Card>
      <CardHeader icon={<Megaphone className="h-4 w-4" />} title="Campanhas em andamento" />
      {campaigns.length === 0 ? (
        <EmptyState
          compact
          icon={<Megaphone className="h-4 w-4" aria-hidden="true" />}
          title="Nenhuma campanha ativa no momento."
        />
      ) : (
        <div className="divide-y divide-border/70">
          {campaigns.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => navigate({ to: `/portal-v2/campanhas/${c.id}` })}
              className="group flex w-full flex-col gap-2 px-4 py-3 text-left hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset md:px-5"
            >
              <div className="flex items-center gap-2">
                <p className="min-w-0 flex-1 truncate text-sm text-foreground group-hover:underline">
                  {c.nome}
                </p>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${HEALTH_TONE[c.health]}`}
                >
                  {HEALTH_LABEL[c.health]}
                </span>
              </div>
              <p className="truncate text-xs text-muted-foreground">
                {c.stageLabel} · {c.influencersApproved}/{c.influencersTotal} influenciadores ·{" "}
                {c.contentPublished}/{c.contentPlanned} publicados
              </p>
              <div className="flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-brand"
                    style={{ width: `${c.progressPercent}%` }}
                  />
                </div>
                <span className="w-9 shrink-0 text-right text-xs font-medium tabular-nums text-muted-foreground">
                  {c.progressPercent}%
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </Card>
  );
}
