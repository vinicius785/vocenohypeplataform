import type { ClienteLinkData, PublicCampanha } from "@/lib/portal-types";
import type {
  ActivityEntry,
  AttentionItem,
  ClientCampaignStatus,
  CampaignSummary,
} from "../types/attention";
import type { ApprovalItem } from "../types/approvals";
import type { ContentItem } from "../types/content";
import { cycleKey, formatCompetenceLabel } from "./competencia";

/** Campanha recorrente: sufixo "· Setembro de 2026" (evita ambiguidade
 * quando o mesmo influenciador/campanha tem participações em vários
 * meses) + `&competencia=` no link, pra abrir direto no mês certo — nunca
 * o mês corrente se a ação pertence a outro. Campanha não-recorrente:
 * sem sufixo, sem parâmetro (não existe o conceito de mês pra ela). */
function competenceContext(
  campanha: PublicCampanha,
  campaignCycleId: string | null | undefined,
): { label: string; queryParam: string } {
  if (!campanha.isRecorrente || !campaignCycleId) return { label: campanha.nome, queryParam: "" };
  const cycle = (campanha.cycles ?? []).find((c) => c.id === campaignCycleId);
  if (!cycle) return { label: campanha.nome, queryParam: "" };
  return {
    label: `${campanha.nome} · ${formatCompetenceLabel(cycle)}`,
    queryParam: `&competencia=${cycleKey(cycle)}`,
  };
}

/**
 * Toda a "inteligência" da V2 mora aqui, como funções puras sobre o MESMO
 * `ClienteLinkData` que a V1 já usa (nenhuma tabela nova, nenhum schema
 * paralelo) — a V2 muda como o dado é lido e apresentado, não o dado em si.
 * Sem React, sem Supabase: testável isoladamente (ver `tests/derive.test.ts`).
 */

function daysUntil(dateIso: string | undefined, now: number): number | null {
  if (!dateIso) return null;
  const t = new Date(dateIso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.ceil((t - now) / (1000 * 60 * 60 * 24));
}

/** Sempre factual — nunca um rótulo de julgamento como "Atrasado"/"X dias
 * atrasado" (isso é uma classificação de saúde/risco interna, não uma
 * comunicação objetiva de prazo). Um prazo já passado ainda mostra a
 * data real, só no passado. */
function dueLabelFrom(days: number | null, prazoIso: string | undefined): string | undefined {
  if (days === null || !prazoIso) return undefined;
  if (days === 0) return "Prazo hoje";
  if (days === 1) return "Prazo amanhã";
  if (days > 1) return `Prazo em ${days} dias`;
  return `Prazo era em ${new Date(prazoIso).toLocaleDateString("pt-BR")}`;
}

/**
 * "Precisa da sua atenção" — cada linha é UM item real e nomeado, com
 * destino próprio (campanha + influenciador, e quando aplicável +
 * conteúdo) — nunca mais um grupo genérico tipo "Ver briefings"/"Ver
 * aprovações" apontando pra uma página que nem existe mais (rodada de
 * simplificação: Aprovações/Conteúdos deixaram de ser páginas
 * independentes). Só entra aqui quem satisfaz TODAS as condições:
 * depende de uma ação do CLIENTE, está num estado realmente acionável
 * (nunca "aguardando a equipe"/"em produção"/concluído/cancelado), e tem
 * um destino contextual válido. Não existe mais a pendência genérica de
 * "briefing personalizado" — nenhuma campanha exige briefing por regra
 * global; um briefing só vira pendência quando a campanha realmente usa
 * um E ele já foi enviado ao cliente com uma ação explícita pendente, o
 * que hoje não tem um campo de status próprio no dado (só texto livre) —
 * por isso não há mais nenhum item de briefing aqui até esse status
 * existir de verdade (ver auditoria desta rodada).
 */
export function deriveAttentionItems(data: ClienteLinkData, now = Date.now()): AttentionItem[] {
  const items: AttentionItem[] = [];

  for (const campanha of data.campanhas) {
    const days = daysUntil(campanha.prazo, now);
    const priority: AttentionItem["priority"] =
      days !== null && days <= 1 ? "high" : days !== null && days <= 3 ? "medium" : "low";

    for (const influencer of campanha.influencers) {
      const { label: campanhaNome, queryParam } = competenceContext(
        campanha,
        influencer.campaignCycleId,
      );

      if (influencer.status === "ENVIADO_AO_CLIENTE") {
        items.push({
          id: `influ:${influencer.id}`,
          kind: "influencer_review",
          campanhaId: campanha.id,
          campanhaNome,
          count: 1,
          description: `Perfil de ${influencer.nome} aguarda sua avaliação`,
          dueLabel: dueLabelFrom(days, campanha.prazo),
          priority,
          ctaLabel: "Avaliar perfil",
          href: `/portal-v2/campanhas/${campanha.id}?influenciador=${influencer.id}${queryParam}`,
        });
      }

      for (const entrega of influencer.entregas) {
        if (entrega.stage !== "ROTEIRO_APROVACAO" && entrega.stage !== "CONTEUDO_APROVACAO") {
          continue;
        }
        const tipoLabel = entrega.stage === "ROTEIRO_APROVACAO" ? "Roteiro" : entrega.tipo;
        items.push({
          id: `entrega:${entrega.id}`,
          kind: "content_review",
          campanhaId: campanha.id,
          campanhaNome,
          count: 1,
          description: `${tipoLabel} de ${influencer.nome} aguarda sua aprovação`,
          dueLabel: dueLabelFrom(days, campanha.prazo),
          priority,
          ctaLabel: "Revisar",
          href: `/portal-v2/campanhas/${campanha.id}?influenciador=${influencer.id}&entrega=${entrega.id}${queryParam}`,
        });
      }
    }
  }

  const priorityRank: Record<AttentionItem["priority"], number> = { high: 0, medium: 1, low: 2 };
  return items.sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority]);
}

/**
 * Status operacional pro CLIENTE — nunca uma classificação de saúde/risco
 * (isso é gestão interna da equipe, não pertence ao portal). Cada valor
 * vem de um FATO real: todo conteúdo planejado já foi publicado
 * (concluída), existe influenciador aprovado com produção em andamento
 * (em andamento), ou nada disso ainda aconteceu (planejada). Nunca deriva
 * de prazo estourado nem de contagem de pendências — essas continuam
 * visíveis em outro lugar (prazo real no cabeçalho, pendências em
 * "Precisa da sua atenção"), nunca convertidas numa cor de alerta aqui.
 */
function clientCampaignStatus(
  influencersTotal: number,
  contentPlanned: number,
  contentPublished: number,
): ClientCampaignStatus {
  if (contentPlanned > 0 && contentPublished === contentPlanned) return "completed";
  if (influencersTotal === 0) return "planned";
  return "in_progress";
}

/**
 * Núcleo do resumo/KPIs de uma campanha — recebe os influenciadores
 * explicitamente (em vez de sempre `campanha.influencers`) pra que uma
 * campanha recorrente possa pedir os KPIs de só um mês/ciclo (ver
 * `CampanhaDetailV2`, que passa o subconjunto já filtrado pela
 * competência ativa). Sem esse parâmetro, os KPIs de uma campanha
 * recorrente ficariam sempre somando TODOS os meses juntos, nunca
 * refletindo o mês selecionado — o que o cliente vê no seletor de
 * competência precisa bater com o que os cards mostram.
 */
export function summarizeCampaign(
  campanha: PublicCampanha,
  influencers: PublicCampanha["influencers"] = campanha.influencers,
  now = Date.now(),
): CampaignSummary {
  const influencersTotal = influencers.length;
  const influencersApproved = influencers.filter((i) => i.status === "APROVADO").length;
  // Conteúdo só existe pra influenciador aprovado — um recusado nunca
  // conta nas métricas de entrega da campanha.
  const entregas = influencers.filter((i) => i.status === "APROVADO").flatMap((i) => i.entregas);
  const contentPlanned = entregas.length;
  const contentPublished = entregas.filter((e) => e.stage === "PUBLICADA").length;
  const pendingCount =
    influencers.filter((i) => i.status === "ENVIADO_AO_CLIENTE").length +
    entregas.filter((e) => e.stage === "ROTEIRO_APROVACAO" || e.stage === "CONTEUDO_APROVACAO")
      .length;
  const nextMilestone = [...campanha.cronograma]
    .filter((c) => new Date(c.date).getTime() >= now)
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  const progressPercent =
    contentPlanned > 0 ? Math.round((contentPublished / contentPlanned) * 100) : 0;

  return {
    id: campanha.id,
    nome: campanha.nome,
    prazo: campanha.prazo,
    dataInicio: campanha.dataInicio,
    status: clientCampaignStatus(influencersTotal, contentPlanned, contentPublished),
    progressPercent,
    influencersApproved,
    influencersTotal,
    contentPublished,
    contentPlanned,
    pendingCount,
    nextMilestoneLabel: nextMilestone?.title,
  };
}

export function deriveCampaignSummaries(
  data: ClienteLinkData,
  now = Date.now(),
): CampaignSummary[] {
  return data.campanhas.map((campanha) => summarizeCampaign(campanha, campanha.influencers, now));
}

/**
 * Contagem de decisões pendentes reais (uma por influenciador/entrega
 * acionável) — não alimenta mais uma página própria de Aprovações (essa
 * página foi removida nesta rodada; cada decisão agora se toma dentro do
 * drawer do influenciador/conteúdo, na própria campanha). Usado hoje só
 * pro indicador "Pendências" da Início.
 */
export function deriveApprovalItems(data: ClienteLinkData, now = Date.now()): ApprovalItem[] {
  const items: ApprovalItem[] = [];

  for (const campanha of data.campanhas) {
    const days = daysUntil(campanha.prazo, now);
    const priority: ApprovalItem["priority"] =
      days !== null && days <= 1 ? "high" : days !== null && days <= 3 ? "medium" : "low";

    for (const influencer of campanha.influencers) {
      if (influencer.status === "ENVIADO_AO_CLIENTE") {
        items.push({
          id: `influ:${influencer.id}`,
          kind: "influencer",
          campanhaId: campanha.id,
          campanhaNome: campanha.nome,
          influencerId: influencer.id,
          influencerNome: influencer.nome,
          title: influencer.nome,
          subtitle: influencer.nicho,
          dueLabel: dueLabelFrom(days, campanha.prazo),
          priority,
        });
      }
      for (const entrega of influencer.entregas) {
        if (entrega.stage === "ROTEIRO_APROVACAO" || entrega.stage === "CONTEUDO_APROVACAO") {
          items.push({
            id: `entrega:${entrega.id}`,
            kind: "content",
            campanhaId: campanha.id,
            campanhaNome: campanha.nome,
            influencerId: influencer.id,
            influencerNome: influencer.nome,
            entregaId: entrega.id,
            title: entrega.titulo || entrega.tipo,
            subtitle: `${influencer.nome} · ${entrega.stage === "ROTEIRO_APROVACAO" ? "Roteiro" : "Conteúdo final"}`,
            dueLabel: dueLabelFrom(days, campanha.prazo),
            priority,
          });
        }
      }
    }
  }

  const priorityRank: Record<ApprovalItem["priority"], number> = { high: 0, medium: 1, low: 2 };
  return items.sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority]);
}

/**
 * Biblioteca de conteúdos — achata todas as entregas de todas as
 * campanhas/influenciadores num único array de itens exibíveis, cada um
 * carregando o contexto (campanha/influenciador) já resolvido, pra a
 * página nunca precisar re-percorrer `ClienteLinkData` pra montar um
 * breadcrumb.
 */
/** Conteúdos (§ Campanhas > Conteúdos e entregas) só existem pra
 * influenciadores APROVADOS — um perfil recusado nunca teve entrega
 * combinada de verdade, então suas entregas (se houver alguma órfã no
 * dado) nunca devem contar aqui, mesmo que status do influenciador mude
 * depois. */
export function deriveContentItems(data: ClienteLinkData): ContentItem[] {
  const items: ContentItem[] = [];
  for (const campanha of data.campanhas) {
    for (const influencer of campanha.influencers) {
      if (influencer.status !== "APROVADO") continue;
      for (const entrega of influencer.entregas) {
        items.push({
          entrega,
          campanhaId: campanha.id,
          campanhaNome: campanha.nome,
          influencerId: influencer.id,
          influencerNome: influencer.nome,
        });
      }
    }
  }
  return items.sort((a, b) =>
    (b.entrega.ultimaAtualizacao ?? "").localeCompare(a.entrega.ultimaAtualizacao ?? ""),
  );
}

const ACTIVITY_KIND_LABEL: Record<string, string> = {
  perfil_aprovado: "Perfil aprovado",
  perfil_recusado: "Perfil não aprovado",
  perfil_reaberto: "Aprovação reaberta",
  roteiro_aprovado: "Roteiro aprovado",
  conteudo_aprovado: "Conteúdo aprovado",
  ajuste_solicitado: "Ajuste solicitado",
  roteiro_ajustes_solicitados: "Ajustes solicitados no roteiro",
  conteudo_ajustes_solicitados: "Ajustes solicitados no conteúdo",
  publicado: "Conteúdo publicado",
  comentario_cliente: "Comentário adicionado",
};

/** Eventos deste tipo nunca são agrupados — cada um precisa manter autor/
 * texto/contexto individual (comentários e ajustes têm conteúdo próprio;
 * "reaberto" é raro o bastante pra nunca precisar resumir). */
const NEVER_GROUP_KINDS = new Set([
  "comentario_cliente",
  "comentario_equipe",
  "roteiro_ajustes_solicitados",
  "conteudo_ajustes_solicitados",
  "ajuste_solicitado",
  "perfil_reaberto",
]);

/** Rótulo de GRUPO (plural, "N perfis foram aprovados") pros tipos com
 * resultado uniforme — só esses têm sentido resumidos em uma linha só,
 * porque "aprovado" de um item é idêntico ao de outro (nunca aprova com
 * reprova juntos, isso já é garantido por serem `kind`s diferentes). */
const GROUP_LABEL: Record<string, (n: number) => string> = {
  perfil_aprovado: (n) => `${n} perfis foram aprovados`,
  perfil_recusado: (n) => `${n} perfis não foram aprovados`,
  roteiro_aprovado: (n) => `${n} roteiros foram aprovados`,
  conteudo_aprovado: (n) => `${n} conteúdos foram aprovados`,
  publicado: (n) => `${n} conteúdos foram publicados`,
};

type RawActivityEvent = {
  id: string;
  kind: string;
  createdAt: string;
  campanhaId: string;
  campanhaNome: string;
  influencerId?: string;
  href: string;
  /** Ciclo/mês desta participação, quando a campanha é recorrente — usado
   * pra nunca agrupar eventos de meses diferentes (§8) e pra preservar a
   * competência no link (§20). */
  campaignCycleId?: string | null;
  /** Só preenchido pra `report_available` — nome do relatório, pro rótulo
   * não cair no fallback genérico do `kind`. */
  label?: string;
};

/**
 * Atividade recente — agrupa eventos do MESMO tipo, MESMA campanha e
 * MESMO dia (janela de tempo coerente) num resumo só ("3 perfis foram
 * aprovados"), em vez de repetir uma linha idêntica por evento. Nunca
 * agrupa comentários, ajustes ou reaberturas (mantêm contexto
 * individual), nem eventos de campanhas/dias/resultados diferentes.
 * `limit` corta o total — o componente decide quantos MOSTRAR por
 * breakpoint (5 desktop/4 tablet/3 mobile) via CSS, então aqui só
 * limitamos ao teto do maior caso (desktop).
 */
export function deriveRecentActivity(data: ClienteLinkData, limit = 5): ActivityEntry[] {
  const raw: RawActivityEvent[] = [];
  for (const campanha of data.campanhas) {
    for (const influencer of campanha.influencers) {
      const { label: campanhaNome, queryParam } = competenceContext(
        campanha,
        influencer.campaignCycleId,
      );
      for (const event of influencer.activityEvents ?? []) {
        raw.push({
          id: event.id,
          kind: event.kind,
          createdAt: event.createdAt,
          campanhaId: campanha.id,
          campanhaNome,
          influencerId: influencer.id,
          campaignCycleId: influencer.campaignCycleId,
          href: `/portal-v2/campanhas/${campanha.id}?influenciador=${influencer.id}${queryParam}`,
        });
      }
    }
    for (const relatorio of campanha.relatorios) {
      raw.push({
        id: `relatorio:${relatorio.id}`,
        kind: "report_available",
        createdAt: relatorio.uploadedAt,
        campanhaId: campanha.id,
        campanhaNome: campanha.nome,
        href: `/portal-v2/campanhas/${campanha.id}?relatorio=${relatorio.id}`,
        label: `Relatório disponível: ${relatorio.nome}`,
      });
    }
  }
  raw.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const entries: ActivityEntry[] = [];
  const groupedAway = new Set<string>();

  for (let i = 0; i < raw.length; i++) {
    const event = raw[i];
    if (groupedAway.has(event.id)) continue;

    const groupLabel = GROUP_LABEL[event.kind];
    if (groupLabel && !NEVER_GROUP_KINDS.has(event.kind)) {
      const day = event.createdAt.slice(0, 10);
      // Mesmo tipo + mesma campanha + mesma competência + mesmo dia — nunca
      // agrupa meses diferentes de uma campanha recorrente (§8/§9).
      const siblings = raw.filter(
        (other) =>
          other.kind === event.kind &&
          other.campanhaId === event.campanhaId &&
          other.campaignCycleId === event.campaignCycleId &&
          other.createdAt.slice(0, 10) === day,
      );
      if (siblings.length > 1) {
        for (const sibling of siblings) groupedAway.add(sibling.id);
        const isInfluencerEvent = event.kind.startsWith("perfil_");
        const eventCampanha = data.campanhas.find((c) => c.id === event.campanhaId);
        const cycleParam = event.campaignCycleId
          ? eventCampanha?.cycles?.find((c) => c.id === event.campaignCycleId)
          : undefined;
        const focoParam = `foco=${isInfluencerEvent ? "influenciadores" : "conteudos"}`;
        entries.push({
          id: `group:${event.kind}:${event.campanhaId}:${event.campaignCycleId ?? "none"}:${day}`,
          kind: "profile_approved",
          at: siblings[0].createdAt,
          label: groupLabel(siblings.length),
          campanhaId: event.campanhaId,
          campanhaNome: event.campanhaNome,
          href: `/portal-v2/campanhas/${event.campanhaId}?${focoParam}${
            cycleParam ? `&competencia=${cycleKey(cycleParam)}` : ""
          }`,
          count: siblings.length,
        });
        continue;
      }
    }

    entries.push({
      id: event.id,
      kind: "profile_approved",
      at: event.createdAt,
      label: event.label ?? ACTIVITY_KIND_LABEL[event.kind] ?? event.kind,
      campanhaId: event.campanhaId,
      campanhaNome: event.campanhaNome,
      href: event.href,
      count: 1,
    });
  }

  return entries.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}
