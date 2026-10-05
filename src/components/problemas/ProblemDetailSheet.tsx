import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Archive,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleDot,
  FileText,
  Flag,
  Loader2,
  Lock,
  MoreHorizontal,
  Paperclip,
  RotateCcw,
  Send,
  Trash2,
  User,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useConfirm } from "@/hooks/use-confirm";
import { TASK_CHIP, TaskOptionPicker } from "@/components/tasks/task-ui";
import { loadMembers, type ChatMember } from "@/lib/chat-store";
import {
  addProblemComment,
  deleteProblem,
  FINISHED_STATUSES,
  getProblemDetail,
  getProblemFileUrl,
  isImage,
  PROBLEM_AREAS,
  PROBLEM_KIND_LABEL,
  PROBLEM_PRIORITIES,
  PROBLEM_PRIORITY_LABEL,
  PROBLEM_STATUS_LABEL,
  PROBLEM_STATUS_OPTIONS,
  updateProblem,
  type Problem,
  type ProblemAttachment,
  type ProblemDetail,
  type ProblemEvent,
  type ProblemPatch,
  type ProblemPriority,
  type ProblemStatus,
} from "@/lib/problems";
import {
  formatDateTime,
  PROBLEM_PRIORITY_TONE,
  ProblemKindIcon,
  ProblemPriorityFlag,
  ProblemStatusBadge,
  ProblemStatusIcon,
} from "./problem-ui";

type Props = {
  problem: Problem | null;
  meId: string | null;
  canManage: boolean;
  isAdmin: boolean;
  /** Banco ainda sem a migration da Central: só resolver/reabrir. */
  legacy?: boolean;
  onClose: () => void;
  /** Aplica a mudança na lista/indicadores na hora (antes do recarregamento). */
  onPatched: (id: string, patch: Partial<Problem>) => void;
  onDeleted: (id: string) => void;
  onChanged: () => void;
};

const initials = (name: string) =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("") || "?";

function Avatar({ name, photo }: { name: string; photo?: string }) {
  return photo ? (
    <img src={photo} alt="" className="h-7 w-7 shrink-0 rounded-full object-cover" />
  ) : (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground">
      {initials(name)}
    </span>
  );
}

/** Destaca "@Nome" de membros conhecidos (mesma ideia das tarefas). */
function renderMentions(text: string, members: ChatMember[]): ReactNode {
  const names = members.map((m) => m.name).sort((a, b) => b.length - a.length);
  const out: ReactNode[] = [];
  let i = 0;
  let buf = "";
  while (i < text.length) {
    if (text[i] === "@") {
      const hit = names.find((n) => text.startsWith(n, i + 1));
      if (hit) {
        if (buf) out.push(buf);
        buf = "";
        out.push(
          <span key={i} className="font-medium text-text-brand">
            @{hit}
          </span>,
        );
        i += hit.length + 1;
        continue;
      }
    }
    buf += text[i];
    i += 1;
  }
  if (buf) out.push(buf);
  return out;
}

/** Frase do histórico — mudanças relevantes, com "de → para" quando ajuda. */
function eventText(e: ProblemEvent): ReactNode {
  const d = e.data as Record<string, unknown>;
  const fromTo = (a?: string, b?: string) =>
    a && b ? (
      <>
        {" "}
        <span className="text-foreground">{a}</span> → <span className="text-foreground">{b}</span>
      </>
    ) : null;
  switch (e.type) {
    case "created":
      return "criou este problema";
    case "status": {
      const from = d.from as ProblemStatus | undefined;
      const to = d.to as ProblemStatus | undefined;
      if (to === "resolvido") return "marcou como resolvido";
      if (to === "fechado") return "arquivou o problema";
      if (from && FINISHED_STATUSES.has(from)) return "reabriu o problema";
      return (
        <>
          alterou o status
          {fromTo(from && PROBLEM_STATUS_LABEL[from], to && PROBLEM_STATUS_LABEL[to])}
        </>
      );
    }
    case "priority":
      return (
        <>
          alterou a prioridade
          {fromTo(
            PROBLEM_PRIORITY_LABEL[d.from as ProblemPriority],
            PROBLEM_PRIORITY_LABEL[d.to as ProblemPriority],
          )}
        </>
      );
    case "assignee":
      return d.to ? (
        <>
          atribuiu o problema para <span className="text-foreground">{String(d.to)}</span>
        </>
      ) : (
        "removeu o responsável"
      );
    case "area":
      return (
        <>
          alterou a área
          {fromTo(d.from ? String(d.from) : "—", d.to ? String(d.to) : "—")}
        </>
      );
    case "edit":
      return "editou o report";
    case "comment":
      return "comentou";
    case "attachment":
      return `anexou ${typeof d.name === "string" ? d.name : "um arquivo"}`;
  }
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </h3>
  );
}

function AttachmentList({
  items,
  urls,
}: {
  items: { key: string; name: string; path: string; mime: string | null }[];
  urls: Record<string, string>;
}) {
  if (items.length === 0) return null;
  const images = items.filter((a) => isImage(a.mime ?? a.name));
  const others = items.filter((a) => !isImage(a.mime ?? a.name));
  return (
    <div className="space-y-2">
      {images.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {images.map((a) => (
            <a
              key={a.key}
              href={urls[a.path]}
              target="_blank"
              rel="noopener noreferrer"
              title={a.name}
              className="group relative block aspect-video overflow-hidden rounded-md border border-border bg-muted"
            >
              {urls[a.path] ? (
                <img
                  src={urls[a.path]}
                  alt={a.name}
                  className="h-full w-full object-cover transition-transform group-hover:scale-[1.02]"
                />
              ) : (
                <span className="flex h-full items-center justify-center">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </span>
              )}
            </a>
          ))}
        </div>
      )}
      {others.map((a) => (
        <a
          key={a.key}
          href={urls[a.path]}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-xs hover:bg-muted/50"
        >
          <FileText aria-hidden className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate">{a.name}</span>
        </a>
      ))}
    </div>
  );
}

/**
 * Detalhe do problema — painel lateral contínuo:
 *   header [tipo .......... ⋯  X]
 *   título · reportado por / data
 *   [Status ▼] [✓ Marcar como resolvido | ↺ Reabrir]
 *   propriedades (prioridade, área, responsável, reportado por, data)
 *   descrição → anexos → histórico → comentários (composer fixo embaixo).
 * Controles só aparecem para quem pode usá-los; o banco aplica as mesmas
 * regras (RLS + trigger), e qualquer recusa vira mensagem de erro clara.
 */
export function ProblemDetailSheet({ problem, ...rest }: Props) {
  return (
    <Sheet open={!!problem} onOpenChange={(o) => !o && rest.onClose()}>
      <SheetContent
        side="right"
        hideClose
        className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-[640px]"
      >
        {problem && <DetailBody key={problem.id} problem={problem} {...rest} />}
      </SheetContent>
    </Sheet>
  );
}

function PropRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="flex min-h-8 items-center text-xs text-muted-foreground">{label}</dt>
      <dd className="flex min-h-8 min-w-0 items-center text-sm text-foreground">{children}</dd>
    </>
  );
}

const ICON_BTN =
  "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand";

function DetailBody({
  problem,
  meId,
  canManage,
  isAdmin,
  legacy,
  onPatched,
  onDeleted,
  onChanged,
}: Props & { problem: Problem }) {
  const [detail, setDetail] = useState<ProblemDetail | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState(problem.resolutionNote ?? "");
  const members = useMemo(() => loadMembers(), []);
  const meName = useMemo(
    () => (meId ? (members.find((m) => m.id === meId)?.name ?? null) : null),
    [members, meId],
  );
  const { confirm, confirmDialog } = useConfirm();

  const isAssignee = !!meId && problem.assigneeId === meId;
  // Banco legado só permite resolver/reabrir (coluna `resolved`, admin).
  const canChangeStatus = legacy ? isAdmin : canManage || isAssignee;
  const canTriage = canManage && !legacy;
  const finished = FINISHED_STATUSES.has(problem.status);

  const reload = useCallback(async () => {
    try {
      const d = await getProblemDetail(problem.id);
      setDetail(d);
      setLoadError(false);
      const paths = [
        ...d.attachments.map((a) => a.path),
        ...(problem.legacyScreenshotPath ? [problem.legacyScreenshotPath] : []),
      ];
      const entries = await Promise.all(
        paths.map(async (p) => {
          try {
            return [p, await getProblemFileUrl(p)] as const;
          } catch {
            return [p, ""] as const;
          }
        }),
      );
      setUrls(Object.fromEntries(entries));
    } catch {
      setLoadError(true);
    }
  }, [problem.id, problem.legacyScreenshotPath]);

  useEffect(() => {
    void reload();
  }, [reload]);

  /** Uma escrita: aplica na lista/indicadores na hora, salva, registra
   * (o histórico é gravado pelo banco) e recarrega; se falhar, avisa e
   * recarrega do banco (desfaz o otimista). */
  const apply = async (
    key: string,
    patch: ProblemPatch,
    local: Partial<Problem>,
    success: string,
    errorMsg: string,
  ) => {
    setBusy(key);
    onPatched(problem.id, local);
    try {
      await updateProblem(problem.id, patch);
      toast.success(success);
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : errorMsg);
    } finally {
      setBusy(null);
      onChanged();
    }
  };

  const setStatus = (s: ProblemStatus) => {
    if (s === problem.status) return;
    const nowFinished = FINISHED_STATUSES.has(s);
    const reopening = FINISHED_STATUSES.has(problem.status) && !nowFinished;
    void apply(
      s === "resolvido" ? "resolve" : reopening ? "reopen" : "status",
      { status: s },
      {
        status: s,
        resolvedAt: nowFinished ? new Date().toISOString() : null,
        resolvedByName: nowFinished ? meName : null,
        updatedAt: new Date().toISOString(),
      },
      s === "resolvido"
        ? "Problema marcado como resolvido."
        : reopening
          ? "Problema reaberto."
          : s === "fechado"
            ? "Problema arquivado."
            : `Status alterado para ${PROBLEM_STATUS_LABEL[s]}.`,
      s === "resolvido"
        ? "Não foi possível resolver o problema."
        : "Não foi possível alterar o status.",
    );
  };

  const setPriority = (p: ProblemPriority) =>
    p !== problem.priority &&
    void apply(
      "priority",
      { priority: p },
      { priority: p },
      `Prioridade alterada para ${PROBLEM_PRIORITY_LABEL[p]}.`,
      "Não foi possível alterar a prioridade.",
    );

  const setArea = (a: string) =>
    a !== problem.area &&
    void apply(
      "area",
      { area: a },
      { area: a },
      "Área atualizada.",
      "Não foi possível alterar a área.",
    );

  const setAssignee = (id: string) => {
    if (id === (problem.assigneeId ?? "")) return;
    const name = members.find((m) => m.id === id)?.name ?? null;
    void apply(
      "assignee",
      { assigneeId: id || null },
      { assigneeId: id || null, assigneeName: id ? name : null },
      id ? `Atribuído a ${name ?? "responsável"}.` : "Responsável removido.",
      "Não foi possível atribuir o responsável.",
    );
  };

  const saveNote = async () => {
    await apply(
      "note",
      { resolutionNote: noteDraft.trim() || null },
      { resolutionNote: noteDraft.trim() || null },
      "Nota de resolução salva.",
      "Não foi possível salvar a nota.",
    );
    setNoteOpen(false);
  };

  const remove = async () => {
    if (!(await confirm(`Excluir "${problem.title}"? Essa ação não pode ser desfeita.`))) return;
    setBusy("delete");
    try {
      await deleteProblem(problem.id);
      toast.success("Problema excluído.");
      onDeleted(problem.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível excluir.");
    } finally {
      setBusy(null);
    }
  };

  const reportAttachments = (detail?.attachments ?? []).filter((a) => !a.commentId);
  const attachmentItems = [
    ...(problem.legacyScreenshotPath
      ? [
          {
            key: "legacy",
            name: "captura.png",
            path: problem.legacyScreenshotPath,
            mime: "image/png",
          },
        ]
      : []),
    ...reportAttachments.map((a) => ({ key: a.id, name: a.name, path: a.path, mime: a.mime })),
  ];

  const statusOptions = PROBLEM_STATUS_OPTIONS.filter(
    // Banco legado só conhece resolvido/não resolvido.
    (s) => !legacy || s === "novo" || s === "resolvido",
  );
  const hasMenu = canChangeStatus || canTriage || isAdmin;
  const assigneeLabel = problem.assigneeName ?? "Sem responsável";

  return (
    <>
      {/* Header: tipo à esquerda; ⋯ e X à direita, separados. */}
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4 sm:px-6">
        <ProblemKindIcon kind={problem.kind} className="h-4 w-4" />
        <span className="min-w-0 truncate text-xs font-medium text-muted-foreground">
          {PROBLEM_KIND_LABEL[problem.kind]}
        </span>
        <div className="ml-auto flex items-center gap-1">
          {hasMenu && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" aria-label="Ações do problema" className={ICON_BTN}>
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {canChangeStatus && (
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger className="gap-2">
                      <CircleDot className="h-3.5 w-3.5" /> Alterar status
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                      {statusOptions.map((s) => (
                        <DropdownMenuItem key={s} onClick={() => setStatus(s)} className="gap-2">
                          <ProblemStatusIcon status={s} />
                          <span className="flex-1">{PROBLEM_STATUS_LABEL[s]}</span>
                          {s === problem.status && <Check className="h-3.5 w-3.5" />}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                )}
                {canTriage && (
                  <>
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger className="gap-2">
                        <User className="h-3.5 w-3.5" /> Alterar responsável
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent className="max-h-72 overflow-y-auto">
                        <DropdownMenuItem onClick={() => setAssignee("")} className="gap-2">
                          <span className="flex-1">Sem responsável</span>
                          {!problem.assigneeId && <Check className="h-3.5 w-3.5" />}
                        </DropdownMenuItem>
                        {members.map((m) => (
                          <DropdownMenuItem
                            key={m.id}
                            onClick={() => setAssignee(m.id)}
                            className="gap-2"
                          >
                            <span className="flex-1 truncate">{m.name}</span>
                            {m.id === problem.assigneeId && <Check className="h-3.5 w-3.5" />}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger className="gap-2">
                        <Flag className="h-3.5 w-3.5" /> Alterar prioridade
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent>
                        {PROBLEM_PRIORITIES.map((p) => (
                          <DropdownMenuItem
                            key={p}
                            onClick={() => setPriority(p)}
                            className="gap-2"
                          >
                            <Flag className={`h-3.5 w-3.5 ${PROBLEM_PRIORITY_TONE[p]}`} />
                            <span className="flex-1">{PROBLEM_PRIORITY_LABEL[p]}</span>
                            {p === problem.priority && <Check className="h-3.5 w-3.5" />}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                  </>
                )}
                {canChangeStatus && !legacy && problem.status !== "fechado" && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setStatus("fechado")} className="gap-2">
                      <Archive className="h-3.5 w-3.5" /> Arquivar
                    </DropdownMenuItem>
                  </>
                )}
                {isAdmin && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => void remove()}
                      className="gap-2 text-destructive focus:bg-destructive/10 focus:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Excluir
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <SheetClose asChild>
            <button type="button" aria-label="Fechar" className={ICON_BTN}>
              <X className="h-4 w-4" />
            </button>
          </SheetClose>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-4 py-5 sm:px-6">
        {/* Título + ação principal */}
        <div className="space-y-3">
          <div>
            <SheetTitle className="break-words text-xl font-semibold leading-snug">
              {problem.title}
            </SheetTitle>
            <SheetDescription className="mt-1 text-xs">
              Reportado por {problem.reporterName} · {formatDateTime(problem.createdAt)}
            </SheetDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canChangeStatus ? (
              <TaskOptionPicker
                value={problem.status}
                ariaLabel={`Status: ${PROBLEM_STATUS_LABEL[problem.status]}. Alterar status`}
                widthClass="w-56"
                options={statusOptions.map((s) => ({
                  value: s,
                  label: PROBLEM_STATUS_LABEL[s],
                  icon: <ProblemStatusIcon status={s} />,
                }))}
                onSelect={setStatus}
                trigger={
                  <button
                    type="button"
                    disabled={!!busy}
                    className="inline-flex items-center gap-1 rounded-md outline-none transition-opacity hover:opacity-85 focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-60"
                  >
                    <ProblemStatusBadge status={problem.status} className="h-8 px-2.5 text-xs" />
                    <ChevronDown aria-hidden className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                }
              />
            ) : (
              <ProblemStatusBadge status={problem.status} className="h-8 px-2.5 text-xs" />
            )}
            {canChangeStatus &&
              (finished ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5"
                  disabled={!!busy}
                  onClick={() => setStatus("novo")}
                >
                  {busy === "reopen" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RotateCcw className="h-3.5 w-3.5" />
                  )}
                  Reabrir problema
                </Button>
              ) : (
                <Button
                  variant="primary"
                  size="sm"
                  className="h-8 gap-1.5"
                  disabled={!!busy}
                  onClick={() => setStatus("resolvido")}
                >
                  {busy === "resolve" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  )}
                  Marcar como resolvido
                </Button>
              ))}
          </div>
        </div>

        {/* Resolução */}
        {finished && (
          <div className="space-y-2 rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-xs">
            <div className="flex items-start gap-2">
              <CheckCircle2
                aria-hidden
                className={`mt-0.5 h-4 w-4 shrink-0 ${problem.status === "resolvido" ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}
              />
              <div className="min-w-0 flex-1 space-y-0.5">
                <p className="font-medium text-foreground">
                  {PROBLEM_STATUS_LABEL[problem.status]}
                  {problem.resolvedAt && ` em ${formatDateTime(problem.resolvedAt)}`}
                  {problem.resolvedByName && ` por ${problem.resolvedByName}`}
                </p>
                {problem.resolutionNote && !noteOpen && (
                  <p className="whitespace-pre-wrap break-words text-muted-foreground">
                    {problem.resolutionNote}
                  </p>
                )}
              </div>
              {canChangeStatus && !legacy && !noteOpen && (
                <button
                  type="button"
                  onClick={() => {
                    setNoteDraft(problem.resolutionNote ?? "");
                    setNoteOpen(true);
                  }}
                  className="shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  {problem.resolutionNote ? "Editar nota" : "Como foi resolvido?"}
                </button>
              )}
            </div>
            {noteOpen && (
              <div className="space-y-2 pl-6">
                <Textarea
                  autoFocus
                  rows={3}
                  value={noteDraft}
                  onChange={(e) => setNoteDraft(e.target.value)}
                  placeholder="Ex.: corrigido o filtro que perdia a seleção ao trocar de aba."
                />
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setNoteOpen(false)}>
                    Cancelar
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={!!busy}
                    onClick={() => void saveNote()}
                  >
                    Salvar nota
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Propriedades — todas visíveis, editáveis por quem pode. */}
        <dl className="grid grid-cols-[110px_minmax(0,1fr)] gap-x-3 sm:grid-cols-[130px_minmax(0,1fr)]">
          <PropRow label="Prioridade">
            {canTriage ? (
              <TaskOptionPicker
                value={problem.priority}
                ariaLabel="Prioridade"
                widthClass="w-44"
                options={PROBLEM_PRIORITIES.map((p) => ({
                  value: p,
                  label: PROBLEM_PRIORITY_LABEL[p],
                  icon: <Flag aria-hidden className={`h-3.5 w-3.5 ${PROBLEM_PRIORITY_TONE[p]}`} />,
                }))}
                onSelect={setPriority}
                trigger={
                  <button type="button" disabled={!!busy} className={TASK_CHIP}>
                    <ProblemPriorityFlag priority={problem.priority} />
                    <ChevronDown aria-hidden className="h-3 w-3 text-muted-foreground" />
                  </button>
                }
              />
            ) : (
              <ProblemPriorityFlag priority={problem.priority} />
            )}
          </PropRow>
          <PropRow label="Área">
            {canTriage ? (
              <TaskOptionPicker
                value={problem.area ?? "Outro"}
                ariaLabel="Área"
                widthClass="w-56"
                searchable
                searchPlaceholder="Buscar área..."
                options={PROBLEM_AREAS.map((a) => ({ value: a as string, label: a }))}
                onSelect={setArea}
                trigger={
                  <button type="button" disabled={!!busy} className={TASK_CHIP}>
                    <span className="truncate">{problem.area ?? "Sem área"}</span>
                    <ChevronDown aria-hidden className="h-3 w-3 text-muted-foreground" />
                  </button>
                }
              />
            ) : (
              <span>{problem.area ?? "—"}</span>
            )}
          </PropRow>
          <PropRow label="Responsável">
            {canTriage ? (
              <TaskOptionPicker
                value={problem.assigneeId ?? ""}
                ariaLabel="Responsável"
                widthClass="w-64"
                searchable={members.length > 6}
                searchPlaceholder="Buscar pessoa..."
                options={[
                  { value: "", label: "Sem responsável" },
                  ...members.map((m) => ({ value: m.id, label: m.name })),
                ]}
                onSelect={setAssignee}
                trigger={
                  <button type="button" disabled={!!busy} className={TASK_CHIP}>
                    <User aria-hidden className="h-3.5 w-3.5 text-muted-foreground" />
                    <span
                      className={`truncate ${problem.assigneeId ? "" : "text-muted-foreground"}`}
                    >
                      {assigneeLabel}
                    </span>
                    <ChevronDown aria-hidden className="h-3 w-3 text-muted-foreground" />
                  </button>
                }
              />
            ) : (
              <span className={problem.assigneeId ? "" : "text-muted-foreground"}>
                {assigneeLabel}
                {canManage && legacy && (
                  <span className="block text-[11px] text-text-secondary">
                    Disponível após atualizar o banco da Central de Problemas.
                  </span>
                )}
              </span>
            )}
          </PropRow>
          <PropRow label="Reportado por">
            <span className="truncate">{problem.reporterName}</span>
          </PropRow>
          <PropRow label="Data">
            <span className="tabular-nums">{formatDateTime(problem.createdAt)}</span>
          </PropRow>
        </dl>

        <section>
          <SectionTitle>Descrição</SectionTitle>
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
            {problem.description}
          </p>
        </section>

        {attachmentItems.length > 0 && (
          <section>
            <SectionTitle>Anexos</SectionTitle>
            <AttachmentList items={attachmentItems} urls={urls} />
          </section>
        )}

        {detail?.diagnostics && (
          <details className="rounded-lg border border-border px-3 py-2 text-xs">
            <summary className="cursor-pointer list-none font-medium text-muted-foreground hover:text-foreground">
              Contexto técnico
              <span className="ml-1 text-[11px] font-normal">
                (visível para você e para a triagem)
              </span>
            </summary>
            <dl className="mt-2 grid grid-cols-[110px_minmax(0,1fr)] gap-x-3 gap-y-1">
              {(
                [
                  ["Rota", detail.diagnostics.route],
                  ["Módulo", detail.diagnostics.module],
                  ["Versão", detail.diagnostics.appVersion],
                  [
                    "Dispositivo",
                    [
                      detail.diagnostics.platform,
                      detail.diagnostics.viewport,
                      detail.diagnostics.touch ? "toque" : null,
                    ]
                      .filter(Boolean)
                      .join(" · "),
                  ],
                  ["Navegador", detail.diagnostics.userAgent],
                ] as [string, string | undefined][]
              )
                .filter(([, v]) => !!v)
                .map(([k, v]) => (
                  <Fragment key={k}>
                    <dt className="text-muted-foreground">{k}</dt>
                    <dd className="min-w-0 break-words font-mono text-[11px]">{v}</dd>
                  </Fragment>
                ))}
            </dl>
          </details>
        )}

        {legacy ? (
          <p className="rounded-lg border border-dashed border-border px-3 py-3 text-xs text-muted-foreground">
            Resolver e reabrir já funcionam. Prioridade, área, responsável, histórico e comentários
            ficam disponíveis assim que a atualização do banco da Central de Problemas for aplicada.
          </p>
        ) : (
          <>
            <section>
              <SectionTitle>Histórico</SectionTitle>
              {loadError ? (
                <p className="text-xs text-muted-foreground">
                  Não foi possível carregar o histórico.{" "}
                  <button type="button" className="underline" onClick={() => void reload()}>
                    Tentar de novo
                  </button>
                </p>
              ) : !detail ? (
                <div className="space-y-2">
                  <Skeleton className="h-3.5 w-3/4" />
                  <Skeleton className="h-3.5 w-1/2" />
                </div>
              ) : detail.events.filter((e) => e.type !== "comment").length === 0 ? (
                <p className="text-xs text-muted-foreground">Sem alterações registradas.</p>
              ) : (
                <ol className="space-y-2 border-l border-border pl-3">
                  {detail.events
                    .filter((e) => e.type !== "comment")
                    .map((e) => (
                      <li key={e.id} className="relative text-xs leading-relaxed">
                        <span
                          aria-hidden
                          className="absolute -left-[15px] top-1.5 h-1.5 w-1.5 rounded-full bg-muted-foreground/50"
                        />
                        <span className="font-medium text-foreground">{e.actorName}</span>{" "}
                        <span className="text-muted-foreground">{eventText(e)}</span>
                        <span className="block text-[11px] text-muted-foreground">
                          {formatDateTime(e.createdAt)}
                        </span>
                      </li>
                    ))}
                </ol>
              )}
            </section>

            <section>
              <SectionTitle>Comentários</SectionTitle>
              {loadError ? (
                <p className="text-xs text-muted-foreground">
                  Não foi possível carregar os comentários.
                </p>
              ) : (
                <CommentList detail={detail} members={members} urls={urls} />
              )}
            </section>
          </>
        )}
      </div>

      {!legacy && (
        <CommentComposer
          reportId={problem.id}
          canInternal={canManage}
          members={members}
          onSent={async () => {
            onChanged();
            await reload();
          }}
        />
      )}
      {confirmDialog}
    </>
  );
}

function CommentList({
  detail,
  members,
  urls,
}: {
  detail: ProblemDetail | null;
  members: ChatMember[];
  urls: Record<string, string>;
}) {
  if (!detail) return <p className="text-xs text-muted-foreground">Carregando…</p>;
  if (detail.comments.length === 0)
    return <p className="text-xs text-muted-foreground">Nenhum comentário ainda.</p>;
  const byComment = new Map<string, ProblemAttachment[]>();
  for (const a of detail.attachments) {
    if (!a.commentId) continue;
    byComment.set(a.commentId, [...(byComment.get(a.commentId) ?? []), a]);
  }
  return (
    <ul className="space-y-4">
      {detail.comments.map((c) => {
        const m = members.find((x) => x.id === c.authorId);
        const files = byComment.get(c.id) ?? [];
        return (
          <li key={c.id} className="flex items-start gap-2.5">
            <Avatar name={c.authorName} photo={m?.photo} />
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex flex-wrap items-baseline gap-x-1.5">
                <span className="text-xs font-semibold text-foreground">{c.authorName}</span>
                <span className="text-[11px] text-muted-foreground">
                  {formatDateTime(c.createdAt)}
                </span>
                {c.isInternal && (
                  <span className="inline-flex items-center gap-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400">
                    <Lock aria-hidden className="h-2.5 w-2.5" /> Nota interna
                  </span>
                )}
              </div>
              <div
                className={`rounded-lg rounded-tl-sm px-3 py-2 text-sm leading-relaxed [overflow-wrap:anywhere] ${c.isInternal ? "border border-amber-500/30 bg-amber-500/[0.06]" : "bg-muted/60"}`}
              >
                <p className="whitespace-pre-wrap break-words">{renderMentions(c.body, members)}</p>
              </div>
              {files.length > 0 && (
                <div className="mt-2">
                  <AttachmentList
                    items={files.map((a) => ({
                      key: a.id,
                      name: a.name,
                      path: a.path,
                      mime: a.mime,
                    }))}
                    urls={urls}
                  />
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function CommentComposer({
  reportId,
  canInternal,
  members,
  onSent,
}: {
  reportId: string;
  canInternal: boolean;
  members: ChatMember[];
  onSent: () => Promise<void>;
}) {
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [internal, setInternal] = useState(false);
  const [sending, setSending] = useState(false);
  const [mention, setMention] = useState<string | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const matches =
    mention !== null
      ? members.filter((m) => m.name.toLowerCase().includes(mention.toLowerCase())).slice(0, 5)
      : [];

  const insertMention = (name: string) => {
    const el = ref.current;
    const caret = el?.selectionStart ?? text.length;
    const before = text.slice(0, caret).replace(/@([\wÀ-ÿ]*)$/, `@${name} `);
    setText(before + text.slice(caret));
    setMention(null);
    setTimeout(() => {
      el?.focus();
      el?.setSelectionRange(before.length, before.length);
    }, 0);
  };

  const send = async () => {
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      await addProblemComment(reportId, text, internal, files);
      setText("");
      setFiles([]);
      setInternal(false);
      toast.success(internal ? "Nota interna adicionada." : "Comentário enviado.");
      await onSent();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível comentar.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="relative border-t border-border bg-background px-5 py-3 sm:px-6">
      {matches.length > 0 && (
        <div className="absolute bottom-full left-5 right-5 mb-1 overflow-hidden rounded-md border border-border bg-popover shadow-md">
          {matches.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => insertMention(m.name)}
              className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs hover:bg-muted"
            >
              <Avatar name={m.name} photo={m.photo} />
              {m.name}
            </button>
          ))}
        </div>
      )}
      {files.length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-1.5">
          {files.map((f, i) => (
            <li
              key={`${f.name}-${i}`}
              className="flex max-w-[220px] items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px]"
            >
              <Paperclip aria-hidden className="h-3 w-3 shrink-0 text-muted-foreground" />
              <span className="truncate">{f.name}</span>
              <button
                type="button"
                aria-label={`Remover ${f.name}`}
                onClick={() => setFiles((p) => p.filter((_, j) => j !== i))}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <Textarea
        ref={ref}
        rows={2}
        value={text}
        aria-label="Escrever comentário"
        placeholder={
          internal
            ? "Nota interna (só a triagem vê)…"
            : "Escreva um comentário… @ para mencionar · Ctrl/⌘+Enter envia"
        }
        onChange={(e) => {
          const v = e.target.value;
          setText(v);
          const caret = e.target.selectionStart ?? v.length;
          const m = v.slice(0, caret).match(/(?:^|\s)@([\wÀ-ÿ]*)$/);
          setMention(m ? m[1] : null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            void send();
          }
        }}
        className={internal ? "border-amber-500/50" : undefined}
      />
      <div className="mt-2 flex items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            const picked = Array.from(e.target.files ?? []);
            setFiles((p) => [...p, ...picked]);
            e.target.value = "";
          }}
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => fileRef.current?.click()}
          className="gap-1.5 text-xs text-muted-foreground"
        >
          <Paperclip className="h-3.5 w-3.5" /> Anexar
        </Button>
        {canInternal && (
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={internal}
              onChange={(e) => setInternal(e.target.checked)}
              className="h-3.5 w-3.5 accent-amber-600"
            />
            Nota interna
          </label>
        )}
        <Button
          type="button"
          variant="primary"
          size="sm"
          className="ml-auto gap-1.5"
          disabled={!text.trim() || sending}
          onClick={() => void send()}
        >
          {sending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Send className="h-3.5 w-3.5" />
          )}
          Enviar
        </Button>
      </div>
    </div>
  );
}
