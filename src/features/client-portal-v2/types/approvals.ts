export type ApprovalKind = "influencer" | "content" | "briefing";

export type ApprovalItem = {
  id: string;
  kind: ApprovalKind;
  campanhaId: string;
  campanhaNome: string;
  influencerId: string;
  influencerNome: string;
  /** Só presente pra `kind: "content"`. */
  entregaId?: string;
  title: string;
  subtitle?: string;
  dueLabel?: string;
  priority: "high" | "medium" | "low";
};
