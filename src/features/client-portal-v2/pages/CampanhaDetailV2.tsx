import { useEffect, useMemo } from "react";
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

type Foco = "briefing" | "influenciadores" | "conteudos";

const FOCO_SECTION_ID: Record<Exclude<Foco, "briefing">, string> = {
  influenciadores: "campanha-influenciadores",
  conteudos: "campanha-conteudos",
};

/**
 * Página única e vertical da campanha — TODAS as seções na mesma rota
 * (`/portal-v2/campanhas/$campanhaId`), sem abas/sub-rotas/menu
 * horizontal (rodada de correção estrutural). Ordem fixa: cabeçalho →
 * resumo → informações → cronograma → influenciadores → conteúdos →
 * resultados → relatórios/arquivos → atividade recente.
 *
 * `openContentId`/`foco`/`openReportId` — deep links contextuais (nunca
 * abrem uma página-mãe): `conteudo` some junto de `influenciador` pra
 * abrir também o viewer daquele conteúdo por cima do drawer; `foco` rola
 * até a seção de influenciadores/conteúdos (destino de atividade
 * agrupada); `relatorio` rola até Relatórios e arquivos.
 */
export function CampanhaDetailV2({
  campanhaId,
  openInfluencerId,
  openContentId,
  foco,
  openReportId,
}: {
  campanhaId: string;
  openInfluencerId?: string;
  openContentId?: string;
  foco?: Foco;
  openReportId?: string;
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

  // `foco`/`relatorio` rolam até a seção certa em vez de abrir qualquer
  // página nova — nunca depende de layout ainda não montado (roda depois
  // do primeiro paint).
  useEffect(() => {
    const targetId =
      foco && foco !== "briefing"
        ? FOCO_SECTION_ID[foco]
        : openReportId
          ? "campanha-recursos"
          : null;
    if (!targetId) return;
    const el = document.getElementById(targetId);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [foco, openReportId]);

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

      <div id="campanha-influenciadores">
        <ClientCampaignCreators
          influencers={campaign.influencers}
          onOpenInfluencer={openInfluencer}
        />
      </div>

      <div id="campanha-conteudos">
        <ClientCampaignDeliverables items={contentItems} />
      </div>

      <ClientCampaignResults entregas={allEntregas} />

      <div id="campanha-recursos">
        <ClientCampaignResources campaign={campaign} highlightReportId={openReportId} />
      </div>

      <ClientCampaignActivity entries={activity} />

      {openInfluencerId && (
        <ClientCampaignInfluencerDrawer
          campanhaId={campanhaId}
          influencerId={openInfluencerId}
          initialContentId={openContentId}
          initialFoco={foco === "briefing" ? "briefing" : undefined}
          onClose={closeInfluencer}
        />
      )}
    </PageContainer>
  );
}
