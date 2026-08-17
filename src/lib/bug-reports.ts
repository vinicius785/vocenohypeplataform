import { supabase } from "@/integrations/supabase/client";

export type BugReportKind = "bug" | "sugestao";
export type BugReportScope = "influenciador" | "backoffice";
/** "plataforma" = botão flutuante global "Encontrou um bug?" (ou portal do
 * cliente) — bug do HypeApp enquanto ferramenta. "hypeapp" = formulário
 * dedicado do Projeto HypeApp — bug/sugestão sobre o produto HypeApp em si.
 * São conceitos diferentes e nunca aparecem juntos nas listagens. */
export type BugReportSource = "plataforma" | "hypeapp";

export type BugReport = {
  id: string;
  reporterId: string | null;
  reporterName: string;
  clientLabel: string | null;
  description: string;
  screenshotPath: string | null;
  pageContext: string | null;
  createdAt: string;
  /** Ausente em linhas antigas (do botão flutuante global, anterior a essa
   * distinção) — sempre tratar como "bug" nesse caso. */
  kind: BugReportKind;
  /** Só preenchido pelo formulário dedicado (Projeto HypeApp) — o botão
   * flutuante global não pergunta escopo. */
  scope: BugReportScope | null;
  resolved: boolean;
  resolvedAt: string | null;
  source: BugReportSource;
};

function mapRow(row: {
  id: string;
  reporter_id: string | null;
  reporter_name: string;
  client_label: string | null;
  description: string;
  screenshot_path: string | null;
  page_context: string | null;
  created_at: string;
  kind: string;
  scope: string | null;
  resolved: boolean;
  resolved_at: string | null;
  source: string;
}): BugReport {
  return {
    id: row.id,
    reporterId: row.reporter_id,
    reporterName: row.reporter_name,
    clientLabel: row.client_label,
    description: row.description,
    screenshotPath: row.screenshot_path,
    pageContext: row.page_context,
    createdAt: row.created_at,
    kind: row.kind === "sugestao" ? "sugestao" : "bug",
    scope: row.scope === "influenciador" || row.scope === "backoffice" ? row.scope : null,
    resolved: row.resolved,
    resolvedAt: row.resolved_at,
    source: row.source === "hypeapp" ? "hypeapp" : "plataforma",
  };
}

export async function submitBugReport(input: {
  description: string;
  screenshotFile?: File | null;
  pageContext?: string;
  kind?: BugReportKind;
  scope?: BugReportScope | null;
  source?: BugReportSource;
}): Promise<void> {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) throw authError ?? new Error("Sessão inválida.");

  let screenshotPath: string | null = null;
  if (input.screenshotFile) {
    const ext = input.screenshotFile.name.split(".").pop() ?? "png";
    const path = `${authData.user.id}/${crypto.randomUUID()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from("bug-reports")
      .upload(path, input.screenshotFile, { contentType: input.screenshotFile.type });
    if (uploadError) throw uploadError;
    screenshotPath = path;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", authData.user.id)
    .maybeSingle();

  const { error } = await supabase.from("bug_reports").insert({
    reporter_id: authData.user.id,
    reporter_name: profile?.full_name || authData.user.email || "",
    description: input.description.trim(),
    screenshot_path: screenshotPath,
    page_context: input.pageContext ?? null,
    kind: input.kind ?? "bug",
    scope: input.scope ?? null,
    source: input.source ?? "plataforma",
  });
  if (error) throw new Error(error.message);
}

/** `source` obrigatório — nunca faz sentido listar "todos" (Plataforma e
 * HypeApp são audiências e listas diferentes, ver `BugReportSource`). */
export async function listBugReports(source: BugReportSource): Promise<BugReport[]> {
  const { data, error } = await supabase
    .from("bug_reports")
    .select("*")
    .eq("source", source)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapRow);
}

export async function deleteBugReport(id: string, screenshotPath: string | null): Promise<void> {
  if (screenshotPath) {
    await supabase.storage.from("bug-reports").remove([screenshotPath]);
  }
  const { error } = await supabase.from("bug_reports").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/** Alterna resolvido/reaberto — único ponto de escrita do status, pra não
 * duplicar a lógica de "o que grava `resolved_at`" em cada componente. */
export async function setBugReportResolved(id: string, resolved: boolean): Promise<void> {
  const { error } = await supabase
    .from("bug_reports")
    .update({ resolved, resolved_at: resolved ? new Date().toISOString() : null })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function getBugScreenshotUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from("bug-reports").createSignedUrl(path, 60 * 60);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}
