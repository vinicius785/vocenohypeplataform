import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { Cliente } from "@/lib/clientes-store";
import { INFLU_STATUSES, type Influ } from "@/components/influenciadores/InfluencerBoard";
import { applyInfluApproval, applyEntregaApproval } from "@/lib/campanha-aprovacao";
import type { BlogPost, Project } from "@/lib/projetos";

/**
 * Portal público fixo do CLIENTE (`/portal/$token`) — um único link mostra
 * todas as campanhas do cliente (por isso o token mora em `Cliente`, não em
 * `Campaign`). Nunca fala com Supabase direto do browser — só via as server
 * functions abaixo, sempre com o service-role client, porque nem `clientes`
 * nem `campanha_influenciadores` têm policy `anon`.
 */

async function findClienteByToken(
  token: string,
): Promise<{ clienteId: string; cliente: Cliente } | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: rows, error } = await supabaseAdmin.from("clientes").select("id, data");
  if (error) throw new Error(error.message);
  for (const row of (rows ?? []) as { id: string; data: Cliente }[]) {
    if (row.data.publicToken === token) return { clienteId: row.id, cliente: row.data };
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
  publicadoEm: z.string().optional(),
  url: z.string().optional(),
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
  briefingPersonalizado: z.string().optional(),
  observacoes: z.string().optional(),
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
    briefingPersonalizado: influ.briefingPersonalizado,
    observacoes: influ.observacoes,
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
      publicadoEm: e.publicadoEm,
      url: e.url,
      anexos: e.anexos,
      metrics: e.metrics,
      roteiroReprovacao: e.roteiroReprovacao,
      conteudoReprovacao: e.conteudoReprovacao,
    })),
    profileMetrics: influ.profileMetrics,
  };
}

const ArticlePublic = z.object({
  id: z.string(),
  title: z.string(),
  cover: z.string().optional(),
  category: z.string().optional(),
  excerpt: z.string().optional(),
  content: z.string().optional(),
  authorName: z.string().optional(),
  publishDate: z.string().optional(),
});

/** Busca, entre todos os projetos, os artigos do blog marcados pra
 * aparecer no portal deste cliente (`portalClienteIds`) e já publicados —
 * rascunho/revisão/arquivado nunca aparecem no link público. */
async function findArtigosDoCliente(clienteId: string): Promise<z.infer<typeof ArticlePublic>[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: rows, error } = await supabaseAdmin.from("projetos").select("data");
  if (error) throw new Error(error.message);
  const artigos: z.infer<typeof ArticlePublic>[] = [];
  for (const row of (rows ?? []) as { data: Project }[]) {
    for (const post of (row.data.blog ?? []) as BlogPost[]) {
      if (post.status !== "publicado") continue;
      if (!post.portalClienteIds?.includes(clienteId)) continue;
      artigos.push({
        id: post.id,
        title: post.title,
        cover: post.cover,
        category: post.category,
        excerpt: post.excerpt,
        content: post.content,
        authorName: post.authorName,
        publishDate: post.publishDate,
      });
    }
  }
  artigos.sort((a, b) => (b.publishDate ?? "").localeCompare(a.publishDate ?? ""));
  return artigos;
}

const CronogramaItemPublic = z.object({
  id: z.string(),
  date: z.string(),
  title: z.string(),
  description: z.string().optional(),
});

const TokenInput = z.object({ token: z.string().min(1) });

/** Público — sem auth. Usado pela página `/portal/$token`. Retorna TODAS
 * as campanhas do cliente, cada uma já com seus influenciadores. */
export const getClienteLinkData = createServerFn({ method: "GET" })
  .inputValidator((raw: unknown) => TokenInput.parse(raw))
  .handler(async ({ data }) => {
    const found = await findClienteByToken(data.token);
    if (!found) throw new Error("Link não encontrado.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const campanhas = found.cliente.campanhas ?? [];
    const enviadoIdx = INFLU_STATUSES.indexOf("Enviado para aprovação");

    const campanhasComInflus = await Promise.all(
      campanhas.map(async (c) => {
        const { data: rows, error } = await supabaseAdmin
          .from("campanha_influenciadores")
          .select("data")
          .eq("campanha_id", c.id);
        if (error) throw new Error(error.message);
        // Só mostra pro cliente influenciadores que o time já enviou pra
        // aprovação (ou mais adiante no funil) — "Lista" é planejamento
        // interno, ainda não decidido/comunicado.
        const influencers = ((rows ?? []) as { data: Influ }[])
          .filter((r) => INFLU_STATUSES.indexOf(r.data.status) >= enviadoIdx)
          .map((r) => toPublicInfluencer(r.data));
        const planejado = c.linhas.reduce((sum, l) => sum + (l.quantidade || 0), 0);

        const { data: cronogramaRows, error: cronogramaError } = await supabaseAdmin
          .from("campanha_cronograma")
          .select("data")
          .eq("campanha_id", c.id);
        if (cronogramaError) throw new Error(cronogramaError.message);
        const cronograma = (
          (cronogramaRows ?? []) as { data: z.infer<typeof CronogramaItemPublic> }[]
        )
          .map((r) => r.data)
          .sort((a, b) => a.date.localeCompare(b.date));

        return {
          id: c.id,
          nome: c.nome,
          prazo: c.prazo,
          dataInicio: c.dataInicio,
          planejado,
          influencers,
          cronograma,
        };
      }),
    );

    const artigos = await findArtigosDoCliente(found.clienteId);

    return {
      clienteNome: found.cliente.empresa,
      clienteFoto: found.cliente.photo,
      campanhas: campanhasComInflus,
      artigos,
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

/** Confirma que `campanhaId` pertence de fato ao cliente dono do token —
 * evita que alguém adulterar uma campanha de outro cliente adivinhando o id. */
async function assertCampanhaDoCliente(token: string, campanhaId: string): Promise<void> {
  const found = await findClienteByToken(token);
  if (!found) throw new Error("Link não encontrado.");
  if (!found.cliente.campanhas?.some((c) => c.id === campanhaId)) {
    throw new Error("Campanha não encontrada neste link.");
  }
}

const RespondInfluInput = z.object({
  token: z.string().min(1),
  campanhaId: z.string().min(1),
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
    await assertCampanhaDoCliente(data.token, data.campanhaId);
    const influ = await loadInfluRow(data.campanhaId, data.influencerId);
    const next = applyInfluApproval(influ, data.status, data.motivo?.trim());
    await saveInfluRow(data.campanhaId, data.influencerId, next);
    return { ok: true };
  });

const RespondEntregaInput = z.object({
  token: z.string().min(1),
  campanhaId: z.string().min(1),
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
    await assertCampanhaDoCliente(data.token, data.campanhaId);
    const influ = await loadInfluRow(data.campanhaId, data.influencerId);
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
    await saveInfluRow(data.campanhaId, data.influencerId, next);
    return { ok: true };
  });

const UpdateInfluBriefingInput = z.object({
  token: z.string().min(1),
  campanhaId: z.string().min(1),
  influencerId: z.string().min(1),
  briefingPersonalizado: z.string().trim().max(4000),
});

/** Público, sem auth — permite o cliente preencher/editar o briefing
 * personalizado do influenciador direto pelo portal (o time também pode
 * editar o mesmo campo internamente, em `InfluencerProfileDialog`). */
export const updateInfluBriefing = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => UpdateInfluBriefingInput.parse(raw))
  .handler(async ({ data }) => {
    await assertCampanhaDoCliente(data.token, data.campanhaId);
    const influ = await loadInfluRow(data.campanhaId, data.influencerId);
    const next: Influ = {
      ...influ,
      briefingPersonalizado: data.briefingPersonalizado || undefined,
    };
    await saveInfluRow(data.campanhaId, data.influencerId, next);
    return { ok: true };
  });

const SubmitPortalBugReportInput = z.object({
  token: z.string().min(1),
  description: z.string().trim().min(1).max(4000),
  pageContext: z.string().max(500).optional(),
  /** Data URL (`data:image/...;base64,...`) do print anexado, opcional. */
  screenshotDataUrl: z.string().max(8_000_000).optional(),
});

/** Versão do botão "Encontrou um bug?" pro portal público, sem sessão —
 * usa o client de service-role pra contornar RLS (que exige `auth.uid()`)
 * com segurança, só no servidor. `client_label` guarda de qual cliente/token
 * veio, já que não há usuário autenticado. */
export const submitPortalBugReport = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => SubmitPortalBugReportInput.parse(raw))
  .handler(async ({ data }) => {
    const found = await findClienteByToken(data.token);
    if (!found) throw new Error("Link não encontrado.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let screenshotPath: string | null = null;
    if (data.screenshotDataUrl) {
      const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(data.screenshotDataUrl);
      if (match) {
        const contentType = match[1];
        const ext = contentType.split("/")[1] ?? "png";
        const buffer = Buffer.from(match[2], "base64");
        const path = `portal/${data.token}/${crypto.randomUUID()}.${ext}`;
        const { error: uploadError } = await supabaseAdmin.storage
          .from("bug-reports")
          .upload(path, buffer, { contentType });
        if (uploadError) throw new Error(uploadError.message);
        screenshotPath = path;
      }
    }

    const { error } = await supabaseAdmin.from("bug_reports").insert({
      reporter_id: null,
      reporter_name: "",
      client_label: `Portal · ${found.cliente.empresa}`,
      description: data.description.trim(),
      screenshot_path: screenshotPath,
      page_context: data.pageContext ?? null,
    });
    if (error) throw new Error(error.message);

    return { ok: true };
  });
