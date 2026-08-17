import { useEffect, useRef, useState } from "react";
import {
  Bug,
  Lightbulb,
  Paperclip,
  Check,
  X,
  Trash2,
  ImageIcon,
  Loader2,
  ExternalLink,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useConfirm } from "@/hooks/use-confirm";
import {
  submitBugReport,
  listBugReports,
  deleteBugReport,
  setBugReportResolved,
  getBugScreenshotUrl,
  type BugReport,
  type BugReportKind,
  type BugReportScope,
} from "@/lib/bug-reports";

const KIND_OPTS: { value: BugReportKind; label: string; icon: typeof Bug }[] = [
  { value: "bug", label: "Bug", icon: Bug },
  { value: "sugestao", label: "Sugestão", icon: Lightbulb },
];

const SCOPE_OPTS: { value: BugReportScope; label: string }[] = [
  { value: "influenciador", label: "Visão do influenciador" },
  { value: "backoffice", label: "Visão do backoffice" },
];

/**
 * Board de bugs/sugestões do próprio HypeApp — vive dentro do Projeto
 * "HypeApp" (Projetos), achado por nome (mesmo padrão de `isMarketingProject`
 * em projeto.$id.tsx). Reaproveita a tabela/bucket `bug_reports` já usados
 * pelo botão flutuante global "Encontrou um bug?" — só adiciona tipo,
 * escopo e status de resolução por cima, sem criar uma tabela paralela.
 */
export function ProjectBugsPanel({ showOpenExternal }: { showOpenExternal?: boolean } = {}) {
  const [reports, setReports] = useState<BugReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);

  const [kind, setKind] = useState<BugReportKind>("bug");
  const [scope, setScope] = useState<BugReportScope>("backoffice");
  const [description, setDescription] = useState("");
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const { confirm, confirmDialog } = useConfirm();

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      setReports(await listBugReports());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar relatos.");
    }
    setLoading(false);
  };

  useEffect(() => {
    void load();
    void (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { data: ok } = await supabase.rpc("is_admin", { _user_id: u.user.id });
      setIsAdmin(Boolean(ok));
    })();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim() || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      await submitBugReport({ description, screenshotFile: screenshot, kind, scope });
      setDescription("");
      setScreenshot(null);
      if (fileRef.current) fileRef.current.value = "";
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao enviar.");
    } finally {
      setSubmitting(false);
    }
  };

  const toggleResolved = async (r: BugReport) => {
    setBusyId(r.id);
    try {
      await setBugReportResolved(r.id, !r.resolved);
      setReports((prev) =>
        prev.map((x) =>
          x.id === r.id
            ? {
                ...x,
                resolved: !r.resolved,
                resolvedAt: !r.resolved ? new Date().toISOString() : null,
              }
            : x,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao atualizar.");
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (r: BugReport) => {
    const ok = await confirm("Remover este relato?");
    if (!ok) return;
    try {
      await deleteBugReport(r.id, r.screenshotPath);
      setReports((prev) => prev.filter((x) => x.id !== r.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao remover.");
    }
  };

  const openScreenshot = async (r: BugReport) => {
    if (!r.screenshotPath) return;
    if (previews[r.id]) {
      window.open(previews[r.id], "_blank", "noopener,noreferrer");
      return;
    }
    try {
      const url = await getBugScreenshotUrl(r.screenshotPath);
      setPreviews((prev) => ({ ...prev, [r.id]: url }));
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar print.");
    }
  };

  const abertos = reports.filter((r) => !r.resolved);
  const resolvidos = reports.filter((r) => r.resolved);

  return (
    <div className="space-y-6">
      {confirmDialog}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Bugs & Sugestões</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Reporte problemas ou ideias sobre o HypeApp — visíveis pro time todo, com status de
            resolução.
          </p>
        </div>
        {showOpenExternal && (
          <a
            href="/bugs"
            target="_blank"
            rel="noreferrer"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
          >
            <ExternalLink className="h-3.5 w-3.5" /> Abrir link
          </a>
        )}
      </div>

      <form
        onSubmit={submit}
        className="space-y-3 rounded-2xl border border-border bg-muted/40 p-4"
      >
        <div className="flex flex-wrap gap-4">
          <div className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">Tipo</span>
            <div className="flex gap-1.5">
              {KIND_OPTS.map((opt) => {
                const Icon = opt.icon;
                const active = kind === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setKind(opt.value)}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                      active
                        ? "border-foreground bg-foreground text-background"
                        : "border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" /> {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">Onde</span>
            <div className="flex gap-1.5">
              {SCOPE_OPTS.map((opt) => {
                const active = scope === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setScope(opt.value)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                      active
                        ? "border-foreground bg-foreground text-background"
                        : "border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <label className="block space-y-1">
          <span className="text-xs font-medium text-muted-foreground">Descrição</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder={
              kind === "bug"
                ? "O que aconteceu? Quais os passos pra reproduzir?"
                : "Qual a ideia? Por que ajudaria?"
            }
            className="w-full resize-none rounded-md border border-border bg-background px-2.5 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            maxLength={2000}
            required
          />
        </label>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            {screenshot ? (
              <div className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-foreground">
                <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
                {screenshot.name}
                <button
                  type="button"
                  onClick={() => {
                    setScreenshot(null);
                    if (fileRef.current) fileRef.current.value = "";
                  }}
                  aria-label="Remover anexo"
                  className="rounded p-0.5 hover:bg-muted"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ) : (
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-dashed border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:border-foreground hover:text-foreground">
                <Paperclip className="h-3.5 w-3.5" />
                Anexar (opcional)
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*,.pdf"
                  className="hidden"
                  onChange={(e) => setScreenshot(e.target.files?.[0] ?? null)}
                />
              </label>
            )}
          </div>
          <button
            type="submit"
            disabled={submitting || !description.trim()}
            className="inline-flex items-center gap-1.5 rounded-full border-2 border-foreground bg-foreground px-4 py-1.5 text-xs font-medium text-background transition-colors duration-200 hover:bg-transparent hover:text-foreground disabled:opacity-50"
          >
            {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Enviar
          </button>
        </div>
      </form>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-border bg-muted px-3 py-2 text-xs text-foreground">
          <X className="h-3.5 w-3.5 shrink-0" /> {error}
        </div>
      )}

      {loading ? (
        <p className="text-xs text-muted-foreground">Carregando...</p>
      ) : reports.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhum relato ainda.</p>
      ) : (
        <div className="space-y-4">
          <ReportList
            title="Em aberto"
            items={abertos}
            isAdmin={isAdmin}
            busyId={busyId}
            onToggleResolved={toggleResolved}
            onDelete={handleDelete}
            onOpenScreenshot={openScreenshot}
          />
          {resolvidos.length > 0 && (
            <ReportList
              title="Resolvidos"
              items={resolvidos}
              isAdmin={isAdmin}
              busyId={busyId}
              onToggleResolved={toggleResolved}
              onDelete={handleDelete}
              onOpenScreenshot={openScreenshot}
              muted
            />
          )}
        </div>
      )}
    </div>
  );
}

function ReportList({
  title,
  items,
  isAdmin,
  busyId,
  onToggleResolved,
  onDelete,
  onOpenScreenshot,
  muted,
}: {
  title: string;
  items: BugReport[];
  isAdmin: boolean;
  busyId: string | null;
  onToggleResolved: (r: BugReport) => void;
  onDelete: (r: BugReport) => void;
  onOpenScreenshot: (r: BugReport) => void;
  muted?: boolean;
}) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title} ({items.length})
      </p>
      <ul className="space-y-2">
        {items.map((r) => (
          <li
            key={r.id}
            className={`rounded-xl border border-border p-3 ${muted ? "opacity-60" : ""}`}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <span
                  className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                    r.kind === "bug"
                      ? "border-border text-foreground"
                      : "border-border text-foreground"
                  }`}
                >
                  {r.kind === "bug" ? (
                    <Bug className="h-3 w-3" />
                  ) : (
                    <Lightbulb className="h-3 w-3" />
                  )}
                  {r.kind === "bug" ? "Bug" : "Sugestão"}
                </span>
                {r.scope && (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                    {r.scope === "influenciador" ? "Influenciador" : "Backoffice"}
                  </span>
                )}
                <span className="text-[11px] text-muted-foreground">
                  {r.reporterName || r.clientLabel || "—"} ·{" "}
                  {new Date(r.createdAt).toLocaleString("pt-BR", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => onToggleResolved(r)}
                    disabled={busyId === r.id}
                    className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors disabled:opacity-50 ${
                      r.resolved
                        ? "border-border text-muted-foreground hover:text-foreground"
                        : "border-foreground text-foreground hover:bg-muted"
                    }`}
                  >
                    <Check className="h-3 w-3" />
                    {r.resolved ? "Reabrir" : "Marcar como resolvido"}
                  </button>
                )}
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => onDelete(r)}
                    className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
                    aria-label="Remover"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">{r.description}</p>
            {r.screenshotPath && (
              <button
                type="button"
                onClick={() => onOpenScreenshot(r)}
                className="mt-1.5 inline-flex items-center gap-1 text-xs text-foreground underline underline-offset-2"
              >
                <ImageIcon className="h-3.5 w-3.5" /> Ver anexo
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
