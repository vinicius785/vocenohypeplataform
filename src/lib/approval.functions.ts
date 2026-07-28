import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Public influencer-approval links: a team member picks a set of
 * influencers from a campaign and generates a link that the client can open
 * without logging in. The link shows a snapshot (name/photo/social handles)
 * of exactly the influencers chosen at creation time — nothing else about
 * the campaign — and lets the client approve or reject each one (a reason
 * is required to reject). Reads/writes from the public link never touch
 * Supabase directly from the browser; they go through the two unauthenticated
 * server functions below, which use the service-role client and are the only
 * way to reach `influencer_approvals` with a bare token.
 */

const RedeInput = z.object({ plataforma: z.string(), handle: z.string() });
const EntregaSnapshot = z.object({
  id: z.string(),
  tipo: z.string(),
  dataPostagem: z.string().optional(),
  roteiro: z.string().optional(),
  roteiroNome: z.string().optional(),
});
const InfluencerSnapshot = z.object({
  id: z.string(),
  nome: z.string(),
  foto: z.string().optional(),
  redes: z.array(RedeInput).default([]),
  entregas: z.array(EntregaSnapshot).default([]),
});

const CreateInput = z.object({
  campanhaId: z.string().optional(),
  campanhaNome: z.string().optional(),
  clienteNome: z.string().optional(),
  totalPlanejado: z.number().optional(),
  influencers: z.array(InfluencerSnapshot).min(1),
});

export const createApprovalLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => CreateInput.parse(raw))
  .handler(async ({ data, context }) => {
    const token = crypto.randomUUID().replace(/-/g, "");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("influencer_approvals").insert({
      token,
      campanha_id: data.campanhaId,
      campanha_nome: data.campanhaNome,
      cliente_nome: data.clienteNome,
      total_planejado: data.totalPlanejado,
      created_by: context.userId,
      influencers: data.influencers,
      responses: {},
    });
    if (error) throw new Error(error.message);
    return { token };
  });

const ListInput = z.object({ campanhaId: z.string() });

export const listApprovalsForCampanha = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => ListInput.parse(raw))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("influencer_approvals")
      .select("id, token, influencers, responses, created_at")
      .eq("campanha_id", data.campanhaId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

const TokenInput = z.object({ token: z.string().min(1) });

/** Public — no auth. Used by the /aprovacao/$token page. */
export const getApprovalByToken = createServerFn({ method: "GET" })
  .inputValidator((raw: unknown) => TokenInput.parse(raw))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("influencer_approvals")
      .select("campanha_nome, cliente_nome, influencers, responses, total_planejado")
      .eq("token", data.token)
      .maybeSingle();
    if (error || !row) throw new Error("Link não encontrado.");
    return row;
  });

const RespondInput = z.object({
  token: z.string().min(1),
  influencerId: z.string().min(1),
  status: z.enum(["aprovado", "reprovado"]),
  motivo: z.string().trim().max(2000).optional(),
});

/** Public — no auth. Used by the /aprovacao/$token page. */
export const respondApproval = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => RespondInput.parse(raw))
  .handler(async ({ data }) => {
    if (data.status === "reprovado" && !data.motivo?.trim()) {
      throw new Error("Motivo é obrigatório para reprovar.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("influencer_approvals")
      .select("responses")
      .eq("token", data.token)
      .maybeSingle();
    if (error || !row) throw new Error("Link não encontrado.");
    type ResponseEntry = { status: "aprovado" | "reprovado"; motivo?: string; respondedAt: string };
    const responses = { ...((row.responses as Record<string, ResponseEntry>) ?? {}) };
    responses[data.influencerId] = {
      status: data.status,
      motivo: data.motivo?.trim() || undefined,
      respondedAt: new Date().toISOString(),
    };
    const { error: updateError } = await supabaseAdmin
      .from("influencer_approvals")
      .update({ responses })
      .eq("token", data.token);
    if (updateError) throw new Error(updateError.message);
    return { responses };
  });
