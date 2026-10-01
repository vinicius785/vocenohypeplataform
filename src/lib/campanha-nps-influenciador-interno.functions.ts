/**
 * Consulta interna (time) do NPS por influenciador — Campanha → Recursos →
 * NPS → aba "Influenciadores". Mesma autorização de `getCampanhaNpsInterno`
 * (`campanha-nps.functions.ts`): admin, ou membro do time interno com
 * permissão `campanhas`/`clientes` (`canReadCampanhaNpsInterno`,
 * reaproveitada tal como está — a regra de "quem pode ver o NPS interno" é
 * a mesma para os dois públicos). Consulta pura, nenhuma escrita aqui — a
 * única escrita do NPS de influenciador é a resposta pública
 * (`submitInfluNps`, `campanha-nps-influenciador.functions.ts`).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import type { Influ } from "@/components/influenciadores/InfluencerBoard";
import {
  canReadCampanhaNpsInterno,
  classifyNpsScore,
  npsDistribution,
  npsIndex,
  type NpsCategory,
} from "@/lib/campanha-nps-insights";

const Input = z.object({ campanhaId: z.string().uuid() });

async function assertCanReadInterno(userId: string, supabase: SupabaseClient<Database>) {
  const rpc = async (fn: "is_admin" | "is_internal_team_member") => {
    const { data: v, error } = await supabase.rpc(fn, { _user_id: userId });
    if (error) throw new Error(error.message);
    return v === true;
  };
  const perm = async (p: string) => {
    const { data: v, error } = await supabase.rpc("has_permission", {
      _user_id: userId,
      _permission: p,
    });
    if (error) throw new Error(error.message);
    return v === true;
  };
  const [isAdmin, isInternalMember, hasCampanhas, hasClientes] = await Promise.all([
    rpc("is_admin"),
    rpc("is_internal_team_member"),
    perm("campanhas"),
    perm("clientes"),
  ]);
  if (!canReadCampanhaNpsInterno({ isAdmin, isInternalMember, hasCampanhas, hasClientes })) {
    throw new Error("Sem permissão para consultar o NPS desta campanha.");
  }
}

type InfluNpsInternoEntry = {
  influenciadorId: string;
  nome: string;
  respondido: boolean;
  score: number | null;
  comment: string | null;
  answeredAt: string | null;
  category: NpsCategory | null;
};

export type CampanhaNpsInfluenciadoresInterno = {
  influenciadores: InfluNpsInternoEntry[];
  aggregate: {
    total: number;
    respondidos: number;
    nps: number | null;
    media: number | null;
    promotores: number;
    neutros: number;
    detratores: number;
  };
};

/** Lista completa (resumo + agregado) — usada pela aba "Influenciadores"
 * de Recursos → NPS. */
export const getCampanhaNpsInfluenciadoresInterno = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => Input.parse(raw))
  .handler(async ({ data, context }): Promise<CampanhaNpsInfluenciadoresInterno> => {
    await assertCanReadInterno(context.userId, context.supabase);

    const { data: npsRows, error: npsError } = await context.supabase
      .from("campanha_nps_influenciador")
      .select("influenciador_id, score, comment, answered_at")
      .eq("campanha_id", data.campanhaId);
    if (npsError) throw new Error(npsError.message);

    const influIds = (npsRows ?? []).map((r) => r.influenciador_id);
    const names = new Map<string, string>();
    if (influIds.length > 0) {
      const { data: influRows, error: influError } = await context.supabase
        .from("campanha_influenciadores")
        .select("id, data")
        .in("id", influIds);
      if (influError) throw new Error(influError.message);
      for (const row of influRows ?? []) {
        const influ = row.data as Influ;
        names.set(row.id, influ?.nome ?? "Influenciador");
      }
    }

    const influenciadores: InfluNpsInternoEntry[] = (npsRows ?? [])
      .map((r) => ({
        influenciadorId: r.influenciador_id,
        nome: names.get(r.influenciador_id) ?? "Influenciador",
        respondido: r.answered_at !== null,
        score: r.score,
        comment: r.comment,
        answeredAt: r.answered_at,
        category: r.score !== null ? classifyNpsScore(r.score) : null,
      }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

    const scores = influenciadores
      .map((i) => i.score)
      .filter((s): s is number => s !== null && s !== undefined);
    const distribution = npsDistribution(scores);
    const media = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null;

    return {
      influenciadores,
      aggregate: {
        total: influenciadores.length,
        respondidos: scores.length,
        nps: npsIndex(scores, 1),
        media,
        promotores: distribution.promotores,
        neutros: distribution.neutros,
        detratores: distribution.detratores,
      },
    };
  });

/** Versão leve, só pros links do board Kanban (menu "Copiar link NPS" +
 * indicador de status em cada card) — evita carregar a agregação inteira
 * ali. Inclui `token`: só o time interno autenticado chama esta função. */
export const getCampanhaNpsInfluenciadoresStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => Input.parse(raw))
  .handler(async ({ data, context }) => {
    await assertCanReadInterno(context.userId, context.supabase);
    const { data: rows, error } = await context.supabase
      .from("campanha_nps_influenciador")
      .select("influenciador_id, token, score, answered_at")
      .eq("campanha_id", data.campanhaId);
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r) => ({
      influenciadorId: r.influenciador_id,
      token: r.token,
      respondido: r.answered_at !== null,
      score: r.score,
    }));
  });
