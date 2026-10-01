/**
 * Funções de servidor da avaliação manual do time — sempre autenticadas,
 * nunca públicas (diferente do NPS, que é respondido via token). Mesma
 * permissão já usada pra todo o domínio de influenciadores
 * (`'influenciadores'`, `src/lib/permissions.ts`).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import {
  AvaliacaoInputSchema,
  mapAvaliacaoRow,
  type CampanhaInfluenciadorAvaliacao,
} from "@/lib/campanha-influenciador-avaliacao";

async function assertCanManage(userId: string, supabase: SupabaseClient<Database>) {
  const perm = async (p: string) => {
    const { data: v, error } = await supabase.rpc("has_permission", {
      _user_id: userId,
      _permission: p,
    });
    if (error) throw new Error(error.message);
    return v === true;
  };
  const admin = async () => {
    const { data: v, error } = await supabase.rpc("is_admin", { _user_id: userId });
    if (error) throw new Error(error.message);
    return v === true;
  };
  const [isAdmin, hasPerm] = await Promise.all([admin(), perm("influenciadores")]);
  if (!isAdmin && !hasPerm) {
    throw new Error("Sem permissão para avaliar influenciadores.");
  }
}

/** Busca em lote — o perfil do Banco precisa das avaliações de N
 * participações (uma por campanha) de uma vez, nunca N requisições. */
export const getAvaliacoesPorParticipacoes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ campanhaInfluenciadorIds: z.array(z.string().uuid()) }).parse(raw),
  )
  .handler(async ({ data, context }): Promise<CampanhaInfluenciadorAvaliacao[]> => {
    await assertCanManage(context.userId, context.supabase);
    if (data.campanhaInfluenciadorIds.length === 0) return [];
    const { data: rows, error } = await context.supabase
      .from("campanha_influenciador_avaliacoes")
      .select("*")
      .in("campanha_influenciador_id", data.campanhaInfluenciadorIds);
    if (error) throw new Error(error.message);
    return (rows ?? []).map(mapAvaliacaoRow);
  });

/** Cria ou atualiza a avaliação de UMA participação (constraint única em
 * `campanha_influenciador_id` — nunca duplica, sempre edita a mesma
 * linha). `created_by`/`updated_by` vêm do usuário autenticado no
 * contexto, nunca do payload do cliente. */
export const upsertAvaliacao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => AvaliacaoInputSchema.parse(raw))
  .handler(async ({ data, context }): Promise<CampanhaInfluenciadorAvaliacao> => {
    await assertCanManage(context.userId, context.supabase);

    const { data: existing, error: findError } = await context.supabase
      .from("campanha_influenciador_avaliacoes")
      .select("id")
      .eq("campanha_influenciador_id", data.campanhaInfluenciadorId)
      .maybeSingle();
    if (findError) throw new Error(findError.message);

    const payload = {
      campanha_influenciador_id: data.campanhaInfluenciadorId,
      campanha_id: data.campanhaId,
      cumprimento_combinados: data.cumprimentoCombinados,
      comunicacao: data.comunicacao,
      qualidade_entregas: data.qualidadeEntregas,
      aderencia_briefing: data.aderenciaBriefing,
      organizacao_profissionalismo: data.organizacaoProfissionalismo,
      observacao: data.observacao?.trim() || null,
    };

    if (existing) {
      const { data: row, error } = await context.supabase
        .from("campanha_influenciador_avaliacoes")
        .update({ ...payload, updated_by: context.userId })
        .eq("id", existing.id)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return mapAvaliacaoRow(row);
    }

    const { data: row, error } = await context.supabase
      .from("campanha_influenciador_avaliacoes")
      .insert({ ...payload, created_by: context.userId })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return mapAvaliacaoRow(row);
  });
