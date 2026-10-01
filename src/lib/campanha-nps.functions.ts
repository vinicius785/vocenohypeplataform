import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  buildCampanhaNpsMonths,
  canReadCampanhaNpsInterno,
  type CampanhaNpsEntry,
  type CampanhaNpsMonthSummary,
} from "./campanha-nps-insights";

const YM = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

/** Entrada já preparada pra filtros/exportação futuros (período), sem UI
 * agora: `fromMonth`/`toMonth` opcionais restringem a janela no banco. */
const Input = z.object({
  campanhaId: z.string().uuid(),
  fromMonth: YM.optional(),
  toMonth: YM.optional(),
});

export type CampanhaNpsInterno = { months: CampanhaNpsMonthSummary[] };

/**
 * Consulta interna (somente leitura) do NPS mensal de UMA campanha —
 * Campanha → Ferramentas → NPS. Não existe nenhuma server function de
 * escrita para o time: a tela é consulta pura.
 *
 * Autorização no backend: admin, ou membro do time interno com permissão
 * `campanhas`/`clientes` (`canReadCampanhaNpsInterno`). Usuário do Portal
 * do Cliente é negado aqui mesmo podendo ler as próprias linhas via RLS.
 * A leitura em si usa o client RLS-scoped (`context.supabase`), então a
 * policy interna de `campanha_nps` continua valendo como segunda barreira.
 *
 * Performance: uma única query filtrada por `campanha_id` (índice
 * `campanha_nps_campanha_id_idx`) — no máximo uma linha por mês dessa
 * campanha; nunca carrega outras campanhas. O mesmo resultado alimenta o
 * seletor de mês, o gráfico e a resposta do mês selecionado.
 */
export const getCampanhaNpsInterno = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => Input.parse(raw))
  .handler(async ({ data, context }): Promise<CampanhaNpsInterno> => {
    const uid = context.userId;
    const rpc = async (fn: "is_admin" | "is_internal_team_member", args: { _user_id: string }) => {
      const { data: v, error } = await context.supabase.rpc(fn, args);
      if (error) throw new Error(error.message);
      return v === true;
    };
    const perm = async (p: string) => {
      const { data: v, error } = await context.supabase.rpc("has_permission", {
        _user_id: uid,
        _permission: p,
      });
      if (error) throw new Error(error.message);
      return v === true;
    };
    const [isAdmin, isInternalMember, hasCampanhas, hasClientes] = await Promise.all([
      rpc("is_admin", { _user_id: uid }),
      rpc("is_internal_team_member", { _user_id: uid }),
      perm("campanhas"),
      perm("clientes"),
    ]);
    if (!canReadCampanhaNpsInterno({ isAdmin, isInternalMember, hasCampanhas, hasClientes })) {
      throw new Error("Sem permissão para consultar o NPS desta campanha.");
    }

    let q = context.supabase
      .from("campanha_nps")
      .select(
        "id,reference_month,score,satisfaction_score,delivery_quality,communication_rating,comment,answered_by,answered_at",
      )
      .eq("campanha_id", data.campanhaId)
      .order("reference_month", { ascending: true });
    if (data.fromMonth) q = q.gte("reference_month", data.fromMonth);
    if (data.toMonth) q = q.lte("reference_month", data.toMonth);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    // Nome de quem respondeu: é um usuário do Portal do Cliente, cujo
    // perfil o RLS de `profiles` não expõe ao time — lido via service role
    // SÓ depois da checagem de permissão acima, e só nome/e-mail.
    const ids = [
      ...new Set((rows ?? []).map((r) => r.answered_by).filter((v): v is string => !!v)),
    ];
    const names = new Map<string, string>();
    if (ids.length > 0) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: profiles } = await supabaseAdmin
        .from("profiles")
        .select("id, full_name, email")
        .in("id", ids);
      for (const p of profiles ?? []) names.set(p.id, p.full_name || p.email);
    }

    const entries: CampanhaNpsEntry[] = (rows ?? []).map((r) => ({
      id: r.id,
      referenceMonth: r.reference_month,
      score: r.score,
      satisfactionScore: r.satisfaction_score,
      deliveryQuality: r.delivery_quality,
      communicationRating: r.communication_rating,
      comment: r.comment,
      answeredBy: r.answered_by,
      answeredByName: r.answered_by ? (names.get(r.answered_by) ?? null) : null,
      answeredAt: r.answered_at,
    }));
    return { months: buildCampanhaNpsMonths(entries) };
  });
