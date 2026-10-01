/**
 * Avaliação MANUAL do time sobre um influenciador — tabela
 * `campanha_influenciador_avaliacoes`
 * (`20261001150000_campanha_influenciador_avaliacoes.sql`). Presa à
 * PARTICIPAÇÃO numa campanha específica (`campanhaInfluenciadorId` é o
 * mesmo id de `campanha_influenciadores`, a mesma "participação" que
 * `campanha_nps_influenciador` já usa como FK) — nunca ao cadastro
 * global do Banco de Influenciadores. Substitui o antigo score
 * automático de "confiabilidade" (calculado a partir de atraso de
 * entregas, nunca armazenado — `computeReliability` em
 * `InfluencerBoard.tsx`, mantido intacto pra não quebrar quem ainda usa,
 * mas nunca chamado pela V2 do Banco).
 */
import { z } from "zod";

export type CampanhaInfluenciadorAvaliacao = {
  id: string;
  campanhaInfluenciadorId: string;
  campanhaId: string;
  cumprimentoCombinados: number;
  comunicacao: number;
  qualidadeEntregas: number;
  aderenciaBriefing: number;
  organizacaoProfissionalismo: number;
  observacao: string | null;
  createdBy: string;
  createdAt: string;
  updatedBy: string | null;
  updatedAt: string;
};

export type CampanhaInfluenciadorAvaliacaoRow = {
  id: string;
  campanha_influenciador_id: string;
  campanha_id: string;
  cumprimento_combinados: number;
  comunicacao: number;
  qualidade_entregas: number;
  aderencia_briefing: number;
  organizacao_profissionalismo: number;
  observacao: string | null;
  created_by: string;
  created_at: string;
  updated_by: string | null;
  updated_at: string;
};

export function mapAvaliacaoRow(
  r: CampanhaInfluenciadorAvaliacaoRow,
): CampanhaInfluenciadorAvaliacao {
  return {
    id: r.id,
    campanhaInfluenciadorId: r.campanha_influenciador_id,
    campanhaId: r.campanha_id,
    cumprimentoCombinados: r.cumprimento_combinados,
    comunicacao: r.comunicacao,
    qualidadeEntregas: r.qualidade_entregas,
    aderenciaBriefing: r.aderencia_briefing,
    organizacaoProfissionalismo: r.organizacao_profissionalismo,
    observacao: r.observacao,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedBy: r.updated_by,
    updatedAt: r.updated_at,
  };
}

export const AVALIACAO_CRITERIOS: {
  key: keyof Pick<
    CampanhaInfluenciadorAvaliacao,
    | "cumprimentoCombinados"
    | "comunicacao"
    | "qualidadeEntregas"
    | "aderenciaBriefing"
    | "organizacaoProfissionalismo"
  >;
  label: string;
}[] = [
  { key: "cumprimentoCombinados", label: "Cumprimento dos combinados" },
  { key: "comunicacao", label: "Comunicação" },
  { key: "qualidadeEntregas", label: "Qualidade das entregas" },
  { key: "aderenciaBriefing", label: "Aderência ao briefing" },
  { key: "organizacaoProfissionalismo", label: "Organização/profissionalismo" },
];

/** Nota geral = média simples dos 5 critérios, 1 casa decimal — nunca
 * armazenada (sempre calculada), mesmo espírito de "nunca mostrar um
 * número sem poder abrir e ver de onde veio" já aplicado ao NPS. */
export function mediaAvaliacao(a: {
  cumprimentoCombinados: number;
  comunicacao: number;
  qualidadeEntregas: number;
  aderenciaBriefing: number;
  organizacaoProfissionalismo: number;
}): number {
  const soma =
    a.cumprimentoCombinados +
    a.comunicacao +
    a.qualidadeEntregas +
    a.aderenciaBriefing +
    a.organizacaoProfissionalismo;
  return Math.round((soma / 5) * 10) / 10;
}

/** Média de várias avaliações (ex: todas as participações de um
 * influenciador no Banco) — `null` sem nenhuma avaliação (nunca 0
 * fingindo nota real). */
export function mediaGeralAvaliacoes(
  avaliacoes: Pick<
    CampanhaInfluenciadorAvaliacao,
    | "cumprimentoCombinados"
    | "comunicacao"
    | "qualidadeEntregas"
    | "aderenciaBriefing"
    | "organizacaoProfissionalismo"
  >[],
): number | null {
  if (avaliacoes.length === 0) return null;
  const soma = avaliacoes.reduce((acc, a) => acc + mediaAvaliacao(a), 0);
  return Math.round((soma / avaliacoes.length) * 10) / 10;
}

export const AvaliacaoInputSchema = z.object({
  campanhaInfluenciadorId: z.string().uuid(),
  campanhaId: z.string().uuid(),
  cumprimentoCombinados: z.number().int().min(1).max(5),
  comunicacao: z.number().int().min(1).max(5),
  qualidadeEntregas: z.number().int().min(1).max(5),
  aderenciaBriefing: z.number().int().min(1).max(5),
  organizacaoProfissionalismo: z.number().int().min(1).max(5),
  observacao: z.string().trim().max(2000).optional(),
});

export type AvaliacaoInput = z.infer<typeof AvaliacaoInputSchema>;
