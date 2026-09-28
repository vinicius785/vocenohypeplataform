import { CalendarClock, Users } from "lucide-react";
import { ClienteLogo } from "@/components/clientes/ClienteLogo";
import { Badge } from "@/components/ui/badge";
import type { CampaignSummary } from "../../types/attention";
import { getClientFacingStatus } from "../../lib/client-status";

/**
 * Card da listagem — MESMA identidade que reaparece no cabeçalho do
 * detalhe (logo do cliente via `ClienteLogo`, nome, status operacional,
 * período, progresso com contexto): nunca números divergentes entre a
 * lista e a página da campanha, porque os dois leem o mesmo
 * `CampaignSummary`. Card inteiro clicável (stretched button, mesma
 * técnica de `campanhas/CampanhaCard.tsx` do time). O badge é sempre um
 * status operacional objetivo — nunca saúde/risco (ver `client-status.ts`).
 */
export function ClientCampaignCard({
  campaign,
  clientLogo,
  clientName,
  onOpen,
}: {
  campaign: CampaignSummary;
  clientLogo?: string;
  clientName: string;
  onOpen: () => void;
}) {
  const status = getClientFacingStatus(campaign);
  const periodLabel = campaign.prazo
    ? `Prazo ${new Date(campaign.prazo).toLocaleDateString("pt-BR")}`
    : "Sem prazo definido";

  return (
    <div className="group relative flex w-full max-w-[500px] flex-col rounded-[20px] border border-transparent bg-card p-4 transition-colors duration-150 hover:border-border hover:bg-accent/40 dark:shadow-none">
      <button
        type="button"
        onClick={onOpen}
        className="absolute inset-0 rounded-[20px] transition-transform duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand active:scale-[0.99]"
        aria-label={`Ver campanha ${campaign.nome}, ${status.label}`}
      />

      <div className="pointer-events-none flex items-start gap-3">
        <ClienteLogo photo={clientLogo} empresa={clientName} size="md" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold text-foreground">{campaign.nome}</p>
        </div>
        <Badge variant={status.tone} className="shrink-0">
          {status.label}
        </Badge>
      </div>

      <div className="pointer-events-none mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-border/60 pt-3 text-xs text-text-secondary">
        <span className="inline-flex items-center gap-1.5">
          <CalendarClock className="h-3.5 w-3.5" />
          {periodLabel}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Users className="h-3.5 w-3.5" />
          {campaign.influencersApproved}/{campaign.influencersTotal} influenciadores
        </span>
        {campaign.pendingCount > 0 && (
          <span className="inline-flex items-center gap-1.5 font-medium text-warning">
            {campaign.pendingCount} pendência{campaign.pendingCount > 1 ? "s" : ""}
          </span>
        )}
      </div>

      <div className="pointer-events-none mt-3">
        <p className="text-xs text-text-secondary">
          {campaign.contentPublished} de {campaign.contentPlanned || 0} conteúdos publicados
        </p>
        <div className="mt-1.5 flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-brand"
              style={{ width: `${campaign.progressPercent}%` }}
            />
          </div>
          <span className="w-9 shrink-0 text-right text-xs font-medium tabular-nums text-foreground">
            {campaign.progressPercent}%
          </span>
        </div>
      </div>

      <div className="pointer-events-none mt-3 flex items-center justify-between border-t border-border/60 pt-3 text-xs">
        <span className="truncate text-text-secondary">
          {campaign.nextMilestoneLabel ? `Próximo marco: ${campaign.nextMilestoneLabel}` : ""}
        </span>
        <span className="shrink-0 font-medium text-brand group-hover:underline">Ver campanha</span>
      </div>
    </div>
  );
}
