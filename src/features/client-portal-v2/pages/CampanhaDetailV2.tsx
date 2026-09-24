import { useEffect, useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { PageContainer } from "@/components/shared/PageContainer";
import { EmptyState } from "@/components/shared/EmptyState";
import { usePortalSessionData } from "@/components/portal/portal-session-context";
import { deriveCampaignSummaries, deriveContentItems, deriveRecentActivity } from "../lib/derive";
import { cycleKey, resolveActiveCycle } from "../lib/competencia";
import { ClientCampaignHeader } from "../components/campaigns/ClientCampaignHeader";
import { CampaignCycleSelector } from "../components/campaigns/CampaignCycleSelector";
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
  competencia,
}: {
  campanhaId: string;
  openInfluencerId?: string;
  openContentId?: string;
  foco?: Foco;
  /** `?competencia=YYYY-MM` — só relevante quando a campanha é recorrente. */
  competencia?: string;
  openReportId?: string;
}) {
  const { data } = usePortalSessionData();
  const navigate = useNavigate();
  const campaignRaw = data.campanhas.find((c) => c.id === campanhaId);

  const activeCycle = useMemo(
    () => (campaignRaw?.isRecorrente ? resolveActiveCycle(campaignRaw.cycles, competencia) : null),
    [campaignRaw, competencia],
  );

  // Campanha recorrente: escopa influenciadores (e, por herança, suas
  // entregas/conteúdo/métricas — eles não têm ciclo próprio) ao mês ativo.
  // Nome/cliente/descrição/tipo/identidade visual/responsável continuam
  // globais (não fazem parte de `campaign` aqui, ficam em `summary`).
  const campaign = useMemo(() => {
    if (!campaignRaw) return undefined;
    if (!campaignRaw.isRecorrente) return campaignRaw;
    if (!activeCycle) return { ...campaignRaw, influencers: [] };
    return {
      ...campaignRaw,
      influencers: campaignRaw.influencers.filter((i) => i.campaignCycleId === activeCycle.id),
      relatorios: campaignRaw.relatorios.filter((r) => r.mes === cycleKey(activeCycle)),
    };
  }, [campaignRaw, activeCycle]);

  const goTo = (search: Record<string, string | undefined>) =>
    navigate({
      to: "/portal-v2/campanhas/$campanhaId",
      params: { campanhaId },
      search: { competencia, ...search },
    });

  const openInfluencer = (influencerId: string) => goTo({ influenciador: influencerId });

  const closeInfluencer = () => goTo({});

  const changeCycle = (nextCycle: { competenceYear: number; competenceMonth: number }) => {
    // Muda de mês: nunca carrega o influenciador/conteúdo/foco do mês
    // anterior por engano — cada um só sobrevive se existir de verdade no
    // novo ciclo (checado no efeito abaixo, que fecha o drawer sozinho
    // quando a participação não existe nesse mês).
    navigate({
      to: "/portal-v2/campanhas/$campanhaId",
      params: { campanhaId },
      search: { competencia: cycleKey(nextCycle) },
    });
  };

  const summaries = useMemo(() => deriveCampaignSummaries(data), [data]);
  const summary = summaries.find((c) => c.id === campanhaId);

  const contentItems = useMemo(() => {
    const all = deriveContentItems(data).filter((i) => i.campanhaId === campanhaId);
    if (!campaign) return all;
    const visibleInfluencerIds = new Set(campaign.influencers.map((i) => i.id));
    return all.filter((i) => visibleInfluencerIds.has(i.influencerId));
  }, [data, campanhaId, campaign]);
  const activity = useMemo(
    () => deriveRecentActivity(data, 30).filter((e) => e.campanhaId === campanhaId),
    [data, campanhaId],
  );

  // Se o influenciador aberto na URL não existe mais no mês ativo (trocou
  // de ciclo, ou o link é de um mês diferente), fecha o drawer sozinho —
  // nunca reaproveita o status/entregas de outro mês por engano.
  useEffect(() => {
    if (!campaign || !openInfluencerId) return;
    const stillExists = campaign.influencers.some((i) => i.id === openInfluencerId);
    if (!stillExists) closeInfluencer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaign, openInfluencerId]);

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

  // Conteúdo/resultados só existem pra influenciador aprovado — recusado
  // nunca conta (ver `deriveContentItems`/`deriveCampaignSummaries`).
  const allEntregas = campaign.influencers
    .filter((i) => i.status === "APROVADO")
    .flatMap((i) => i.entregas);

  return (
    <PageContainer className="space-y-8">
      <ClientCampaignHeader
        campaign={summary}
        clientLogo={data.clienteFoto}
        clientName={data.clienteNome}
        lastUpdateLabel={lastUpdateLabel}
        cycleSelector={
          campaignRaw?.isRecorrente ? (
            <CampaignCycleSelector
              cycles={campaignRaw.cycles}
              active={activeCycle}
              onChange={changeCycle}
            />
          ) : undefined
        }
      />

      <ClientCampaignSummary campaign={summary} />

      <ClientCampaignInfo campaign={campaign} />

      <ClientCampaignTimeline items={campaign.cronograma} />

      {campaignRaw?.isRecorrente && !activeCycle ? (
        <EmptyState
          compact
          title="Campanha recorrente sem ciclo ainda"
          description="Assim que o time criar o primeiro mês operacional, ele aparece aqui."
        />
      ) : (
        <>
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
        </>
      )}

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
