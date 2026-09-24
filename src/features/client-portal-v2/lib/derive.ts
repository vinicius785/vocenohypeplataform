import type { ClienteLinkData } from "@/lib/portal-types";
import type {
  ActivityEntry,
  AttentionItem,
  CampaignHealth,
  CampaignSummary,
} from "../types/attention";
import type { ApprovalItem } from "../types/approvals";
import type { ContentItem } from "../types/content";

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

function dueLabelFrom(days: number | null): string | undefined {
  if (days === null) return undefined;
  if (days < 0) return "Atrasado";
  if (days === 0) return "Prazo hoje";
  if (days === 1) return "Prazo amanhã";
  return `Prazo em ${days} dias`;
}

/**
 * Prioridade 1 da Início: só ações reais, uma linha por TIPO+CAMPANHA (ex.:
 * "6 influenciadores aguardam avaliação" em vez de 6 linhas repetidas) —
 * regra explícita do produto: nunca virar um feed item-a-item.
 */
export function deriveAttentionItems(data: ClienteLinkData, now = Date.now()): AttentionItem[] {
  const items: AttentionItem[] = [];

  for (const campanha of data.campanhas) {
    const pendingInfluencers = campanha.influencers.filter(
      (i) => i.status === "ENVIADO_AO_CLIENTE",
    );
    if (pendingInfluencers.length > 0) {
      const days = daysUntil(campanha.prazo, now);
      items.push({
        id: `influ-review:${campanha.id}`,
        kind: "influencer_review",
        campanhaId: campanha.id,
        campanhaNome: campanha.nome,
        count: pendingInfluencers.length,
        description: `${pendingInfluencers.length} influenciador${pendingInfluencers.length > 1 ? "es" : ""} aguarda${pendingInfluencers.length > 1 ? "m" : ""} sua avaliação`,
        dueLabel: dueLabelFrom(days),
        priority: days !== null && days <= 1 ? "high" : "medium",
        ctaLabel: "Revisar perfis",
        href: `/portal-v2/campanhas/${campanha.id}`,
      });
    }

    const pendingContent = campanha.influencers.flatMap((i) =>
      i.entregas.filter((e) => e.stage === "ROTEIRO_APROVACAO" || e.stage === "CONTEUDO_APROVACAO"),
    );
    if (pendingContent.length > 0) {
      const days = daysUntil(campanha.prazo, now);
      items.push({
        id: `content-review:${campanha.id}`,
        kind: "content_review",
        campanhaId: campanha.id,
        campanhaNome: campanha.nome,
        count: pendingContent.length,
        description: `${pendingContent.length} conteúdo${pendingContent.length > 1 ? "s" : ""} aguarda${pendingContent.length > 1 ? "m" : ""} aprovação`,
        dueLabel: dueLabelFrom(days),
        priority: days !== null && days <= 1 ? "high" : "medium",
        ctaLabel: "Revisar conteúdos",
        href: `/portal-v2/campanhas/${campanha.id}`,
      });
    }

    const missingBriefing = campanha.influencers.filter(
      (i) => i.status === "APROVADO" && !i.briefingPersonalizado,
    );
    if (missingBriefing.length > 0) {
      items.push({
        id: `briefing:${campanha.id}`,
        kind: "briefing_confirmation",
        campanhaId: campanha.id,
        campanhaNome: campanha.nome,
        count: missingBriefing.length,
        description: `${missingBriefing.length} briefing${missingBriefing.length > 1 ? "s" : ""} aguardando confirmação`,
        priority: "low",
        ctaLabel: "Ver briefings",
        href: `/portal-v2/campanhas/${campanha.id}`,
      });
    }

    const days = daysUntil(campanha.prazo, now);
    if (days !== null && days >= 0 && days <= 3) {
      items.push({
        id: `deadline:${campanha.id}`,
        kind: "deadline_soon",
        campanhaId: campanha.id,
        campanhaNome: campanha.nome,
        count: 1,
        description: "Prazo da campanha se aproxima",
        dueLabel: dueLabelFrom(days),
        priority: days <= 1 ? "high" : "medium",
        ctaLabel: "Ver campanha",
        href: `/portal-v2/campanhas/${campanha.id}`,
      });
    }
  }

  const priorityRank: Record<AttentionItem["priority"], number> = { high: 0, medium: 1, low: 2 };
  return items.sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority]);
}

function campaignHealth(pendingCount: number, daysLeft: number | null): CampaignHealth {
  if (daysLeft !== null && daysLeft < 0) return "at_risk";
  if (pendingCount >= 3) return "at_risk";
  if (pendingCount > 0) return "attention";
  return "on_track";
}

export function deriveCampaignSummaries(
  data: ClienteLinkData,
  now = Date.now(),
): CampaignSummary[] {
  return data.campanhas.map((campanha) => {
    const influencersTotal = campanha.influencers.length;
    const influencersApproved = campanha.influencers.filter((i) => i.status === "APROVADO").length;
    const entregas = campanha.influencers.flatMap((i) => i.entregas);
    const contentPlanned = entregas.length;
    const contentPublished = entregas.filter((e) => e.stage === "PUBLICADA").length;
    const pendingCount =
      campanha.influencers.filter((i) => i.status === "ENVIADO_AO_CLIENTE").length +
      entregas.filter((e) => e.stage === "ROTEIRO_APROVACAO" || e.stage === "CONTEUDO_APROVACAO")
        .length;
    const nextMilestone = [...campanha.cronograma]
      .filter((c) => new Date(c.date).getTime() >= now)
      .sort((a, b) => a.date.localeCompare(b.date))[0];
    const daysLeft = daysUntil(campanha.prazo, now);
    const progressPercent =
      contentPlanned > 0 ? Math.round((contentPublished / contentPlanned) * 100) : 0;

    let stageLabel = "Planejamento";
    if (influencersApproved > 0 && contentPublished === 0) stageLabel = "Produção";
    if (contentPublished > 0 && contentPublished < contentPlanned) stageLabel = "Publicação";
    if (contentPlanned > 0 && contentPublished === contentPlanned) stageLabel = "Concluída";

    return {
      id: campanha.id,
      nome: campanha.nome,
      prazo: campanha.prazo,
      dataInicio: campanha.dataInicio,
      stageLabel,
      progressPercent,
      influencersApproved,
      influencersTotal,
      contentPublished,
      contentPlanned,
      pendingCount,
      nextMilestoneLabel: nextMilestone?.title,
      health: campaignHealth(pendingCount, daysLeft),
    };
  });
}

/**
 * Central de Aprovações — cada linha é uma DECISÃO pendente real (nunca
 * agrupada, ao contrário da Prioridade 1 da Início): o cliente precisa
 * poder agir item a item aqui. Segmentado por `kind` pela própria página.
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
          dueLabel: dueLabelFrom(days),
          priority,
        });
      }
      if (influencer.status === "APROVADO" && !influencer.briefingPersonalizado) {
        items.push({
          id: `briefing:${influencer.id}`,
          kind: "briefing",
          campanhaId: campanha.id,
          campanhaNome: campanha.nome,
          influencerId: influencer.id,
          influencerNome: influencer.nome,
          title: `Briefing de ${influencer.nome}`,
          priority: "low",
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
            dueLabel: dueLabelFrom(days),
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
export function deriveContentItems(data: ClienteLinkData): ContentItem[] {
  const items: ContentItem[] = [];
  for (const campanha of data.campanhas) {
    for (const influencer of campanha.influencers) {
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

/** Timeline compacta (Prioridade 3) — lê `activityEvents[]` já existente em
 * cada influenciador (mesmo dado da V1), nunca uma tabela nova de log. */
export function deriveRecentActivity(data: ClienteLinkData, limit = 8): ActivityEntry[] {
  const entries: ActivityEntry[] = [];
  for (const campanha of data.campanhas) {
    for (const influencer of campanha.influencers) {
      for (const event of influencer.activityEvents ?? []) {
        entries.push({
          id: event.id,
          kind: "profile_approved",
          at: event.createdAt,
          label: ACTIVITY_KIND_LABEL[event.kind] ?? event.kind,
          campanhaId: campanha.id,
          campanhaNome: campanha.nome,
          href: `/portal-v2/campanhas/${campanha.id}`,
        });
      }
    }
    for (const relatorio of campanha.relatorios) {
      entries.push({
        id: `relatorio:${relatorio.id}`,
        kind: "report_available",
        at: relatorio.uploadedAt,
        label: `Relatório disponível: ${relatorio.nome}`,
        campanhaId: campanha.id,
        campanhaNome: campanha.nome,
        href: `/portal-v2/reports`,
      });
    }
  }
  return entries.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}
