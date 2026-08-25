import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Bug, Lightbulb, Check, ImageIcon, Loader2, Paperclip, X } from "lucide-react";
import {
  getPublicBugReports,
  getPublicBugScreenshotUrl,
  submitPublicBugReport,
  setPublicBugResolved,
} from "@/lib/bugs-link.functions";
import { fetchWorkspace } from "@/lib/workspace-store";

type BugReportsData = Awaited<ReturnType<typeof getPublicBugReports>>;

export const Route = createFileRoute("/bugs/$token")({
  component: PublicBugsPage,
  validateSearch: (s: Record<string, unknown>): { view?: "form" } => {
    return s.view === "form" ? { view: "form" } : {};
  },
  loader: async ({ params }) => {
    const [reports, ws] = await Promise.all([
      getPublicBugReports({ data: { token: params.token } }).catch(() => null),
      fetchWorkspace().catch(() => ({ nome: "Você no Hype", logo: "" })),
    ]);
    return { reports: reports as BugReportsData | null, ws };
  },
  head: () => ({
    meta: [
      { title: "Bugs & Sugestões · HypeApp" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

const KIND_OPTS: { value: "bug" | "sugestao"; label: string; icon: typeof Bug }[] = [
  { value: "bug", label: "Bug", icon: Bug },
  { value: "sugestao", label: "Sugestão", icon: Lightbulb },
];
const SCOPE_OPTS: { value: "influenciador" | "backoffice"; label: string }[] = [
  { value: "influenciador", label: "Visão do influenciador" },
  { value: "backoffice", label: "Visão do backoffice" },
];

function Header({ logo, nome }: { logo?: string; nome: string }) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-2.5 border-b border-border bg-background px-5">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-md bg-foreground text-background">
        {logo ? (
          <img src={logo} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="text-[11px] font-bold">{nome.charAt(0).toUpperCase()}</span>
        )}
      </div>
      <span className="text-sm font-semibold text-foreground">{nome}</span>
    </header>
  );
}

function PublicBugsPage() {
  const { token } = Route.useParams();
  const { view } = Route.useSearch();
  const formOnly = view === "form";
  const { reports: initialReports, ws } = Route.useLoaderData();
  const getReportsFn = useServerFn(getPublicBugReports);
  const getUrlFn = useServerFn(getPublicBugScreenshotUrl);
  const submitFn = useServerFn(submitPublicBugReport);
  const setResolvedFn = useServerFn(setPublicBugResolved);

  const [reports, setReports] = useState<BugReportsData | null>(initialReports);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const [kind, setKind] = useState<"bug" | "sugestao">("bug");
  const [scope, setScope] = useState<"influenciador" | "backoffice">("backoffice");
  const [reporterName, setReporterName] = useState("");
  const [description, setDescription] = useState("");
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!reports) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6 text-center">
        <p className="text-sm text-muted-foreground">
          Link não encontrado ou expirado. Confira com quem enviou o link.
        </p>
      </div>
    );
  }

  const reload = async () => {
    try {
      setReports(await getReportsFn({ data: { token } }));
    } catch {
      // mantém a lista atual em caso de falha de rede
    }
  };

  const fileToDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim() || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const screenshotDataUrl = screenshot ? await fileToDataUrl(screenshot) : undefined;
      await submitFn({
        data: { token, description, kind, scope, reporterName, screenshotDataUrl },
      });
      setDescription("");
      setScreenshot(null);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao enviar.");
    } finally {
      setSubmitting(false);
    }
  };

  const toggleResolved = async (r: BugReportsData[number]) => {
    setBusyId(r.id);
    try {
      await setResolvedFn({ data: { token, id: r.id, resolved: !r.resolved } });
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao atualizar.");
    } finally {
      setBusyId(null);
    }
  };

  const openScreenshot = async (r: BugReportsData[number]) => {
    if (!r.screenshotPath) return;
    try {
      const { url } = await getUrlFn({ data: { token, path: r.screenshotPath } });
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao abrir anexo.");
    }
  };

  const abertos = reports.filter((r) => !r.resolved);
  const resolvidos = reports.filter((r) => r.resolved);

  return (
    <div className="min-h-screen bg-background">
      <Header logo={ws.logo} nome={ws.nome} />
      <main className="mx-auto w-full max-w-2xl space-y-6 px-5 py-8">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Bugs & Sugestões — HypeApp</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {formOnly
              ? "Relate um problema ou uma ideia."
              : "Relate um problema ou uma ideia. Qualquer pessoa com este link pode ver os relatos e marcar como resolvido."}
          </p>
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
            <span className="text-xs font-medium text-muted-foreground">Seu nome (opcional)</span>
            <input
              value={reporterName}
              onChange={(e) => setReporterName(e.target.value)}
              maxLength={200}
              className="w-full rounded-md border border-border bg-background px-2.5 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </label>

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
                    onClick={() => setScreenshot(null)}
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
                    type="file"
                    accept="image/*"
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

        {!formOnly &&
          (reports.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhum relato ainda.</p>
          ) : (
            <div className="space-y-4">
              <ReportList
                title="Em aberto"
                items={abertos}
                busyId={busyId}
                onToggleResolved={toggleResolved}
                onOpenScreenshot={openScreenshot}
              />
              {resolvidos.length > 0 && (
                <ReportList
                  title="Resolvidos"
                  items={resolvidos}
                  busyId={busyId}
                  onToggleResolved={toggleResolved}
                  onOpenScreenshot={openScreenshot}
                  muted
                />
              )}
            </div>
          ))}
      </main>
    </div>
  );
}

function ReportList({
  title,
  items,
  busyId,
  onToggleResolved,
  onOpenScreenshot,
  muted,
}: {
  title: string;
  items: BugReportsData;
  busyId: string | null;
  onToggleResolved: (r: BugReportsData[number]) => void;
  onOpenScreenshot: (r: BugReportsData[number]) => void;
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
                <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[10px] font-medium text-foreground">
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
                  {r.reporterName || "—"} ·{" "}
                  {new Date(r.createdAt).toLocaleString("pt-BR", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
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
