import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { Project } from "@/lib/projetos";
import type { BugReportKind, BugReportScope } from "@/lib/bug-reports";

/**
 * Link público/externo de Bugs & Sugestões do HypeApp (`/bugs/$token`) —
 * mesmo padrão de `cliente-link.functions.ts`/`inscricao-campanha.functions.ts`:
 * token mora no registro dono (aqui, `Project.bugsPublicToken`), resolvido
 * só no servidor via service-role, nunca confiando em id vindo do cliente.
 * Sempre escopado a `source: "hypeapp"` — nunca mistura com bugs da
 * Plataforma reportados pelo time (ver `bug-reports.ts`).
 */

async function findProjetoByToken(
  token: string,
): Promise<{ projetoId: string; projeto: Project } | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: rows, error } = await supabaseAdmin.from("projetos").select("id, data");
  if (error) throw new Error(error.message);
  for (const row of (rows ?? []) as { id: string; data: Project }[]) {
    if (row.data.bugsPublicToken === token) return { projetoId: row.id, projeto: row.data };
  }
  return null;
}

// Tokens são `crypto.randomUUID().replace(/-/g, "")` (32 hex chars) — mesmo
// formato usado em `Cliente.publicToken`/`Campaign.signupToken`.
const TokenInput = z.object({ token: z.string().min(20).max(64) });

const BugReportPublic = z.object({
  id: z.string(),
  reporterName: z.string(),
  description: z.string(),
  screenshotPath: z.string().nullable(),
  createdAt: z.string(),
  kind: z.string(),
  scope: z.string().nullable(),
  resolved: z.boolean(),
  resolvedAt: z.string().nullable(),
});

/** Público, sem auth — lista os relatos do HypeApp pra quem tem o link. */
export const getPublicBugReports = createServerFn({ method: "GET" })
  .inputValidator((raw: unknown) => TokenInput.parse(raw))
  .handler(async ({ data }): Promise<z.infer<typeof BugReportPublic>[]> => {
    const found = await findProjetoByToken(data.token);
    if (!found) throw new Error("Link não encontrado.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("bug_reports")
      .select(
        "id, reporter_name, description, screenshot_path, created_at, kind, scope, resolved, resolved_at",
      )
      .eq("source", "hypeapp")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r) => ({
      id: r.id,
      reporterName: r.reporter_name ?? "",
      description: r.description,
      screenshotPath: r.screenshot_path,
      createdAt: r.created_at,
      kind: r.kind ?? "bug",
      scope: r.scope,
      resolved: !!r.resolved,
      resolvedAt: r.resolved_at,
    }));
  });

/** Público, sem auth — abre o print anexado (URL assinada, curta duração). */
export const getPublicBugScreenshotUrl = createServerFn({ method: "GET" })
  .inputValidator((raw: unknown) => TokenInput.extend({ path: z.string().min(1) }).parse(raw))
  .handler(async ({ data }): Promise<{ url: string }> => {
    const found = await findProjetoByToken(data.token);
    if (!found) throw new Error("Link não encontrado.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error } = await supabaseAdmin.storage
      .from("bug-reports")
      .createSignedUrl(data.path, 60 * 60);
    if (error || !signed) throw new Error(error?.message ?? "Não foi possível abrir o anexo.");
    return { url: signed.signedUrl };
  });

const SubmitPublicBugInput = TokenInput.extend({
  description: z.string().trim().min(1).max(4000),
  kind: z.enum(["bug", "sugestao"]).default("bug"),
  scope: z.enum(["influenciador", "backoffice"]).nullable().default(null),
  reporterName: z.string().trim().max(200).optional(),
  screenshotDataUrl: z.string().max(8_000_000).optional(),
});

/** Público, sem auth — reporta um bug/sugestão do HypeApp direto pelo link. */
export const submitPublicBugReport = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => SubmitPublicBugInput.parse(raw))
  .handler(async ({ data }) => {
    const found = await findProjetoByToken(data.token);
    if (!found) throw new Error("Link não encontrado.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let screenshotPath: string | null = null;
    if (data.screenshotDataUrl) {
      const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(data.screenshotDataUrl);
      if (match) {
        const contentType = match[1];
        const ext = contentType.split("/")[1] ?? "png";
        const buffer = Buffer.from(match[2], "base64");
        const path = `public/${data.token}/${crypto.randomUUID()}.${ext}`;
        const { error: uploadError } = await supabaseAdmin.storage
          .from("bug-reports")
          .upload(path, buffer, { contentType });
        if (uploadError) throw new Error(uploadError.message);
        screenshotPath = path;
      }
    }

    const { error } = await supabaseAdmin.from("bug_reports").insert({
      reporter_id: null,
      reporter_name: data.reporterName?.trim() || "",
      client_label: "Link externo",
      description: data.description.trim(),
      screenshot_path: screenshotPath,
      kind: data.kind as BugReportKind,
      scope: data.scope as BugReportScope | null,
      source: "hypeapp",
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const SetResolvedInput = TokenInput.extend({
  id: z.string().min(1),
  resolved: z.boolean(),
});

/** Público, sem auth — marcar/desmarcar como resolvido pelo link externo
 * (posse do link = autorização, mesmo modelo dos outros links públicos
 * desta base, ex. `respondCampanhaInflu`). */
export const setPublicBugResolved = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => SetResolvedInput.parse(raw))
  .handler(async ({ data }) => {
    const found = await findProjetoByToken(data.token);
    if (!found) throw new Error("Link não encontrado.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("bug_reports")
      .update({
        resolved: data.resolved,
        resolved_at: data.resolved ? new Date().toISOString() : null,
      })
      .eq("id", data.id)
      .eq("source", "hypeapp");
    if (error) throw new Error(error.message);
    return { ok: true };
  });
