import type { ReactNode } from "react";
import { ArrowLeft, Calendar } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { ClienteLogo } from "@/components/clientes/ClienteLogo";
import { Badge } from "@/components/ui/badge";
import type { CampaignSummary } from "../../types/attention";

const HEALTH_BADGE: Record<
  CampaignSummary["health"],
  { label: string; variant: "success" | "warning" | "danger" }
> = {
  on_track: { label: "Em dia", variant: "success" },
  attention: { label: "Atenção", variant: "warning" },
  at_risk: { label: "Em risco", variant: "danger" },
};

/**
 * Cabeçalho da página da campanha — breadcrumb + identidade (logo do
 * cliente, nome, badge de saúde, período, última atualização). Sem hero
 * azul: a hierarquia vem da tipografia e da composição, igual ao
 * cabeçalho de campanha do time (`CampanhasSection.tsx`).
 */
export function ClientCampaignHeader({
  campaign,
  clientLogo,
  clientName,
  lastUpdateLabel,
  cycleSelector,
}: {
  campaign: CampaignSummary;
  clientLogo?: string;
  clientName: string;
  lastUpdateLabel?: string;
  /** Seletor de competência (só campanhas recorrentes) — alinhado à
   * direita no desktop, cai pra linha própria no mobile. */
  cycleSelector?: ReactNode;
}) {
  const navigate = useNavigate();
  const health = HEALTH_BADGE[campaign.health];
  const periodLabel = campaign.prazo
    ? `Prazo ${new Date(campaign.prazo).toLocaleDateString("pt-BR")}`
    : "Sem prazo definido";

  return (
    <div className="space-y-3">
      <nav aria-label="Navegação" className="flex items-center gap-1.5 text-sm">
        <button
          type="button"
          onClick={() => navigate({ to: "/portal-v2/campanhas" })}
          className="inline-flex items-center gap-1 text-text-secondary hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Campanhas
        </button>
        <span className="text-text-secondary">/</span>
        <span className="min-w-0 truncate font-medium text-foreground">{campaign.nome}</span>
      </nav>

      <div className="flex min-w-0 flex-wrap items-start gap-4">
        <ClienteLogo photo={clientLogo} empresa={clientName} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium uppercase tracking-wide text-text-secondary">
            {clientName}
          </p>
          <p className="mt-0.5 truncate text-2xl font-bold tracking-tight text-foreground md:text-[28px]">
            {campaign.nome}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge variant={health.variant}>{health.label}</Badge>
            <span className="inline-flex items-center gap-1 text-xs font-medium text-text-secondary">
              <Calendar className="h-3.5 w-3.5" />
              {periodLabel}
            </span>
            {lastUpdateLabel && (
              <span className="text-xs text-text-secondary">Atualizado {lastUpdateLabel}</span>
            )}
          </div>
        </div>
        {cycleSelector && <div className="w-full shrink-0 sm:w-auto">{cycleSelector}</div>}
      </div>
    </div>
  );
}
