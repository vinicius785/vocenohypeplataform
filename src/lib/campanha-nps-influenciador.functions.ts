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
 * A página pública virou uma experiência de encerramento de participação
 * (não só um formulário de NPS) — por isso `getInfluNpsPublic` também
 * resolve nome da campanha/período (de `clientes.data.campanhas[]`, mesmo
 * padrão de busca de `findCampanhaBySignupToken` em
 * `inscricao-campanha.functions.ts`) e as entregas DAQUELE influenciador
 * nessa campanha (já presentes em `Influ.entregas`, sem nenhuma tabela
 * nova). Nenhum campo financeiro é buscado em nenhum dos dois.
 *
 * As funções internas (consulta autenticada pelo time) ficam em
 * `campanha-nps-influenciador-interno.functions.ts`.
 */
import { createServerFn } from "@tanstack/react-start";
import type { Cliente } from "@/lib/clientes-store";
import type { Influ } from "@/lib/influencer-model";
import { ensurePrimary } from "@/lib/social-profiles";
import { InfluNpsAnswerSchema, InfluNpsTokenSchema } from "@/lib/campanha-nps-influenciador";
import { throwSafeDbError } from "@/lib/portal-db-error";
import { findCampanhaByIdInRows } from "@/lib/demo/demo-scans";

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
  if (error) throwSafeDbError(error);
  return data;
}

/** Mesmo padrão de busca de `findCampanhaBySignupToken`
 * (`inscricao-campanha.functions.ts`): campanha vive dentro de
 * `clientes.data.campanhas[]`, sem linha própria — só o necessário pro
 * cabeçalho da página (nome + período), nunca valores. */
async function findCampanhaNomeEPeriodo(
  campanhaId: string,
): Promise<{ nome: string; dataInicio?: string } | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: rows, error } = await supabaseAdmin.from("clientes").select("data");
  if (error) throwSafeDbError(error);
  // Campanhas de DEMONSTRAÇÃO não têm link público de NPS.
  const campanha = findCampanhaByIdInRows((rows ?? []) as { data: Cliente }[], campanhaId);
  return campanha ? { nome: campanha.nome, dataInicio: campanha.dataInicio } : null;
}

/** Dados pra renderizar a experiência pública de encerramento — identidade
 * do influenciador, campanha/período e SÓ as entregas dele nesta campanha.
 * Nunca inclui nenhum campo financeiro (nem a campanha nem o influenciador
 * são buscados com esses campos — não há como vazar o que não é lido). */
export const getInfluNpsPublic = createServerFn({ method: "GET" })
  .inputValidator((raw: unknown) => InfluNpsTokenSchema.parse(raw))
  .handler(async ({ data }) => {
    const row = await findNpsInfluByToken(data.token);
    if (!row) throw new Error("Link inválido ou expirado.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: influRow }, campanha] = await Promise.all([
      supabaseAdmin
        .from("campanha_influenciadores")
        .select("data")
        .eq("id", row.influenciador_id)
        .maybeSingle(),
      findCampanhaNomeEPeriodo(row.campanha_id),
    ]);
    const influ = influRow?.data as Influ | undefined;
    const principal = influ?.redes ? ensurePrimary(influ.redes).find((r) => r.isPrimary) : null;

    const entregas = (influ?.entregas ?? []).map((e) => ({
      tipo: e.tipo,
      titulo: e.titulo ?? null,
      publicada: e.stage === "PUBLICADA",
    }));

    return {
      influenciadorNome: influ?.nome ?? "influenciador",
      influenciadorFoto: influ?.foto ?? null,
      influenciadorHandle: principal?.handle ?? null,
      campanhaNome: campanha?.nome ?? null,
      campanhaPeriodo: campanha?.dataInicio ?? null,
      entregas,
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
        communication_rating: data.communicationRating,
        briefing_rating: data.briefingRating,
        approval_process_rating: data.approvalProcessRating,
        payment_experience_rating: data.paymentExperienceRating,
        overall_experience_rating: data.overallExperienceRating,
        improvement_comment: data.improvementComment?.trim() || null,
        positive_comment: data.positiveComment?.trim() || null,
        would_work_again: data.wouldWorkAgain ?? null,
        answered_at: new Date().toISOString(),
      })
      .eq("id", row.id)
      .is("answered_at", null); // defesa extra contra corrida entre 2 submits simultâneos do mesmo token
    if (error) throwSafeDbError(error);
  });
