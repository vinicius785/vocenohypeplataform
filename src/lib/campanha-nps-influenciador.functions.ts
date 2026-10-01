/**
 * Funções públicas (sem login) do NPS por influenciador — link individual
 * `/nps-influenciador/:token`. Mesmo padrão de toda rota pública já
 * existente no projeto (`cliente-link.functions.ts`, `inscricao-campanha
 * .functions.ts`): sem `.middleware([requireSupabaseAuth])`, token
 * validado por Zod antes de qualquer consulta, `supabaseAdmin` importado
 * dinamicamente dentro do handler (nunca top-level) — a posse do token É
 * a autorização, verificada aqui, nunca confiando em `campanhaId`/
 * `influenciadorId` vindos do cliente (nem existe esse campo de input).
 *
 * As funções internas (consulta autenticada pelo time) ficam em
 * `campanha-nps-influenciador-interno.functions.ts`.
 */
import { createServerFn } from "@tanstack/react-start";
import type { Influ } from "@/components/influenciadores/InfluencerBoard";
import { InfluNpsAnswerSchema, InfluNpsTokenSchema } from "@/lib/campanha-nps-influenciador";

type NpsInfluRow = {
  id: string;
  campanha_id: string;
  influenciador_id: string;
  score: number | null;
  answered_at: string | null;
};

async function findNpsInfluByToken(token: string): Promise<NpsInfluRow | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("campanha_nps_influenciador")
    .select("id, campanha_id, influenciador_id, score, answered_at")
    .eq("token", token)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

/** Dados mínimos pra renderizar a página pública — nunca inclui nenhum
 * campo financeiro (a query a seguir nem seleciona essas colunas, então
 * não há como vazar o que não é buscado). */
export const getInfluNpsPublic = createServerFn({ method: "GET" })
  .inputValidator((raw: unknown) => InfluNpsTokenSchema.parse(raw))
  .handler(async ({ data }) => {
    const row = await findNpsInfluByToken(data.token);
    if (!row) throw new Error("Link inválido ou expirado.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: influRow } = await supabaseAdmin
      .from("campanha_influenciadores")
      .select("data")
      .eq("id", row.influenciador_id)
      .maybeSingle();
    const influ = influRow?.data as Influ | undefined;

    return {
      influenciadorNome: influ?.nome ?? "influenciador",
      alreadyAnswered: row.answered_at !== null,
      score: row.score,
    };
  });

/** Registra a resposta — bloqueia uma segunda tentativa no servidor
 * (nunca só escondendo o formulário no frontend). Nunca sobrescreve uma
 * resposta já dada, ao contrário do upsert mensal do NPS do cliente: aqui
 * a regra do pedido é "não permitir múltiplas respostas", não "a mais
 * recente vale". */
export const submitInfluNps = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => InfluNpsAnswerSchema.parse(raw))
  .handler(async ({ data }) => {
    const row = await findNpsInfluByToken(data.token);
    if (!row) throw new Error("Link inválido ou expirado.");
    if (row.answered_at !== null) throw new Error("Esta avaliação já foi registrada.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("campanha_nps_influenciador")
      .update({
        score: data.score,
        comment: data.comment?.trim() || null,
        answered_at: new Date().toISOString(),
      })
      .eq("id", row.id)
      .is("answered_at", null); // defesa extra contra corrida entre 2 submits simultâneos do mesmo token
    if (error) throw new Error(error.message);
  });
