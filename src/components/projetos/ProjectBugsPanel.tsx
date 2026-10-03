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
  Link as LinkIcon,
  ChevronDown,
  ClipboardList,
  FileText,
  Plus,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { useConfirm } from "@/hooks/use-confirm";
import type { Project } from "@/lib/projetos";
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
 *
 * "Copiar link" gera (sob demanda) e copia um link público/externo
 * (`/bugs/{token}`, token em `Project.bugsPublicToken`) — mesmo padrão dos
 * links de portal do cliente / inscrição de campanha: quem tem o link vê e
 * resolve os relatos sem precisar de login.
 */
export function ProjectBugsPanel({
  project,
  update,
}: {
  project?: Project;
  update?: (p: Partial<Project>) => void;
} = {}) {
  const [reports, setReports] = useState<BugReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  const [kind, setKind] = useState<BugReportKind>("bug");
  const [scope, setScope] = useState<BugReportScope>("backoffice");
  const [description, setDescription] = useState("");
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  // Confirmação visual de que o envio deu certo — sem isso, depois de
  // clicar "Enviar" o formulário só esvaziava silenciosamente, sem
  // nenhum sinal de que o relato realmente foi registrado.
  const fileRef = useRef<HTMLInputElement>(null);

  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const { confirm, confirmDialog } = useConfirm();

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      setReports(await listBugReports("hypeapp"));
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
      await submitBugReport({
        description,
        screenshotFile: screenshot,
        kind,
        scope,
        source: "hypeapp",
      });
      setDescription("");
      setScreenshot(null);
      if (fileRef.current) fileRef.current.value = "";
      await load();
      toast.success(kind === "bug" ? "Bug enviado" : "Sugestão enviada");
      setFormOpen(false);
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
    const ok = await confirm(
      "Você está prestes a remover este relato.\nEsta ação não pode ser desfeita.",
      {
        title: "Remover relato?",
        confirmLabel: "Remover",
        destructive: true,
      },
    );
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

  /** `withList: false` gera o link só com o formulário (`?view=form`) —
   * pra compartilhar com quem só deve reportar, sem ver os relatos de
   * todo mundo. `withList: true` é o link completo de sempre. */
  const copyPublicLink = async (withList: boolean) => {
    if (!project || !update) return;
    const token = project.bugsPublicToken ?? crypto.randomUUID().replace(/-/g, "");
    if (!project.bugsPublicToken) update({ bugsPublicToken: token });
    const url = `${window.location.origin}/bugs/${token}${withList ? "" : "?view=form"}`;
    await navigator.clipboard.writeText(url);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  const abertos = reports.filter((r) => !r.resolved);
  const resolvidos = reports.filter((r) => r.resolved);

  return (
    <div className="space-y-5">
      {confirmDialog}
      {/* A seção já tem título (cabeçalho do Projeto): aqui só o resumo e as
       * ações — "Reportar problema" abre o formulário sob demanda. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-text-secondary">
          {loading
            ? "Carregando..."
            : reports.length === 0
              ? "Nenhum relato ainda."
              : `${abertos.length} em aberto · ${resolvidos.length} ${resolvidos.length === 1 ? "resolvido" : "resolvidos"}`}
        </p>
        <div className="flex items-center gap-2">
          {project && update && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm">
                  <LinkIcon className="h-3.5 w-3.5" /> {linkCopied ? "Copiado!" : "Copiar link"}
                  <ChevronDown className="h-3 w-3 opacity-70" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuItem onClick={() => void copyPublicLink(false)} className="gap-2">
                  <FileText className="h-3.5 w-3.5 shrink-0" />
                  <span>
                    <span className="block">Só o formulário</span>
                    <span className="block text-[11px] text-text-secondary">
                      Pra quem só deve reportar, sem ver os relatos de todo mundo.
                    </span>
                  </span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => void copyPublicLink(true)} className="gap-2">
                  <ClipboardList className="h-3.5 w-3.5 shrink-0" />
                  <span>
                    <span className="block">Formulário + lista de bugs</span>
                    <span className="block text-[11px] text-text-secondary">
                      Mostra também os relatos já enviados e o status de cada um.
                    </span>
                  </span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {!formOpen && (
            <Button variant="outline" size="sm" onClick={() => setFormOpen(true)}>
              <Plus className="h-3.5 w-3.5" /> Reportar problema
            </Button>
          )}
        </div>
      </div>

      {formOpen && (
        <form onSubmit={submit} className="max-w-2xl space-y-4 border-y border-border/60 py-5">
          <div className="flex flex-wrap gap-x-6 gap-y-3">
            <div className="space-y-1.5">
              <span className="text-sm font-medium text-foreground">Tipo</span>
              <div>
                <SegmentedControl
                  aria-label="Tipo do relato"
                  size="sm"
                  value={kind}
                  onChange={setKind}
                  options={KIND_OPTS.map((o) => ({ value: o.value, label: o.label }))}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <span className="text-sm font-medium text-foreground">Onde</span>
              <div>
                <SegmentedControl
                  aria-label="Onde aconteceu"
                  size="sm"
                  value={scope}
                  onChange={setScope}
                  options={SCOPE_OPTS.map((o) => ({ value: o.value, label: o.label }))}
                />
              </div>
            </div>
          </div>

          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-foreground">Descrição</span>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              autoFocus
              placeholder={
                kind === "bug"
                  ? "O que aconteceu? Quais os passos pra reproduzir?"
                  : "Qual a ideia? Por que ajudaria?"
              }
              className="resize-none"
              maxLength={2000}
              required
            />
          </label>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              {screenshot ? (
                <div className="inline-flex items-center gap-2 text-sm text-foreground">
                  <Paperclip className="h-3.5 w-3.5 text-text-secondary" />
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
                <label className="inline-flex cursor-pointer items-center gap-1.5 text-sm text-text-secondary hover:text-foreground">
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
            <div className="flex items-center gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setFormOpen(false)}>
                Cancelar
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                disabled={submitting || !description.trim()}
              >
                {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Enviar
              </Button>
            </div>
          </div>
        </form>
      )}

      {error && (
        <p role="alert" className="flex items-center gap-2 text-sm text-destructive">
          <X className="h-3.5 w-3.5 shrink-0" /> {error}
        </p>
      )}

      {!loading && reports.length > 0 && (
        <div className="space-y-5">
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
  const PAGE_SIZE = 8;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  if (items.length === 0) return null;
  const visibleItems = items.slice(0, visibleCount);
  const remaining = items.length - visibleItems.length;

  return (
    <div>
      <p className="mb-1 text-xs font-medium text-text-secondary">
        {title} ({items.length})
      </p>
      <ul className="divide-y divide-border/60">
        {visibleItems.map((r) => (
          <li key={r.id} className={`py-3 ${muted ? "opacity-60" : ""}`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-text-secondary">
                <span
                  className={`inline-flex items-center gap-1 font-medium ${
                    r.kind === "bug" ? "text-danger" : "text-foreground"
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
                  <span>{r.scope === "influenciador" ? "Influenciador" : "Backoffice"}</span>
                )}
                <span>
                  {r.reporterName || r.clientLabel || "—"} ·{" "}
                  {new Date(r.createdAt).toLocaleString("pt-BR", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </p>
              <div className="flex shrink-0 items-center gap-1">
                {isAdmin && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onToggleResolved(r)}
                    disabled={busyId === r.id}
                  >
                    <Check className="h-3 w-3" />
                    {r.resolved ? "Reabrir" : "Marcar como resolvido"}
                  </Button>
                )}
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => onDelete(r)}
                    className="rounded p-1 text-text-secondary hover:bg-muted hover:text-destructive"
                    aria-label="Remover"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
            <p className="mt-1.5 whitespace-pre-wrap text-sm text-foreground">{r.description}</p>
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
      {remaining > 0 && (
        <button
          type="button"
          onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
          className="mt-2 text-xs font-medium text-text-brand hover:underline"
        >
          Carregar mais ({remaining})
        </button>
      )}
    </div>
  );
}
