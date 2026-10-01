/**
 * NPS por INFLUENCIADOR aprovado numa campanha — tabela
 * `campanha_nps_influenciador` (`20261001120000_campanha_nps_influenciador.sql`).
 * Chave lógica `(campanha_id, influenciador_id)`: uma resposta por
 * influenciador por campanha, para sempre, via link público individual
 * (token). Diferente do NPS mensal do cliente (`campanha-nps.ts`,
 * `campanha_nps`), que é um gate por `(campanha_id, reference_month)`
 * dentro do Portal autenticado — este nunca bloqueia navegação e nunca
 * pede login.
 *
 * Reaproveita (sem duplicar) as funções puras de classificação já
 * existentes em `campanha-nps-insights.ts` (`classifyNpsScore`/
 * `npsDistribution`/`npsIndex`/`NPS_CATEGORY_LABEL`) e `npsCommentPrompt`
 * de `campanha-nps.ts` — já genéricas sobre uma nota 0-10, sem nenhuma
 * dependência do conceito de "mês". As perguntas de rating (comunicação/
 * briefing/processo/pagamento/experiência geral) reaproveitam o MESMO
 * enum de 5 opções já usado pelo NPS do cliente (`NPS_RATING_OPTIONS`,
 * `campanha-nps.ts`) — não um enum novo.
 */
import { z } from "zod";
import { NPS_RATING_OPTIONS, type NpsRating } from "@/lib/campanha-nps";

export type CampanhaNpsInflu = {
  id: string;
  campanhaId: string;
  influenciadorId: string;
  token: string;
  score: number | null;
  comment: string | null;
  communicationRating: NpsRating | null;
  briefingRating: NpsRating | null;
  approvalProcessRating: NpsRating | null;
  paymentExperienceRating: NpsRating | null;
  overallExperienceRating: NpsRating | null;
  improvementComment: string | null;
  positiveComment: string | null;
  wouldWorkAgain: WouldWorkAgain | null;
  answeredAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CampanhaNpsInfluRow = {
  id: string;
  campanha_id: string;
  influenciador_id: string;
  token: string;
  score: number | null;
  comment: string | null;
  communication_rating: string | null;
  briefing_rating: string | null;
  approval_process_rating: string | null;
  payment_experience_rating: string | null;
  overall_experience_rating: string | null;
  improvement_comment: string | null;
  positive_comment: string | null;
  would_work_again: string | null;
  answered_at: string | null;
  created_at: string;
  updated_at: string;
};

export function mapCampanhaNpsInfluRow(r: CampanhaNpsInfluRow): CampanhaNpsInflu {
  return {
    id: r.id,
    campanhaId: r.campanha_id,
    influenciadorId: r.influenciador_id,
    token: r.token,
    score: r.score,
    comment: r.comment,
    communicationRating: (r.communication_rating as NpsRating | null) ?? null,
    briefingRating: (r.briefing_rating as NpsRating | null) ?? null,
    approvalProcessRating: (r.approval_process_rating as NpsRating | null) ?? null,
    paymentExperienceRating: (r.payment_experience_rating as NpsRating | null) ?? null,
    overallExperienceRating: (r.overall_experience_rating as NpsRating | null) ?? null,
    improvementComment: r.improvement_comment,
    positiveComment: r.positive_comment,
    wouldWorkAgain: (r.would_work_again as WouldWorkAgain | null) ?? null,
    answeredAt: r.answered_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/** Mesma convenção de token público já usada em todo o app (ex.
 * `cliente-link.functions.ts`): `crypto.randomUUID().replace(/-/g,"")`/
 * `encode(gen_random_bytes(16),'hex')` no banco, ambos 32 hex chars —
 * rejeitar qualquer coisa fora dessa faixa antes de bater no banco evita
 * um full-scan por um token obviamente inválido/curto demais. */
export const InfluNpsTokenSchema = z.object({ token: z.string().min(20).max(64) });

const ratingValues = NPS_RATING_OPTIONS.map((o) => o.value) as [NpsRating, ...NpsRating[]];
const RatingSchema = z.enum(ratingValues);

export const WOULD_WORK_AGAIN_OPTIONS = [
  { value: "sim", label: "Sim" },
  { value: "talvez", label: "Talvez" },
  { value: "nao", label: "Não" },
] as const;
export type WouldWorkAgain = (typeof WOULD_WORK_AGAIN_OPTIONS)[number]["value"];

/** Passo 1 — NPS (obrigatório). */
export const InfluNpsStep1Schema = z.object({
  score: z.number().int().min(0).max(10),
});

/** Passo 2 — avaliações da experiência durante a campanha (todas
 * obrigatórias, mesmo padrão do NPS do cliente onde as 3 perguntas de
 * rating nunca ficam null numa resposta enviada). */
export const InfluNpsStep2Schema = z.object({
  communicationRating: RatingSchema,
  briefingRating: RatingSchema,
  approvalProcessRating: RatingSchema,
  paymentExperienceRating: RatingSchema,
  overallExperienceRating: RatingSchema,
});

/** Passo 3 — comentários abertos + relacionamento, todos opcionais (mesma
 * regra do pedido original: nunca tornar comentário obrigatório). */
export const InfluNpsStep3Schema = z.object({
  improvementComment: z.string().trim().max(2000).optional(),
  positiveComment: z.string().trim().max(2000).optional(),
  wouldWorkAgain: z.enum(["sim", "talvez", "nao"]).optional(),
});

export const InfluNpsAnswerSchema = InfluNpsTokenSchema.merge(InfluNpsStep1Schema)
  .merge(InfluNpsStep2Schema)
  .merge(InfluNpsStep3Schema);

export type InfluNpsAnswer = z.infer<typeof InfluNpsAnswerSchema>;
