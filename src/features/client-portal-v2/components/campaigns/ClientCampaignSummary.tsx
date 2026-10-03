import { KpiCell, KpiStrip } from "@/components/shared/Kpi";
import type { CampaignSummary } from "../../types/attention";

/** Faixa de resumo operacional — substitui os seis cards genéricos
 * antigos por uma única superfície com `SummaryStat` (mesmo componente
 * compartilhado do time). Omite "Próximo marco" quando não existe —
 * nunca mostra um traço num card vazio. */
export function ClientCampaignSummary({ campaign }: { campaign: CampaignSummary }) {
  return (
    <KpiStrip aria-label="Resumo da campanha">
      <KpiCell
        label="Progresso"
        value={`${campaign.progressPercent}%`}
        complement={
          campaign.contentPlanned > 0
            ? `${campaign.contentPublished} de ${campaign.contentPlanned} conteúdos`
            : undefined
        }
        progress={{
          pct: campaign.progressPercent,
          ariaLabel: `${campaign.progressPercent}% concluído`,
        }}
      />
      <KpiCell
        label="Influenciadores"
        value={`${campaign.influencersApproved}/${campaign.influencersTotal}`}
        complement="aprovados"
      />
      <KpiCell label="Conteúdos planejados" value={campaign.contentPlanned.toString()} />
      <KpiCell
        label="Publicados"
        value={campaign.contentPublished.toString()}
        tone={campaign.contentPublished > 0 ? "success" : undefined}
      />
      <KpiCell
        label="Pendências"
        value={campaign.pendingCount.toString()}
        tone={campaign.pendingCount > 0 ? "warning" : undefined}
      />
      {campaign.nextMilestoneLabel && (
        <KpiCell label="Próximo marco" value={campaign.nextMilestoneLabel} />
      )}
    </KpiStrip>
  );
}
