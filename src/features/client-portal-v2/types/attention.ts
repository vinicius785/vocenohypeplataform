import type { PublicCampanha, PublicEntrega, PublicInfluencer } from "@/lib/portal-types";

/**
 * Tipos derivados da V2 — nunca reaproveitam a forma da V1 (`Card`/
 * `CardDef` etc). Tudo aqui é calculado a partir de `ClienteLinkData` (a
 * MESMA fonte de dados da V1), nunca uma tabela nova: a V2 é uma leitura e
 * apresentação diferentes do mesmo dado real, não um esquema paralelo.
 */

export type AttentionKind =
  | "influencer_review"
  | "content_review"
  | "briefing_confirmation"
  | "deadline_soon";

export type AttentionItem = {
  id: string;
  kind: AttentionKind;
  campanhaId: string;
  campanhaNome: string;
  /** Quantos itens iguais este cartão resume (ex.: "6 influenciadores
   * aguardam avaliação") — nunca um item por influenciador na Prioridade 1,
   * pra não virar uma lista longa igual a um feed. */
  count: number;
  description: string;
  dueLabel?: string;
  priority: "high" | "medium" | "low";
  ctaLabel: string;
  /** Rota da V2 pra onde o CTA deve levar. */
  href: string;
};

export type CampaignHealth = "on_track" | "attention" | "at_risk";

export type CampaignSummary = {
  id: string;
  nome: string;
  prazo?: string;
  dataInicio?: string;
  stageLabel: string;
  progressPercent: number;
  influencersApproved: number;
  influencersTotal: number;
  contentPublished: number;
  contentPlanned: number;
  pendingCount: number;
  nextMilestoneLabel?: string;
  health: CampaignHealth;
};

export type ActivityKind =
  | "content_published"
  | "profile_approved"
  | "adjustment_requested"
  | "report_available"
  | "comment_replied";

export type ActivityEntry = {
  id: string;
  kind: ActivityKind;
  at: string;
  label: string;
  campanhaId: string;
  campanhaNome: string;
  href: string;
};

export type { PublicCampanha, PublicEntrega, PublicInfluencer };
