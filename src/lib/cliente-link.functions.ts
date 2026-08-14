import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { Cliente } from "@/lib/clientes-store";
import type { Influ, Entrega } from "@/components/influenciadores/InfluencerBoard";
import { legacyAnexoCategoria } from "@/components/influenciadores/InfluencerBoard";
import { applyInfluApproval, applyEntregaApproval } from "@/lib/campanha-aprovacao";
import {
  legacyInfluStatus,
  legacyEntregaStatus,
  INFLU_STATUS_LABEL_CLIENTE,
  ENTREGA_STATUS_LABEL_CLIENTE,
} from "@/lib/campanha-status";
import type { BlogPost, Project } from "@/lib/projetos";
import type { Task } from "@/components/tasks/TaskBoard";

/** Status "prontos pra ver" pelo cliente — INSCRITO/EM_CURADORIA são
 * planejamento interno, ainda não decidido/comunicado. */
const VISIBLE_TO_CLIENT = new Set([
  "ENVIADO_AO_CLIENTE",
  "APROVADO",
  "EM_PRODUCAO",
  "CONCLUIDO",
  "RECUSADO",
]);

function normalizedInfluStatus(influ: Influ) {
  const allEntregasPublicadas =
    influ.entregas.length > 0 && influ.entregas.every((e) => e.status === "publicado");
  return legacyInfluStatus(influ.status, {
    hasReprovacao: !!influ.clienteReprovacao,
    allEntregasPublicadas,
  });
}

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
  etapa: z.enum(["roteiro", "gravacao", "conteudo", "publicacao"]).optional(),
  /** Rótulo já simplificado pro cliente ("Aguardando sua aprovação" etc). */
  statusCliente: z.string(),
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

const StatusHistoryEntry = z.object({ status: z.string(), at: z.string() });

const InfluencerPublic = z.object({
  id: z.string(),
  nome: z.string(),
  nicho: z.string().optional(),
  foto: z.string().optional(),
  status: z.string(),
  /** Rótulo já simplificado pro cliente ("Aguardando sua aprovação" etc). */
  statusCliente: z.string(),
  clienteReprovacao: ClienteVeredito.optional(),
  briefingPersonalizado: z.string().optional(),
  briefingAnexoNome: z.string().optional(),
  briefingAnexoUrl: z.string().optional(),
  observacoes: z.string().optional(),
  redes: z.array(RedePublic),
  entregas: z.array(EntregaPublic),
  profileMetrics: z
    .object({ porRede: z.record(z.string(), RedeMetricsPublic).optional() })
    .optional(),
  criadoEm: z.string().optional(),
  historico: z.array(StatusHistoryEntry).optional(),
});

/** Extrai as mudanças de status do log interno de atividade (`activity`,
 * nunca exposto cru pro portal) — é o único lugar que guarda quando cada
 * etapa aconteceu, já que `statusUpdatedAt` só reflete a mudança mais
 * recente. Isso alimenta o histórico "enviado pra aprovação em / aprovado
 * em / etc" mostrado ao cliente. */
function statusHistoryFor(influ: Influ): { status: string; at: string }[] {
  return (influ.activity ?? [])
    .map((a) => {
      const m = /^mudou status para (.+)$/.exec(a.action);
      return m ? { status: m[1], at: a.createdAt } : null;
    })
    .filter((x): x is { status: string; at: string } => !!x)
    .sort((a, b) => a.at.localeCompare(b.at));
}

/** Projeta um `Influ` interno (que carrega telefone/email/contrato/bank/
 * comments/activity/checklist/pagamento por entrega) pro subconjunto seguro
 * de mostrar num link público — nunca o objeto cru. */
function toPublicEntrega(e: Entrega): z.infer<typeof EntregaPublic> {
  const { status: entregaStatus, etapa } = legacyEntregaStatus(e.conteudoStatus, e.etapa);
  return {
    id: e.id,
    tipo: e.tipo,
    titulo: e.titulo,
    quantidade: e.quantidade,
    status: e.status,
    conteudoStatus: entregaStatus,
    etapa,
    statusCliente: ENTREGA_STATUS_LABEL_CLIENTE[entregaStatus],
    dataPostagem: e.dataPostagem,
    publicadoEm: e.publicadoEm,
    url: e.url,
    anexos: (e.anexos ?? []).map((a) => ({ ...a, categoria: legacyAnexoCategoria(a.categoria) })),
    metrics: e.metrics,
    roteiroReprovacao: e.roteiroReprovacao,
    conteudoReprovacao: e.conteudoReprovacao,
  };
}

function toPublicInfluencer(influ: Influ): z.infer<typeof InfluencerPublic> {
  const status = normalizedInfluStatus(influ);
  return {
    id: influ.id,
    nome: influ.nome,
    nicho: influ.nicho,
    foto: influ.foto,
    status,
    statusCliente: INFLU_STATUS_LABEL_CLIENTE[status],
    clienteReprovacao: influ.clienteReprovacao,
    briefingPersonalizado: influ.briefingPersonalizado,
    briefingAnexoNome: influ.briefingAnexoNome,
    briefingAnexoUrl: influ.briefingAnexoUrl,
    observacoes: influ.observacoes,
    redes: influ.redes.map((r) => ({
      id: r.id,
      plataforma: r.plataforma,
      handle: r.handle,
      seguidores: r.seguidores,
    })),
    entregas: influ.entregas.map(toPublicEntrega),
    profileMetrics: influ.profileMetrics,
    criadoEm: influ.createdAt,
    historico: statusHistoryFor(influ),
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

// Tokens são gerados como `crypto.randomUUID().replace(/-/g, "")` (32 hex
// chars) — rejeitar qualquer coisa menor antes de bater no banco evita um
// full-scan de `clientes` por tentativa óbvia de token inválido/curto demais.
const TokenInput = z.object({ token: z.string().min(20).max(64) });

/** Content-types aceitos em upload público (briefing/demanda do cliente) —
 * sem essa lista, qualquer `contentType` informado no data-URL era aceito
 * (ex: `text/html`, `image/svg+xml`, que podem embutir script e, se o
 * bucket algum dia virar público/CDN, executar no navegador de quem abrir
 * o link do anexo). Cobre os formatos usados na prática (mídia kit,
 * briefing, comprovantes) sem abrir pra tipo arbitrário. */
const ALLOWED_UPLOAD_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/csv",
]);
function assertAllowedUploadContentType(contentType: string) {
  if (!ALLOWED_UPLOAD_CONTENT_TYPES.has(contentType)) {
    throw new Error("Tipo de arquivo não suportado.");
  }
}

/** Curtir/comentar/ler engajamento aceitavam qualquer `postId`, sem
 * confirmar que o artigo pertence (publicado + compartilhado via
 * `portalClienteIds`) ao cliente do token — um token válido conseguia
 * curtir/comentar em artigo de OUTRO cliente, ou em rascunho não publicado.
 * Mesmo formato de checagem de posse usado em `assertCampanhaDoCliente`. */
async function assertArtigoDoCliente(clienteId: string, postId: string) {
  const artigos = await findArtigosDoCliente(clienteId);
  if (!artigos.some((a) => a.id === postId)) {
    throw new Error("Artigo não encontrado.");
  }
}

const ArtigoEngagementPublic = z.object({
  likeCount: z.number(),
  likedByMe: z.boolean(),
  comments: z.array(
    z.object({
      id: z.string(),
      authorLabel: z.string(),
      authorKind: z.enum(["team", "cliente"]),
      body: z.string(),
      createdAt: z.string(),
    }),
  ),
});

/** Público, sem auth — curtidas/comentários de um artigo, carregados sob
 * demanda ao abrir a leitura (não vem junto com `getClienteLinkData`, pra
 * não inflar o payload da lista de artigos). */
export const loadArtigoEngagement = createServerFn({ method: "GET" })
  .inputValidator((raw: unknown) => TokenInput.extend({ postId: z.string().min(1) }).parse(raw))
  .handler(async ({ data }): Promise<z.infer<typeof ArtigoEngagementPublic>> => {
    const found = await findClienteByToken(data.token);
    if (!found) throw new Error("Link não encontrado.");
    await assertArtigoDoCliente(found.clienteId, data.postId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const likerKey = `cliente:${found.clienteId}`;
    const [likesRes, commentsRes] = await Promise.all([
      supabaseAdmin.from("blog_likes").select("liker_key").eq("post_id", data.postId),
      supabaseAdmin
        .from("blog_comments")
        .select("id, author_label, author_kind, body, created_at")
        .eq("post_id", data.postId)
        .order("created_at", { ascending: true }),
    ]);
    if (likesRes.error) throw new Error(likesRes.error.message);
    if (commentsRes.error) throw new Error(commentsRes.error.message);
    return {
      likeCount: likesRes.data.length,
      likedByMe: likesRes.data.some((r) => r.liker_key === likerKey),
      comments: commentsRes.data.map((r) => ({
        id: r.id,
        authorLabel: r.author_label,
        authorKind: r.author_kind === "cliente" ? ("cliente" as const) : ("team" as const),
        body: r.body,
        createdAt: r.created_at,
      })),
    };
  });

/** Público, sem auth — curtir/descurtir um artigo. Identidade é o nome do
 * cliente do próprio token (sem pedir nada na hora), chaveado por
 * `cliente:<clienteId>` pra permitir toggle idempotente. */
export const toggleArtigoLike = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => TokenInput.extend({ postId: z.string().min(1) }).parse(raw))
  .handler(async ({ data }) => {
    const found = await findClienteByToken(data.token);
    if (!found) throw new Error("Link não encontrado.");
    await assertArtigoDoCliente(found.clienteId, data.postId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const likerKey = `cliente:${found.clienteId}`;
    const { data: existing, error: findError } = await supabaseAdmin
      .from("blog_likes")
      .select("id")
      .eq("post_id", data.postId)
      .eq("liker_key", likerKey)
      .maybeSingle();
    if (findError) throw new Error(findError.message);
    if (existing) {
      const { error } = await supabaseAdmin.from("blog_likes").delete().eq("id", existing.id);
      if (error) throw new Error(error.message);
      return { ok: true };
    }
    const { error } = await supabaseAdmin.from("blog_likes").insert({
      post_id: data.postId,
      liker_key: likerKey,
      liker_label: found.cliente.empresa,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const AddArtigoComentarioInput = TokenInput.extend({
  postId: z.string().min(1),
  body: z.string().trim().min(1).max(2000),
});

/** Público, sem auth — comenta num artigo. Autor é sempre o nome da
 * empresa do cliente do token (`author_kind: "cliente"`). */
export const addArtigoComentario = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => AddArtigoComentarioInput.parse(raw))
  .handler(async ({ data }) => {
    const found = await findClienteByToken(data.token);
    if (!found) throw new Error("Link não encontrado.");
    await assertArtigoDoCliente(found.clienteId, data.postId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("blog_comments").insert({
      post_id: data.postId,
      author_label: found.cliente.empresa,
      author_kind: "cliente",
      body: data.body.trim(),
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const CronogramaItemPublic = z.object({
  id: z.string(),
  date: z.string(),
  title: z.string(),
  description: z.string().optional(),
  recurring: z.boolean().optional(),
});

/** Público — sem auth. Usado pela página `/portal/$token`. Retorna TODAS
 * as campanhas do cliente, cada uma já com seus influenciadores. */
export const getClienteLinkData = createServerFn({ method: "GET" })
  .inputValidator((raw: unknown) => TokenInput.parse(raw))
  .handler(async ({ data }) => {
    const found = await findClienteByToken(data.token);
    if (!found) throw new Error("Link não encontrado.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const campanhas = found.cliente.campanhas ?? [];

    const campanhasComInflus = await Promise.all(
      campanhas.map(async (c) => {
        const { data: rows, error } = await supabaseAdmin
          .from("campanha_influenciadores")
          .select("data")
          .eq("campanha_id", c.id);
        if (error) throw new Error(error.message);
        // Só mostra pro cliente influenciadores que o time já enviou pra
        // aprovação (ou mais adiante no funil) — INSCRITO/EM_CURADORIA é
        // planejamento interno, ainda não decidido/comunicado.
        const influencers = ((rows ?? []) as { data: Influ }[])
          .filter((r) => VISIBLE_TO_CLIENT.has(normalizedInfluStatus(r.data)))
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
          relatorioMetricas: c.relatorioMetricas,
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

const UpdateInfluObservacoesInput = z.object({
  token: z.string().min(1),
  campanhaId: z.string().min(1),
  influencerId: z.string().min(1),
  observacoes: z.string().trim().max(4000),
});

/** Público, sem auth — mesma ideia de `updateInfluBriefing`, mas pro campo
 * de observações. */
export const updateInfluObservacoes = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => UpdateInfluObservacoesInput.parse(raw))
  .handler(async ({ data }) => {
    await assertCampanhaDoCliente(data.token, data.campanhaId);
    const influ = await loadInfluRow(data.campanhaId, data.influencerId);
    const next: Influ = { ...influ, observacoes: data.observacoes || undefined };
    await saveInfluRow(data.campanhaId, data.influencerId, next);
    return { ok: true };
  });

const UpdateInfluBriefingAnexoInput = z.object({
  token: z.string().min(1),
  campanhaId: z.string().min(1),
  influencerId: z.string().min(1),
  /** null remove o anexo atual. */
  file: z
    .object({
      nome: z.string().min(1),
      /** Data URL (`data:...;base64,...`) do arquivo. */
      dataUrl: z.string().min(1).max(8_000_000),
    })
    .nullable(),
});

/** Público, sem auth — permite o cliente anexar (ou remover) um arquivo no
 * briefing personalizado direto pelo portal. Sobe pro mesmo bucket
 * `entrega-anexos` usado internamente, prefixado por `portal/{token}/...`
 * (service-role contorna a RLS do bucket, que só libera pra `authenticated`). */
export const updateInfluBriefingAnexo = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => UpdateInfluBriefingAnexoInput.parse(raw))
  .handler(async ({ data }) => {
    await assertCampanhaDoCliente(data.token, data.campanhaId);
    const influ = await loadInfluRow(data.campanhaId, data.influencerId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (!data.file) {
      const next: Influ = {
        ...influ,
        briefingAnexoNome: undefined,
        briefingAnexoUrl: undefined,
      };
      await saveInfluRow(data.campanhaId, data.influencerId, next);
      return { ok: true };
    }

    const match = /^data:([^;]+);base64,(.+)$/.exec(data.file.dataUrl);
    if (!match) throw new Error("Arquivo inválido.");
    const contentType = match[1];
    assertAllowedUploadContentType(contentType);
    const buffer = Buffer.from(match[2], "base64");
    const safeName = data.file.nome.replace(/[^\w.-]+/g, "_");
    const path = `portal/${data.token}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${safeName}`;
    const { error: uploadError } = await supabaseAdmin.storage
      .from("entrega-anexos")
      .upload(path, buffer, { contentType });
    if (uploadError) throw new Error(uploadError.message);
    const { data: signed } = await supabaseAdmin.storage
      .from("entrega-anexos")
      .createSignedUrl(path, 60 * 60 * 24 * 365);
    if (!signed) throw new Error("Não foi possível gerar o link do anexo.");

    const next: Influ = {
      ...influ,
      briefingAnexoNome: data.file.nome,
      briefingAnexoUrl: signed.signedUrl,
    };
    await saveInfluRow(data.campanhaId, data.influencerId, next);
    return { ok: true };
  });

const SubmitClientDemandInput = z.object({
  token: z.string().min(1),
  campanhaId: z.string().min(1),
  titulo: z.string().trim().min(1).max(200),
  descricao: z.string().trim().max(4000).optional(),
  /** Anexo único, opcional. */
  file: z
    .object({
      nome: z.string().min(1),
      /** Data URL (`data:...;base64,...`) do arquivo. */
      dataUrl: z.string().min(1).max(8_000_000),
    })
    .optional(),
});

/** Público, sem auth — o cliente abre uma demanda pro time direto de dentro
 * de uma campanha no portal. Vira uma Tarefa normal em `campanha_tarefas`
 * (mesma tabela/board que o time já usa) marcada com a tag "Cliente", em
 * vez de uma entidade separada — aparece sozinha no board por realtime,
 * sem precisar de nenhuma UI nova ali. */
export const submitClientDemand = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => SubmitClientDemandInput.parse(raw))
  .handler(async ({ data }) => {
    const found = await findClienteByToken(data.token);
    if (!found) throw new Error("Link não encontrado.");
    if (!found.cliente.campanhas?.some((c) => c.id === data.campanhaId)) {
      throw new Error("Campanha não encontrada neste link.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let attachments: Task["attachments"];
    if (data.file) {
      const match = /^data:([^;]+);base64,(.+)$/.exec(data.file.dataUrl);
      if (!match) throw new Error("Arquivo inválido.");
      const contentType = match[1];
      assertAllowedUploadContentType(contentType);
      const buffer = Buffer.from(match[2], "base64");
      const safeName = data.file.nome.replace(/[^\w.-]+/g, "_");
      const path = `portal/${data.token}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${safeName}`;
      const { error: uploadError } = await supabaseAdmin.storage
        .from("entrega-anexos")
        .upload(path, buffer, { contentType });
      if (uploadError) throw new Error(uploadError.message);
      const { data: signed } = await supabaseAdmin.storage
        .from("entrega-anexos")
        .createSignedUrl(path, 60 * 60 * 24 * 365);
      if (!signed) throw new Error("Não foi possível gerar o link do anexo.");
      attachments = [{ id: crypto.randomUUID(), name: data.file.nome, url: signed.signedUrl }];
    }

    const task: Task = {
      id: crypto.randomUUID(),
      title: data.titulo,
      description: `Solicitado por ${found.cliente.empresa} pelo portal.${data.descricao ? `\n\n${data.descricao}` : ""}`,
      status: "Aberto",
      priority: "Normal",
      tags: ["Cliente"],
      attachments,
      createdAt: new Date().toISOString(),
    };

    const { error } = await supabaseAdmin
      .from("campanha_tarefas")
      .insert({ campanha_id: data.campanhaId, data: task });
    if (error) throw new Error(error.message);

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
