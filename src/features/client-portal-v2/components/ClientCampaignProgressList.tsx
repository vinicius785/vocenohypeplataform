import { Megaphone } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { Card, CardHeader } from "@/components/InicioDashboard";
import { EmptyState } from "@/components/shared/EmptyState";
import type { CampaignSummary } from "../types/attention";
import { CLIENT_CAMPAIGN_STATUS_LABEL } from "../lib/client-status";

/** Linhas compactas — nunca cards de capa/banner (regra explícita desta
 * rodada). Barra de progresso discreta: track neutro, preenchimento
 * `--brand`, sem gradiente. Nunca mostra classificação de saúde/risco —
 * só o status operacional objetivo (ver `client-status.ts`). */
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
              </div>
              <p className="truncate text-xs text-muted-foreground">
                {CLIENT_CAMPAIGN_STATUS_LABEL[c.status]} · {c.influencersApproved}/
                {c.influencersTotal} influenciadores · {c.contentPublished}/{c.contentPlanned}{" "}
                publicados
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
