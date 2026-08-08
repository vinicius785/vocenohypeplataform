import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { Cliente } from "@/lib/clientes-store";
import type { Campaign } from "@/components/VincularCampanhaDialog";
import { INFLU_STATUSES, type Influ } from "@/components/influenciadores/InfluencerBoard";
import { applyInfluApproval, applyEntregaApproval } from "@/lib/campanha-aprovacao";

/**
 * Link público fixo por campanha (`/campanha/$token`) — substitui os links
 * avulsos de `approval.functions.ts` (removido). Em vez de uma foto
 * congelada gerada manualmente, o token é um campo fixo na própria
 * `Campaign` (`publicToken`) e cada acesso lê o estado *ao vivo* de
 * `campanha_influenciadores`. Nunca fala com Supabase direto do browser —
 * só via as server functions abaixo, sempre com o service-role client,
 * porque nem `clientes` nem `campanha_influenciadores` têm policy `anon`.
 */

async function findCampanhaByToken(token: string): Promise<{
  clienteId: string;
  clienteNome: string;
  clienteFoto?: string;
  campanha: Campaign;
} | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: rows, error } = await supabaseAdmin.from("clientes").select("id, data");
  if (error) throw new Error(error.message);
  for (const row of (rows ?? []) as { id: string; data: Cliente }[]) {
    const campanha = row.data.campanhas?.find((c) => c.publicToken === token);
    if (campanha) {
      return {
        clienteId: row.id,
        clienteNome: row.data.empresa,
        clienteFoto: row.data.photo,
        campanha,
      };
    }
  }
  return null;
}

const RedePublic = z.object({
  id: z.string().optional(),
  plataforma: z.string(),
  handle: z.string(),
  seguidores: z.string().optional(),
});
const DemographicEntryPublic = z.object({
  id: z.string(),
  label: z.string(),
  percentual: z.number(),
});
const RedeMetricsPublic = z.object({
  interacoes: z.number().optional(),
  visualizacoes: z.number().optional(),
  taxaInteracao: z.number().optional(),
  taxaAtencaoInicial: z.number().optional(),
  genero: z.array(DemographicEntryPublic).optional(),
  faixaEtaria: z.array(DemographicEntryPublic).optional(),
  paises: z.array(DemographicEntryPublic).optional(),
  cidades: z.array(DemographicEntryPublic).optional(),
});

const ClienteVeredito = z.object({ motivo: z.string(), respondedAt: z.string() });

const EntregaPublic = z.object({
  id: z.string(),
  tipo: z.string(),
  titulo: z.string().optional(),
  quantidade: z.number(),
  status: z.enum(["orcado", "combinado", "publicado"]),
  conteudoStatus: z.string().optional(),
  dataPostagem: z.string().optional(),
  anexos: z
    .array(z.object({ id: z.string(), categoria: z.string(), nome: z.string(), url: z.string() }))
    .optional(),
  metrics: z
    .object({
      views: z.number().optional(),
      likes: z.number().optional(),
      comments: z.number().optional(),
      shares: z.number().optional(),
      saves: z.number().optional(),
      reach: z.number().optional(),
    })
    .optional(),
  roteiroReprovacao: ClienteVeredito.optional(),
  conteudoReprovacao: ClienteVeredito.optional(),
});

const InfluencerPublic = z.object({
  id: z.string(),
  nome: z.string(),
  nicho: z.string().optional(),
  foto: z.string().optional(),
  status: z.string(),
  clienteReprovacao: ClienteVeredito.optional(),
  redes: z.array(RedePublic),
  entregas: z.array(EntregaPublic),
  profileMetrics: z
    .object({ porRede: z.record(z.string(), RedeMetricsPublic).optional() })
    .optional(),
});

/** Projeta um `Influ` interno (que carrega telefone/email/contrato/bank/
 * comments/activity/checklist/pagamento por entrega) pro subconjunto seguro
 * de mostrar num link público — nunca o objeto cru. */
function toPublicInfluencer(influ: Influ): z.infer<typeof InfluencerPublic> {
  return {
    id: influ.id,
    nome: influ.nome,
    nicho: influ.nicho,
    foto: influ.foto,
    status: influ.status,
    clienteReprovacao: influ.clienteReprovacao,
    redes: influ.redes.map((r) => ({
      id: r.id,
      plataforma: r.plataforma,
      handle: r.handle,
      seguidores: r.seguidores,
    })),
    entregas: influ.entregas.map((e) => ({
      id: e.id,
      tipo: e.tipo,
      titulo: e.titulo,
      quantidade: e.quantidade,
      status: e.status,
      conteudoStatus: e.conteudoStatus,
      dataPostagem: e.dataPostagem,
      anexos: e.anexos,
      metrics: e.metrics,
      roteiroReprovacao: e.roteiroReprovacao,
      conteudoReprovacao: e.conteudoReprovacao,
    })),
    profileMetrics: influ.profileMetrics,
  };
}

const TokenInput = z.object({ token: z.string().min(1) });

/** Público — sem auth. Usado pela página `/campanha/$token`. */
export const getCampanhaLinkData = createServerFn({ method: "GET" })
  .inputValidator((raw: unknown) => TokenInput.parse(raw))
  .handler(async ({ data }) => {
    const found = await findCampanhaByToken(data.token);
    if (!found) throw new Error("Link não encontrado.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("campanha_influenciadores")
      .select("data")
      .eq("campanha_id", found.campanha.id);
    if (error) throw new Error(error.message);
    // Só mostra pro cliente influenciadores que o time já enviou pra
    // aprovação (ou mais adiante no funil) — enquanto está só "Lista"
    // (planejamento interno, ainda não decidido/comunicado) não aparece.
    const enviadoIdx = INFLU_STATUSES.indexOf("Enviado para aprovação");
    const influencers = ((rows ?? []) as { data: Influ }[])
      .filter((r) => INFLU_STATUSES.indexOf(r.data.status) >= enviadoIdx)
      .map((r) => toPublicInfluencer(r.data));
    const planejado = found.campanha.linhas.reduce((sum, l) => sum + (l.quantidade || 0), 0);
    return {
      campanhaNome: found.campanha.nome,
      clienteNome: found.clienteNome,
      clienteFoto: found.clienteFoto,
      prazo: found.campanha.prazo,
      dataInicio: found.campanha.dataInicio,
      planejado,
      influencers,
    };
  });

async function loadInfluRow(campanhaId: string, influencerId: string): Promise<Influ> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: row, error } = await supabaseAdmin
    .from("campanha_influenciadores")
    .select("data")
    .eq("id", influencerId)
    .eq("campanha_id", campanhaId)
    .maybeSingle();
  if (error || !row) throw new Error("Influenciador não encontrado nesta campanha.");
  return row.data as Influ;
}

async function saveInfluRow(campanhaId: string, influencerId: string, next: Influ): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin
    .from("campanha_influenciadores")
    .update({ data: next, updated_at: new Date().toISOString() })
    .eq("id", influencerId)
    .eq("campanha_id", campanhaId);
  if (error) throw new Error(error.message);
}

const RespondInfluInput = z.object({
  token: z.string().min(1),
  influencerId: z.string().min(1),
  status: z.enum(["aprovado", "reprovado"]),
  motivo: z.string().trim().max(2000).optional(),
});

/** Etapa 1 — público, sem auth. */
export const respondCampanhaInflu = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => RespondInfluInput.parse(raw))
  .handler(async ({ data }) => {
    if (data.status === "reprovado" && !data.motivo?.trim()) {
      throw new Error("Motivo é obrigatório para reprovar.");
    }
    const found = await findCampanhaByToken(data.token);
    if (!found) throw new Error("Link não encontrado.");
    const influ = await loadInfluRow(found.campanha.id, data.influencerId);
    const next = applyInfluApproval(influ, data.status, data.motivo?.trim());
    await saveInfluRow(found.campanha.id, data.influencerId, next);
    return { ok: true };
  });

const RespondEntregaInput = z.object({
  token: z.string().min(1),
  influencerId: z.string().min(1),
  entregaId: z.string().min(1),
  kind: z.enum(["roteiro", "conteudo"]),
  status: z.enum(["aprovado", "reprovado"]),
  motivo: z.string().trim().max(2000).optional(),
});

/** Etapas 2 e 3 — público, sem auth. */
export const respondCampanhaEntrega = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => RespondEntregaInput.parse(raw))
  .handler(async ({ data }) => {
    if (data.status === "reprovado" && !data.motivo?.trim()) {
      throw new Error("Motivo é obrigatório para reprovar.");
    }
    const found = await findCampanhaByToken(data.token);
    if (!found) throw new Error("Link não encontrado.");
    const influ = await loadInfluRow(found.campanha.id, data.influencerId);
    if (!influ.entregas.some((e) => e.id === data.entregaId)) {
      throw new Error("Entrega não encontrada.");
    }
    const next = applyEntregaApproval(
      influ,
      data.entregaId,
      data.kind,
      data.status,
      data.motivo?.trim(),
    );
    await saveInfluRow(found.campanha.id, data.influencerId, next);
    return { ok: true };
  });
