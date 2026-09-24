import { useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { PageContainer } from "@/components/shared/PageContainer";
import { EmptyState } from "@/components/shared/EmptyState";
import { usePortalSessionData } from "@/components/portal/portal-session-context";
import { deriveCampaignSummaries, deriveContentItems, deriveRecentActivity } from "../lib/derive";
import { ClientCampaignHeader } from "../components/campaigns/ClientCampaignHeader";
import { ClientCampaignSummary } from "../components/campaigns/ClientCampaignSummary";
import { ClientCampaignInfo } from "../components/campaigns/ClientCampaignInfo";
import { ClientCampaignTimeline } from "../components/campaigns/ClientCampaignTimeline";
import { ClientCampaignCreators } from "../components/campaigns/ClientCampaignCreators";
import { ClientCampaignDeliverables } from "../components/campaigns/ClientCampaignDeliverables";
import { ClientCampaignResults } from "../components/campaigns/ClientCampaignResults";
import { ClientCampaignResources } from "../components/campaigns/ClientCampaignResources";
import { ClientCampaignActivity } from "../components/campaigns/ClientCampaignActivity";
import { ClientCampaignInfluencerDrawer } from "../components/influencer/ClientCampaignInfluencerDrawer";

/**
 * Página única e vertical da campanha — TODAS as seções na mesma rota
 * (`/portal-v2/campanhas/$campanhaId`), sem abas/sub-rotas/menu
 * horizontal (rodada de correção estrutural). Ordem fixa: cabeçalho →
 * resumo → informações → cronograma → influenciadores → conteúdos →
 * resultados → relatórios/arquivos → atividade recente.
 */
export function CampanhaDetailV2({
  campanhaId,
  openInfluencerId,
}: {
  campanhaId: string;
  openInfluencerId?: string;
}) {
  const { data } = usePortalSessionData();
  const navigate = useNavigate();
  const campaign = data.campanhas.find((c) => c.id === campanhaId);

  const openInfluencer = (influencerId: string) =>
    navigate({
      to: "/portal-v2/campanhas/$campanhaId",
      params: { campanhaId },
      search: { influenciador: influencerId },
    });

  const closeInfluencer = () =>
    navigate({
      to: "/portal-v2/campanhas/$campanhaId",
      params: { campanhaId },
      search: {},
    });
  const summaries = useMemo(() => deriveCampaignSummaries(data), [data]);
  const summary = summaries.find((c) => c.id === campanhaId);

  const contentItems = useMemo(
    () => deriveContentItems(data).filter((i) => i.campanhaId === campanhaId),
    [data, campanhaId],
  );
  const activity = useMemo(
    () => deriveRecentActivity(data, 30).filter((e) => e.campanhaId === campanhaId),
    [data, campanhaId],
  );

  const lastUpdateLabel = useMemo(() => {
    if (!campaign) return undefined;
    const dates: string[] = [];
    for (const influencer of campaign.influencers) {
      for (const event of influencer.activityEvents ?? []) dates.push(event.createdAt);
    }
    for (const r of campaign.relatorios) dates.push(r.uploadedAt);
    if (dates.length === 0) return undefined;
    const latest = dates.sort().at(-1)!;
    return new Date(latest).toLocaleDateString("pt-BR");
  }, [campaign]);

  if (!campaign || !summary) {
    return (
      <PageContainer>
        <EmptyState
          title="Campanha não encontrada"
          description="Ela pode ter sido removida ou você não tem mais acesso a ela."
        />
      </PageContainer>
    );
  }

  const allEntregas = campaign.influencers.flatMap((i) => i.entregas);

  return (
    <PageContainer className="space-y-8">
      <ClientCampaignHeader
        campaign={summary}
        clientLogo={data.clienteFoto}
        clientName={data.clienteNome}
        lastUpdateLabel={lastUpdateLabel}
      />

      <ClientCampaignSummary campaign={summary} />

      <ClientCampaignInfo campaign={campaign} />

      <ClientCampaignTimeline items={campaign.cronograma} />

      <ClientCampaignCreators
        influencers={campaign.influencers}
        onOpenInfluencer={openInfluencer}
      />

      <ClientCampaignDeliverables items={contentItems} />

      <ClientCampaignResults entregas={allEntregas} />

      <ClientCampaignResources campaign={campaign} />

      <ClientCampaignActivity entries={activity} />

      {openInfluencerId && (
        <ClientCampaignInfluencerDrawer
          campanhaId={campanhaId}
          influencerId={openInfluencerId}
          onClose={closeInfluencer}
        />
      )}
    </PageContainer>
  );
}
