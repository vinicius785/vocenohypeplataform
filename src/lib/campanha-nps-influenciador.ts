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
 * dependência do conceito de "mês".
 */
import { z } from "zod";

export type CampanhaNpsInflu = {
  id: string;
  campanhaId: string;
  influenciadorId: string;
  token: string;
  score: number | null;
  comment: string | null;
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

export const InfluNpsAnswerSchema = InfluNpsTokenSchema.extend({
  score: z.number().int().min(0).max(10),
  comment: z.string().trim().max(2000).optional(),
});

export type InfluNpsAnswer = z.infer<typeof InfluNpsAnswerSchema>;
