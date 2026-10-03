/**
 * Central de Problemas — dados e vocabulário. Reaproveita `bug_reports`
 * (source='plataforma'); o painel do Projeto HypeApp (source='hypeapp')
 * segue em `bug-reports.ts`. Toda leitura/escrita usa o client do usuário
 * (RLS): ver/criar/comentar = membro interno; triar = `can_manage_problems`
 * (admin ou permissão "problemas"); histórico é gravado por trigger
 * (migration `20261003100000_central_de_problemas.sql`), nunca pelo cliente.
 */
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

export type ProblemKind = "bug" | "problema" | "sugestao" | "duvida";
export type ProblemStatus =
  | "novo"
  | "em_analise"
  | "em_correcao"
  | "aguardando_info"
  | "resolvido"
  | "fechado";
export type ProblemPriority = "baixa" | "normal" | "alta" | "critica";

export const PROBLEM_KINDS: ProblemKind[] = ["bug", "problema", "sugestao", "duvida"];
export const PROBLEM_KIND_LABEL: Record<ProblemKind, string> = {
  bug: "Bug",
  problema: "Problema",
  sugestao: "Sugestão",
  duvida: "Dúvida",
};

export const PROBLEM_STATUSES: ProblemStatus[] = [
  "novo",
  "em_analise",
  "em_correcao",
  "aguardando_info",
  "resolvido",
  "fechado",
];
export const PROBLEM_STATUS_LABEL: Record<ProblemStatus, string> = {
  novo: "Novo",
  em_analise: "Em análise",
  em_correcao: "Em correção",
  aguardando_info: "Aguardando informações",
  resolvido: "Resolvido",
  // "fechado" no banco = Arquivado na interface (sem estado novo no schema).
  fechado: "Arquivado",
};
export const FINISHED_STATUSES = new Set<ProblemStatus>(["resolvido", "fechado"]);

/** Fluxo oferecido na interface: Novo → Em análise → Em correção →
 * Resolvido (+ Arquivado). "Aguardando informações" continua existindo no
 * banco e é exibido se algum report estiver nele, mas não é oferecido. */
export const PROBLEM_STATUS_OPTIONS: ProblemStatus[] = [
  "novo",
  "em_analise",
  "em_correcao",
  "resolvido",
  "fechado",
];

export const PROBLEM_PRIORITIES: ProblemPriority[] = ["baixa", "normal", "alta", "critica"];
export const PROBLEM_PRIORITY_LABEL: Record<ProblemPriority, string> = {
  baixa: "Baixa",
  normal: "Normal",
  alta: "Alta",
  critica: "Crítica",
};
export const PRIORITY_RANK: Record<ProblemPriority, number> = {
  critica: 0,
  alta: 1,
  normal: 2,
  baixa: 3,
};

/** Áreas = módulos da sidebar + "Outro". */
export const PROBLEM_AREAS = [
  "Início",
  "Clientes",
  "Campanhas",
  "Projetos",
  "Reuniões",
  "Comercial",
  "Financeiro",
  "Time",
  "Influenciadores",
  "Metas",
  "Chat",
  "Configurações",
  "Outro",
] as const;
export type ProblemArea = (typeof PROBLEM_AREAS)[number];

export type Problem = {
  id: string;
  kind: ProblemKind;
  title: string;
  description: string;
  area: string | null;
  priority: ProblemPriority;
  status: ProblemStatus;
  reporterId: string | null;
  reporterName: string;
  clientLabel: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  resolutionNote: string | null;
  resolvedAt: string | null;
  resolvedByName: string | null;
  /** Print do fluxo antigo (botão flutuante / portal). */
  legacyScreenshotPath: string | null;
  pageContext: string | null;
  createdAt: string;
  updatedAt: string;
};

type Row = {
  id: string;
  kind: string;
  title: string | null;
  description: string;
  area: string | null;
  priority: string;
  status: string;
  reporter_id: string | null;
  reporter_name: string;
  client_label: string | null;
  assignee_id: string | null;
  assignee_name: string | null;
  resolution_note: string | null;
  resolved_at: string | null;
  resolved_by_name: string | null;
  screenshot_path: string | null;
  page_context: string | null;
  created_at: string;
  updated_at: string;
};

const asKind = (v: string): ProblemKind =>
  (PROBLEM_KINDS as string[]).includes(v) ? (v as ProblemKind) : "bug";
const asStatus = (v: string): ProblemStatus =>
  (PROBLEM_STATUSES as string[]).includes(v) ? (v as ProblemStatus) : "novo";
const asPriority = (v: string): ProblemPriority =>
  (PROBLEM_PRIORITIES as string[]).includes(v) ? (v as ProblemPriority) : "normal";

/** Título de reports antigos (só descrição): primeira linha, encurtada. */
export function fallbackTitle(description: string): string {
  const first = description.trim().split("\n")[0] ?? "";
  return first.length > 90 ? `${first.slice(0, 87)}…` : first || "Sem título";
}

export function mapProblem(r: Row): Problem {
  return {
    id: r.id,
    kind: asKind(r.kind),
    title: r.title?.trim() || fallbackTitle(r.description),
    description: r.description,
    area: r.area,
    priority: asPriority(r.priority),
    status: asStatus(r.status),
    reporterId: r.reporter_id,
    reporterName: r.reporter_name || r.client_label || "—",
    clientLabel: r.client_label,
    assigneeId: r.assignee_id,
    assigneeName: r.assignee_name,
    resolutionNote: r.resolution_note,
    resolvedAt: r.resolved_at,
    resolvedByName: r.resolved_by_name,
    legacyScreenshotPath: r.screenshot_path,
    pageContext: r.page_context,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/* ------------------------------------------------------------------ */
/* Compatibilidade com o banco ANTES da migration da Central           */
/* ------------------------------------------------------------------ */

// Enquanto `20261003100000_central_de_problemas.sql` não for aplicada, as
// colunas novas não existem (Postgres 42703 / PostgREST PGRST204). Nesse
// modo a Central lê e grava no formato antigo (descrição + print) e a UI
// esconde triagem/histórico/comentários — nunca uma tela quebrada.
let legacySchema = false;
export function isLegacyProblemsSchema(): boolean {
  return legacySchema;
}
function isMissingSchema(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  return (
    err.code === "42703" ||
    err.code === "PGRST204" ||
    err.code === "42P01" ||
    /does not exist|Could not find/i.test(err.message ?? "")
  );
}

type LegacyRow = {
  id: string;
  kind: string;
  description: string;
  reporter_id: string | null;
  reporter_name: string;
  client_label: string | null;
  screenshot_path: string | null;
  page_context: string | null;
  created_at: string;
  resolved: boolean;
  resolved_at: string | null;
};

function mapLegacy(r: LegacyRow): Problem {
  return mapProblem({
    ...r,
    title: null,
    area: null,
    priority: "normal",
    status: r.resolved ? "resolvido" : "novo",
    assignee_id: null,
    assignee_name: null,
    resolution_note: null,
    resolved_by_name: null,
    updated_at: r.resolved_at ?? r.created_at,
  });
}

const LEGACY_COLUMNS =
  "id, kind, description, reporter_id, reporter_name, client_label, screenshot_path, page_context, created_at, resolved, resolved_at";

const COLUMNS =
  "id, kind, title, description, area, priority, status, reporter_id, reporter_name, client_label, assignee_id, assignee_name, resolution_note, resolved_at, resolved_by_name, screenshot_path, page_context, created_at, updated_at";

export async function listProblems(): Promise<Problem[]> {
  const { data, error } = await supabase
    .from("bug_reports")
    .select(COLUMNS)
    .eq("source", "plataforma")
    .order("updated_at", { ascending: false })
    .limit(500);
  if (isMissingSchema(error)) {
    legacySchema = true;
    const legacy = await supabase
      .from("bug_reports")
      .select(LEGACY_COLUMNS)
      .eq("source", "plataforma")
      .order("created_at", { ascending: false })
      .limit(500);
    if (legacy.error) throw new Error("Não foi possível carregar os problemas.");
    return ((legacy.data ?? []) as LegacyRow[]).map(mapLegacy);
  }
  if (error) throw new Error("Não foi possível carregar os problemas.");
  legacySchema = false;
  return ((data ?? []) as Row[]).map(mapProblem);
}

export async function getProblem(id: string): Promise<Problem | null> {
  const { data, error } = await supabase
    .from("bug_reports")
    .select(COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error("Não foi possível carregar o problema.");
  return data ? mapProblem(data as Row) : null;
}

/* ------------------------------------------------------------------ */
/* Contadores (indicadores do topo)                                    */
/* ------------------------------------------------------------------ */

export type ProblemSummary = {
  abertos: number;
  emAnalise: number;
  emCorrecao: number;
  resolvidos: number;
};

/** "Abertos" = novo + aguardando informações (ainda sem ninguém atuando).
 * Arquivados não entram em nenhum indicador. */
export function summarizeProblems(list: Problem[]): ProblemSummary {
  const s: ProblemSummary = { abertos: 0, emAnalise: 0, emCorrecao: 0, resolvidos: 0 };
  for (const p of list) {
    if (p.status === "novo" || p.status === "aguardando_info") s.abertos += 1;
    else if (p.status === "em_analise") s.emAnalise += 1;
    else if (p.status === "em_correcao") s.emCorrecao += 1;
    else if (p.status === "resolvido") s.resolvidos += 1;
  }
  return s;
}

/* ------------------------------------------------------------------ */
/* Criação                                                             */
/* ------------------------------------------------------------------ */

export type ProblemDiagnostics = {
  route?: string;
  module?: string;
  userAgent?: string;
  platform?: string;
  viewport?: string;
  touch?: boolean;
  language?: string;
  appVersion?: string;
};

const MAX_FILE_BYTES = 20 * 1024 * 1024;

export async function uploadProblemFile(
  file: File,
  reportId: string,
  commentId?: string,
): Promise<void> {
  if (file.size > MAX_FILE_BYTES) throw new Error(`"${file.name}" passa de 20 MB.`);
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new Error("Sessão inválida.");
  const ext = (file.name.split(".").pop() ?? "bin").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `${uid}/problemas/${reportId}/${crypto.randomUUID()}.${ext || "bin"}`;
  const { error: upErr } = await supabase.storage
    .from("bug-reports")
    .upload(path, file, { contentType: file.type || undefined });
  if (upErr) throw new Error(`Não foi possível enviar "${file.name}".`);
  const { error } = await supabase.from("bug_report_attachments").insert({
    report_id: reportId,
    comment_id: commentId ?? null,
    path,
    name: file.name.slice(0, 300),
    mime: file.type || null,
    size_bytes: file.size,
    uploaded_by: uid,
  });
  if (error) throw new Error(`Não foi possível registrar "${file.name}".`);
}

export async function createProblem(input: {
  kind: ProblemKind;
  title: string;
  description: string;
  area: string;
  priority: ProblemPriority;
  files: File[];
  diagnostics: ProblemDiagnostics;
}): Promise<string> {
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) throw new Error("Sessão inválida.");
  const uid = auth.user.id;
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", uid)
    .maybeSingle();

  const { data, error } = await supabase
    .from("bug_reports")
    .insert({
      reporter_id: uid,
      reporter_name: profile?.full_name || auth.user.email || "",
      kind: input.kind,
      title: input.title.trim().slice(0, 200),
      description: input.description.trim(),
      area: input.area,
      priority: input.priority,
      page_context: input.diagnostics.route ?? null,
      source: "plataforma",
    })
    .select("id")
    .single();
  if (isMissingSchema(error)) {
    legacySchema = true;
    await createLegacyProblem(uid, profile?.full_name || auth.user.email || "", input);
    return "";
  }
  if (error || !data) throw new Error("Não foi possível enviar o report.");

  // Diagnóstico e anexos são complementares: uma falha aqui não desfaz o
  // report (já registrado), só é avisada.
  const problems: string[] = [];
  const { error: diagErr } = await supabase
    .from("bug_report_diagnostics")
    .insert({ report_id: data.id, data: input.diagnostics as unknown as Json });
  if (diagErr) problems.push("diagnóstico");
  for (const f of input.files) {
    try {
      await uploadProblemFile(f, data.id);
    } catch {
      problems.push(f.name);
    }
  }
  if (problems.length) {
    throw new PartialProblemError(data.id, problems);
  }
  return data.id;
}

/** Formato antigo: título vira 1ª linha da descrição; só a 1ª imagem vai
 * como print (única coluna de anexo que existia); rota em `page_context`. */
async function createLegacyProblem(
  uid: string,
  reporterName: string,
  input: Parameters<typeof createProblem>[0],
): Promise<void> {
  let screenshotPath: string | null = null;
  const image = input.files.find((f) => isImage(f.type || f.name));
  if (image) {
    const ext = (image.name.split(".").pop() ?? "png").toLowerCase();
    const path = `${uid}/${crypto.randomUUID()}.${ext}`;
    const up = await supabase.storage
      .from("bug-reports")
      .upload(path, image, { contentType: image.type || undefined });
    if (!up.error) screenshotPath = path;
  }
  const { error } = await supabase.from("bug_reports").insert({
    reporter_id: uid,
    reporter_name: reporterName,
    description: `${input.title.trim()}\n\n${input.description.trim()}`,
    screenshot_path: screenshotPath,
    page_context: input.diagnostics.route ?? null,
    kind: input.kind === "sugestao" ? "sugestao" : "bug",
    source: "plataforma",
  });
  if (error) throw new Error("Não foi possível enviar o report.");
}

/** O report foi criado, mas algum complemento (anexo/diagnóstico) falhou. */
export class PartialProblemError extends Error {
  constructor(
    public reportId: string,
    public failed: string[],
  ) {
    super(`Report enviado, mas não foi possível anexar: ${failed.join(", ")}.`);
  }
}

/* ------------------------------------------------------------------ */
/* Edição / triagem                                                    */
/* ------------------------------------------------------------------ */

export type ProblemPatch = Partial<{
  status: ProblemStatus;
  priority: ProblemPriority;
  area: string;
  assigneeId: string | null;
  resolutionNote: string | null;
}>;

export async function updateProblem(id: string, patch: ProblemPatch): Promise<void> {
  const row: {
    status?: string;
    priority?: string;
    area?: string;
    assignee_id?: string | null;
    resolution_note?: string | null;
  } = {};
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.priority !== undefined) row.priority = patch.priority;
  if (patch.area !== undefined) row.area = patch.area;
  if (patch.assigneeId !== undefined) row.assignee_id = patch.assigneeId;
  if (patch.resolutionNote !== undefined) row.resolution_note = patch.resolutionNote;

  if (legacySchema) {
    // Banco sem a migration da Central: só existe o booleano `resolved`
    // (mesma escrita do painel HypeApp). Resolver/reabrir funciona; o resto
    // da triagem só depois da migration.
    if (patch.status === undefined || Object.keys(row).length > 1) {
      throw new Error("Disponível após a atualização do banco da Central de Problemas.");
    }
    const resolved = FINISHED_STATUSES.has(patch.status);
    const legacy = await supabase
      .from("bug_reports")
      .update({ resolved, resolved_at: resolved ? new Date().toISOString() : null })
      .eq("id", id)
      .select("id");
    if (legacy.error) throw new Error("Não foi possível atualizar o problema.");
    if (!legacy.data?.length) throw new Error("Você não tem permissão para alterar este problema.");
    return;
  }

  const { data, error } = await supabase.from("bug_reports").update(row).eq("id", id).select("id");
  if (error) {
    throw new Error(
      /forbidden/i.test(error.message)
        ? "Você só pode alterar o status de problemas atribuídos a você."
        : "Não foi possível atualizar o problema.",
    );
  }
  // RLS sem permissão não dá erro: só não altera nenhuma linha.
  if (!data?.length) throw new Error("Você não tem permissão para alterar este problema.");
}

export async function deleteProblem(id: string): Promise<void> {
  const { data, error } = await supabase.from("bug_reports").delete().eq("id", id).select("id");
  if (error) throw new Error("Não foi possível excluir o problema.");
  if (!data?.length) throw new Error("Só administradores podem excluir problemas.");
}

/* ------------------------------------------------------------------ */
/* Detalhe: histórico, comentários, anexos, diagnóstico                */
/* ------------------------------------------------------------------ */

export type ProblemEvent = {
  id: string;
  type: "created" | "status" | "priority" | "assignee" | "area" | "edit" | "comment" | "attachment";
  actorName: string;
  data: Record<string, unknown>;
  createdAt: string;
};

export type ProblemComment = {
  id: string;
  authorId: string;
  authorName: string;
  body: string;
  isInternal: boolean;
  createdAt: string;
};

export type ProblemAttachment = {
  id: string;
  commentId: string | null;
  path: string;
  name: string;
  mime: string | null;
  sizeBytes: number | null;
  createdAt: string;
};

export type ProblemDetail = {
  events: ProblemEvent[];
  comments: ProblemComment[];
  attachments: ProblemAttachment[];
  diagnostics: ProblemDiagnostics | null;
};

export async function getProblemDetail(id: string): Promise<ProblemDetail> {
  if (legacySchema) return { events: [], comments: [], attachments: [], diagnostics: null };
  const [ev, cm, at, dg] = await Promise.all([
    supabase
      .from("bug_report_events")
      .select("id, event_type, actor_name, data, created_at")
      .eq("report_id", id)
      .order("created_at", { ascending: true }),
    supabase
      .from("bug_report_comments")
      .select("id, author_id, author_name, body, is_internal, created_at")
      .eq("report_id", id)
      .order("created_at", { ascending: true }),
    supabase
      .from("bug_report_attachments")
      .select("id, comment_id, path, name, mime, size_bytes, created_at")
      .eq("report_id", id)
      .order("created_at", { ascending: true }),
    // Só retorna linha para quem reportou ou gerencia (RLS); senão vazio.
    supabase.from("bug_report_diagnostics").select("data").eq("report_id", id).maybeSingle(),
  ]);
  if (ev.error || cm.error || at.error) throw new Error("Não foi possível carregar o detalhe.");
  return {
    events: (ev.data ?? []).map((e) => ({
      id: e.id,
      type: e.event_type as ProblemEvent["type"],
      actorName: e.actor_name,
      data: (e.data ?? {}) as Record<string, unknown>,
      createdAt: e.created_at,
    })),
    comments: (cm.data ?? []).map((c) => ({
      id: c.id,
      authorId: c.author_id,
      authorName: c.author_name,
      body: c.body,
      isInternal: c.is_internal,
      createdAt: c.created_at,
    })),
    attachments: (at.data ?? []).map((a) => ({
      id: a.id,
      commentId: a.comment_id,
      path: a.path,
      name: a.name,
      mime: a.mime,
      sizeBytes: a.size_bytes,
      createdAt: a.created_at,
    })),
    diagnostics: (dg.data?.data as ProblemDiagnostics | undefined) ?? null,
  };
}

export async function addProblemComment(
  reportId: string,
  body: string,
  isInternal: boolean,
  files: File[],
): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Sessão inválida.");
  const { data, error } = await supabase
    .from("bug_report_comments")
    .insert({
      report_id: reportId,
      author_id: auth.user.id,
      body: body.trim(),
      is_internal: isInternal,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error("Não foi possível enviar o comentário.");
  for (const f of files) await uploadProblemFile(f, reportId, data.id);
}

export async function getProblemFileUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from("bug-reports").createSignedUrl(path, 60 * 60);
  if (error || !data) throw new Error("Arquivo indisponível.");
  return data.signedUrl;
}

export function isImage(mimeOrName: string | null | undefined): boolean {
  if (!mimeOrName) return false;
  return /^image\//.test(mimeOrName) || /\.(png|jpe?g|gif|webp|avif)$/i.test(mimeOrName);
}
