/**
 * Session-based (Phase 2b) counterpart of the token-based Portal do Cliente
 * (`cliente-link.functions.ts`). See CLAUDE.md, "Phase 2b — port the full
 * authenticated Portal UI".
 *
 * Every exported function here: (1) requires a real Supabase session via
 * `requireSupabaseAuth`, (2) resolves the caller's ACTIVE client
 * organization (never trusts a client-supplied organization id), (3)
 * resolves the `clientes` row for that organization, (4) for anything that
 * touches a specific `campanhaId`/`influencerId`, verifies it actually
 * belongs to that organization's `clientes` row — mirroring
 * `assertCampanhaDoCliente`'s intent, org-based instead of token-based, and
 * (5) delegates to the SAME underlying business-logic functions the token
 * path uses (`applyInfluApproval`/`applyEntregaApproval`/
 * `reopenInfluApprovalByCliente` from `campanha-aprovacao.ts`, plus the
 * newly-exported helpers from `cliente-link.functions.ts`:
 * `findClienteByOrganizationId`, `buildClienteLinkData`, `loadInfluRow`,
 * `saveInfluRow`, `assertCampanhaInCliente`, `notifyTeamEntregaResponse`,
 * `findArtigosDoCliente`, `assertAllowedUploadContentType`). The 8 existing
 * token links and every EXISTING exported function in
 * `cliente-link.functions.ts` are untouched — this file only adds new,
 * parallel entry points.
 *
 * `client_viewer` is read-only per spec ("Somente leitura. Não aprova,
 * reprova, comenta ou altera dados") — `assertCanMutate` below rejects it
 * (403-equivalent thrown error) from every mutating function.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  findClienteByOrganizationId,
  buildClienteLinkData,
  loadInfluRow,
  saveInfluRow,
  assertCampanhaInCliente,
  notifyTeamEntregaResponse,
  findArtigosDoCliente,
  assertAllowedUploadContentType,
} from "@/lib/cliente-link.functions";
import {
  applyInfluApproval,
  applyEntregaApproval,
  reopenInfluApprovalByCliente,
} from "@/lib/campanha-aprovacao";
import { PERFIL_REJEICAO_MOTIVOS } from "@/lib/campanha-status";
import type { Influ } from "@/components/influenciadores/InfluencerBoard";
import type { Cliente } from "@/lib/clientes-store";
import type { Task } from "@/components/tasks/TaskBoard";

type DB = SupabaseClient<Database>;
type Ctx = { supabase: DB; userId: string };

type ActiveClientMembership = { organizationId: string; role: string };

/**
 * Resolves the caller's ACTIVE client organization for this request.
 * - Exactly one active `client` membership → used directly, no cookie
 *   involved (the common case per the 9-clients/2-admins data).
 * - More than one → the active-org cookie (set by `setActiveOrganization`,
 *   called from `/selecionar-ambiente`) is read and re-validated here
 *   against a LIVE membership query — the cookie value itself is never
 *   trusted. No valid cookie match → caller must go pick one.
 * - None → the user has no client portal access at all.
 */
export async function resolveActiveClientOrganization(ctx: Ctx): Promise<ActiveClientMembership> {
  const { data, error } = await ctx.supabase
    .from("organization_members")
    .select("organization_id, role, status, organizations!inner(status, type)")
    .eq("user_id", ctx.userId)
    .eq("status", "active")
    .eq("organizations.status", "active")
    .eq("organizations.type", "client");
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as unknown as { organization_id: string; role: string }[];
  if (rows.length === 0) {
    throw new Error("Nenhum ambiente de cliente ativo encontrado para este usuário.");
  }
  if (rows.length === 1) {
    return { organizationId: rows[0].organization_id, role: rows[0].role };
  }

  const { readActiveOrgCookie } = await import("@/lib/active-org-cookie.server");
  const cookieOrgId = readActiveOrgCookie();
  const match = cookieOrgId ? rows.find((r) => r.organization_id === cookieOrgId) : undefined;
  if (!match) {
    throw new Error(
      "Mais de um ambiente disponível — selecione um em /selecionar-ambiente antes de continuar.",
    );
  }
  return { organizationId: match.organization_id, role: match.role };
}

export function assertCanMutate(role: string): void {
  if (role === "client_viewer") {
    throw new Error("Este acesso é somente leitura e não pode realizar esta ação.");
  }
}

async function resolveClienteForSession(
  ctx: Ctx,
): Promise<{ organizationId: string; role: string; clienteId: string; cliente: Cliente }> {
  const { organizationId, role } = await resolveActiveClientOrganization(ctx);
  const found = await findClienteByOrganizationId(organizationId);
  if (!found) throw new Error("Cliente não encontrado para esta organização.");
  return { organizationId, role, ...found };
}

/**
 * Read-only resolution used by the `/portal-app` route guard (which runs
 * client-side, `ssr: false` — it cannot read the httpOnly active-org cookie
 * itself, so it delegates to this server function instead). Returns `null`
 * instead of throwing when there's no resolvable active client org (no
 * client membership at all, or a multi-env user with no valid cookie yet) —
 * the guard treats `null` as "send to the picker", same as today.
 */
export const getActivePortalOrganization = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    try {
      const { organizationId } = await resolveActiveClientOrganization(context);
      return { organizationId };
    } catch {
      return { organizationId: null };
    }
  });

/** Sets the active-org cookie for the current session — called from
 * `/selecionar-ambiente` when a multi-environment user picks a client
 * portal. Re-validates the membership server-side before writing the
 * cookie, so the cookie can never be pointed at an organization the caller
 * isn't actually an active member of. */
export const setActiveOrganization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ organizationId: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("organization_members")
      .select("organization_id, status, organizations!inner(status)")
      .eq("user_id", context.userId)
      .eq("organization_id", data.organizationId)
      .eq("status", "active")
      .eq("organizations.status", "active");
    if (error) throw new Error(error.message);
    if (!rows || rows.length === 0) {
      throw new Error("Você não tem acesso ativo a esta organização.");
    }
    const { writeActiveOrgCookie } = await import("@/lib/active-org-cookie.server");
    writeActiveOrgCookie(data.organizationId);
    return { ok: true };
  });

/** Session-based equivalent of `getClienteLinkData` — same response shape,
 * built by the exact same shared core (`buildClienteLinkData`). */
export const getPortalDataForSession = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { clienteId, cliente, role } = await resolveClienteForSession(context);
    const base = await buildClienteLinkData(clienteId, cliente);
    // `role` is additive to the shape `getClienteLinkData` (token path)
    // returns — used only by the session UI to hide mutating actions from
    // `client_viewer`. Every server-side mutation below re-checks the role
    // itself regardless (defense in depth — never trust the client-side
    // hide alone).
    return { ...base, role };
  });

const RespondInfluInput = z
  .object({
    campanhaId: z.string().min(1),
    influencerId: z.string().min(1),
    status: z.enum(["aprovado", "reprovado"]),
    motivoLabel: z.enum(PERFIL_REJEICAO_MOTIVOS).optional(),
    comentario: z.string().trim().max(2000).optional(),
  })
  .superRefine((val, ctx) => {
    if (val.status !== "reprovado") return;
    if (!val.motivoLabel) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Selecione um motivo para não aprovar o perfil.",
        path: ["motivoLabel"],
      });
      return;
    }
    if (val.motivoLabel === "Outro" && !val.comentario) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Comentário obrigatório quando o motivo é "Outro".',
        path: ["comentario"],
      });
    }
  });

export const respondCampanhaInfluSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => RespondInfluInput.parse(raw))
  .handler(async ({ data, context }) => {
    const { role, cliente } = await resolveClienteForSession(context);
    assertCanMutate(role);
    assertCampanhaInCliente(cliente, data.campanhaId);
    const influ = await loadInfluRow(data.campanhaId, data.influencerId);
    const motivo =
      data.status === "reprovado"
        ? data.motivoLabel === "Outro"
          ? data.comentario!
          : data.motivoLabel!
        : undefined;
    const next = applyInfluApproval(influ, data.status, motivo, {
      motivoLabel: data.motivoLabel,
      comentario: data.status === "reprovado" ? data.comentario : undefined,
    });
    await saveInfluRow(data.campanhaId, data.influencerId, next);
    return { ok: true };
  });

const ReopenInfluInput = z.object({
  campanhaId: z.string().min(1),
  influencerId: z.string().min(1),
});

export const reopenCampanhaInfluSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => ReopenInfluInput.parse(raw))
  .handler(async ({ data, context }) => {
    const { role, cliente } = await resolveClienteForSession(context);
    assertCanMutate(role);
    assertCampanhaInCliente(cliente, data.campanhaId);
    const influ = await loadInfluRow(data.campanhaId, data.influencerId);
    const next = reopenInfluApprovalByCliente(influ);
    await saveInfluRow(data.campanhaId, data.influencerId, next);
    return { ok: true };
  });

const RespondEntregaInput = z
  .object({
    campanhaId: z.string().min(1),
    influencerId: z.string().min(1),
    entregaId: z.string().min(1),
    status: z.enum(["aprovado", "reprovado"]),
    motivo: z.string().trim().max(2000).optional(),
  })
  .superRefine((val, ctx) => {
    if (val.status === "reprovado" && !val.motivo) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Comentário obrigatório ao solicitar ajustes.",
        path: ["motivo"],
      });
    }
  });

export const respondCampanhaEntregaSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => RespondEntregaInput.parse(raw))
  .handler(async ({ data, context }) => {
    const { role, cliente } = await resolveClienteForSession(context);
    assertCanMutate(role);
    assertCampanhaInCliente(cliente, data.campanhaId);
    const influ = await loadInfluRow(data.campanhaId, data.influencerId);
    const entrega = influ.entregas.find((e) => e.id === data.entregaId);
    if (!entrega) throw new Error("Entrega não encontrada.");
    const next = applyEntregaApproval(influ, data.entregaId, data.status, data.motivo?.trim());
    await saveInfluRow(data.campanhaId, data.influencerId, next);
    void notifyTeamEntregaResponse(cliente.empresa, entrega, data.status);
    return { ok: true };
  });

const UpdateInfluBriefingInput = z.object({
  campanhaId: z.string().min(1),
  influencerId: z.string().min(1),
  briefingPersonalizado: z.string().trim().max(4000),
});

export const updateInfluBriefingSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => UpdateInfluBriefingInput.parse(raw))
  .handler(async ({ data, context }) => {
    const { role, cliente } = await resolveClienteForSession(context);
    assertCanMutate(role);
    assertCampanhaInCliente(cliente, data.campanhaId);
    const influ = await loadInfluRow(data.campanhaId, data.influencerId);
    const next: Influ = {
      ...influ,
      briefingPersonalizado: data.briefingPersonalizado || undefined,
    };
    await saveInfluRow(data.campanhaId, data.influencerId, next);
    return { ok: true };
  });

const UpdateInfluObservacoesInput = z.object({
  campanhaId: z.string().min(1),
  influencerId: z.string().min(1),
  observacoes: z.string().trim().max(4000),
});

export const updateInfluObservacoesSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => UpdateInfluObservacoesInput.parse(raw))
  .handler(async ({ data, context }) => {
    const { role, cliente } = await resolveClienteForSession(context);
    assertCanMutate(role);
    assertCampanhaInCliente(cliente, data.campanhaId);
    const influ = await loadInfluRow(data.campanhaId, data.influencerId);
    const next: Influ = { ...influ, observacoes: data.observacoes || undefined };
    await saveInfluRow(data.campanhaId, data.influencerId, next);
    return { ok: true };
  });

const UpdateInfluBriefingAnexoInput = z.object({
  campanhaId: z.string().min(1),
  influencerId: z.string().min(1),
  file: z
    .object({
      nome: z.string().min(1),
      dataUrl: z.string().min(1).max(8_000_000),
    })
    .nullable(),
});

export const updateInfluBriefingAnexoSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => UpdateInfluBriefingAnexoInput.parse(raw))
  .handler(async ({ data, context }) => {
    const { role, cliente, organizationId } = await resolveClienteForSession(context);
    assertCanMutate(role);
    assertCampanhaInCliente(cliente, data.campanhaId);
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
    const path = `portal-app/${organizationId}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${safeName}`;
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
  campanhaId: z.string().min(1),
  titulo: z.string().trim().min(1).max(200),
  descricao: z.string().trim().max(4000).optional(),
  file: z
    .object({
      nome: z.string().min(1),
      dataUrl: z.string().min(1).max(8_000_000),
    })
    .optional(),
});

export const submitClientDemandSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => SubmitClientDemandInput.parse(raw))
  .handler(async ({ data, context }) => {
    const { role, cliente, organizationId } = await resolveClienteForSession(context);
    assertCanMutate(role);
    assertCampanhaInCliente(cliente, data.campanhaId);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let attachments: Task["attachments"];
    if (data.file) {
      const match = /^data:([^;]+);base64,(.+)$/.exec(data.file.dataUrl);
      if (!match) throw new Error("Arquivo inválido.");
      const contentType = match[1];
      assertAllowedUploadContentType(contentType);
      const buffer = Buffer.from(match[2], "base64");
      const safeName = data.file.nome.replace(/[^\w.-]+/g, "_");
      const path = `portal-app/${organizationId}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${safeName}`;
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
      description: `Solicitado por ${cliente.empresa} pelo portal.${data.descricao ? `\n\n${data.descricao}` : ""}`,
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
  description: z.string().trim().min(1).max(4000),
  pageContext: z.string().max(500).optional(),
  screenshotDataUrl: z.string().max(8_000_000).optional(),
});

/** No mutate-role gate: a bug report is a support submission about the
 * platform itself, not an approval/comment on client campaign data, so
 * `client_viewer` (read-only on campaign decisions) may still send one. */
export const submitPortalBugReportSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => SubmitPortalBugReportInput.parse(raw))
  .handler(async ({ data, context }) => {
    const { cliente } = await resolveClienteForSession(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let screenshotPath: string | null = null;
    if (data.screenshotDataUrl) {
      const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(data.screenshotDataUrl);
      if (match) {
        const contentType = match[1];
        const ext = contentType.split("/")[1] ?? "png";
        const buffer = Buffer.from(match[2], "base64");
        const path = `portal-app/${context.userId}/${crypto.randomUUID()}.${ext}`;
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
      client_label: `Portal (sessão) · ${cliente.empresa}`,
      description: data.description.trim(),
      screenshot_path: screenshotPath,
      page_context: data.pageContext ?? null,
      source: "plataforma",
    });
    if (error) throw new Error(error.message);

    return { ok: true };
  });

const SubmitRelatorioNpsInput = z.object({
  campanhaId: z.string().min(1),
  relatorioId: z.string().min(1),
  score: z.number().int().min(0).max(10),
  comentario: z.string().trim().max(2000).optional(),
});

export const submitRelatorioNpsSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => SubmitRelatorioNpsInput.parse(raw))
  .handler(async ({ data, context }) => {
    const { role, clienteId } = await resolveClienteForSession(context);
    assertCanMutate(role);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: row, error: readError } = await supabaseAdmin
      .from("clientes")
      .select("data")
      .eq("id", clienteId)
      .single();
    if (readError || !row) throw new Error("Cliente não encontrado.");
    const cliente = row.data as Cliente;

    const campanha = cliente.campanhas?.find((c) => c.id === data.campanhaId);
    if (!campanha) throw new Error("Campanha não encontrada.");
    const relatorio = campanha.relatoriosMensais?.find((r) => r.id === data.relatorioId);
    if (!relatorio) throw new Error("Relatório não encontrado.");

    const nextCliente: Cliente = {
      ...cliente,
      campanhas: (cliente.campanhas ?? []).map((c) =>
        c.id !== data.campanhaId
          ? c
          : {
              ...c,
              relatoriosMensais: (c.relatoriosMensais ?? []).map((r) =>
                r.id !== data.relatorioId
                  ? r
                  : {
                      ...r,
                      nps: {
                        score: data.score,
                        comentario: data.comentario?.trim() || undefined,
                        respondedAt: new Date().toISOString(),
                      },
                    },
              ),
            },
      ),
    };

    const { error: writeError } = await supabaseAdmin
      .from("clientes")
      .update({ data: nextCliente })
      .eq("id", clienteId);
    if (writeError) throw new Error(writeError.message);

    return { ok: true };
  });

const ArtigoIdInput = z.object({ postId: z.string().min(1) });

async function assertArtigoDoClienteSession(clienteId: string, postId: string) {
  const artigos = await findArtigosDoCliente(clienteId);
  if (!artigos.some((a) => a.id === postId)) {
    throw new Error("Artigo não encontrado.");
  }
}

export const loadArtigoEngagementSession = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => ArtigoIdInput.parse(raw))
  .handler(async ({ data, context }) => {
    const { clienteId } = await resolveClienteForSession(context);
    await assertArtigoDoClienteSession(clienteId, data.postId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const likerKey = `cliente:${clienteId}`;
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

export const toggleArtigoLikeSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => ArtigoIdInput.parse(raw))
  .handler(async ({ data, context }) => {
    const { role, clienteId, cliente } = await resolveClienteForSession(context);
    assertCanMutate(role);
    await assertArtigoDoClienteSession(clienteId, data.postId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const likerKey = `cliente:${clienteId}`;
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
      liker_label: cliente.empresa,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const AddArtigoComentarioInput = z.object({
  postId: z.string().min(1),
  body: z.string().trim().min(1).max(2000),
});

export const addArtigoComentarioSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => AddArtigoComentarioInput.parse(raw))
  .handler(async ({ data, context }) => {
    const { role, clienteId, cliente } = await resolveClienteForSession(context);
    assertCanMutate(role);
    await assertArtigoDoClienteSession(clienteId, data.postId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("blog_comments").insert({
      post_id: data.postId,
      author_label: cliente.empresa,
      author_kind: "cliente",
      body: data.body.trim(),
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
