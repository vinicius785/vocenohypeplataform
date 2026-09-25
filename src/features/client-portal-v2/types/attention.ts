import type { PublicCampanha, PublicEntrega, PublicInfluencer } from "@/lib/portal-types";

/**
 * Tipos derivados da V2 — nunca reaproveitam a forma da V1 (`Card`/
 * `CardDef` etc). Tudo aqui é calculado a partir de `ClienteLinkData` (a
 * MESMA fonte de dados da V1), nunca uma tabela nova: a V2 é uma leitura e
 * apresentação diferentes do mesmo dado real, não um esquema paralelo.
 */

export type AttentionKind = "influencer_review" | "content_review";

export type AttentionItem = {
  id: string;
  kind: AttentionKind;
  campanhaId: string;
  campanhaNome: string;
  /** Sempre 1 nesta rodada — cada linha é UM item nomeado com destino
   * próprio (regra explícita: nunca agrupar "Ver briefings"/"Ver
   * aprovações" genéricos). Mantido pra não quebrar quem já lê `count`. */
  count: number;
  description: string;
  dueLabel?: string;
  priority: "high" | "medium" | "low";
  ctaLabel: string;
  /** Rota da V2 pra onde o CTA deve levar — já aponta pro contexto exato
   * (campanha + influenciador, e quando aplicável + conteúdo), nunca uma
   * página-mãe genérica. */
  href: string;
};

/**
 * Status operacional exposto ao CLIENTE — nunca uma classificação de
 * saúde/risco interna (isso é gestão da equipe da Você no Hype, não
 * pertence ao portal). Ver `lib/client-status.ts` pro rótulo/tom de cada
 * um; nunca converter automaticamente um sinal de risco em "andamento" —
 * cada valor aqui vem de um fato operacional real (conteúdo publicado,
 * existe influenciador aprovado, etc), nunca de prazo estourado ou
 * contagem de pendências.
 */
export type ClientCampaignStatus = "planned" | "in_progress" | "completed";

export type CampaignSummary = {
  id: string;
  nome: string;
  prazo?: string;
  dataInicio?: string;
  status: ClientCampaignStatus;
  progressPercent: number;
  influencersApproved: number;
  influencersTotal: number;
  contentPublished: number;
  contentPlanned: number;
  pendingCount: number;
  nextMilestoneLabel?: string;
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
  /** >1 quando este item representa vários eventos do MESMO tipo,
   * campanha e resultado agrupados numa linha só (ex.: "3 perfis foram
   * aprovados") — nunca agrupa aprovação com reprovação, campanhas ou
   * meses diferentes, nem comentários/ajustes (esses sempre ficam
   * individuais, `count` é sempre 1 pra eles). */
  count: number;
};

export type { PublicCampanha, PublicEntrega, PublicInfluencer };
