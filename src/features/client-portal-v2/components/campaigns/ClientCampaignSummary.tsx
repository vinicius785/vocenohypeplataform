import { SummaryStat } from "@/components/shared/SummaryStat";
import type { CampaignSummary } from "../../types/attention";

/** Faixa de resumo operacional — substitui os seis cards genéricos
 * antigos por uma única superfície com `SummaryStat` (mesmo componente
 * compartilhado do time). Omite "Próximo marco" quando não existe —
 * nunca mostra um traço num card vazio. */
export function ClientCampaignSummary({ campaign }: { campaign: CampaignSummary }) {
  return (
    <div className="flex flex-wrap rounded-2xl bg-card dark:shadow-none">
      <SummaryStat
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
      <SummaryStat
        label="Influenciadores"
        value={`${campaign.influencersApproved}/${campaign.influencersTotal}`}
        complement="aprovados"
      />
      <SummaryStat label="Conteúdos planejados" value={campaign.contentPlanned.toString()} />
      <SummaryStat
        label="Publicados"
        value={campaign.contentPublished.toString()}
        tone={campaign.contentPublished > 0 ? "success" : undefined}
      />
      <SummaryStat
        label="Pendências"
        value={campaign.pendingCount.toString()}
        tone={campaign.pendingCount > 0 ? "warning" : undefined}
      />
      {campaign.nextMilestoneLabel && (
        <SummaryStat label="Próximo marco" value={campaign.nextMilestoneLabel} />
      )}
    </div>
  );
}
