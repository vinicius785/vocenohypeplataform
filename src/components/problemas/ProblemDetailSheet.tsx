import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  CheckCircle2,
  ChevronDown,
  FileText,
  Flag,
  Loader2,
  Lock,
  MoreHorizontal,
  Paperclip,
  Send,
  Trash2,
  User,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  PROBLEM_STATUSES,
  updateProblem,
  type Problem,
  type ProblemAttachment,
  type ProblemDetail,
  type ProblemEvent,
  type ProblemPatch,
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
  /** Banco ainda sem a migration da Central: só leitura do report. */
  legacy?: boolean;
  onClose: () => void;
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
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground">
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
          <span key={i} className="font-medium text-brand">
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

function eventText(e: ProblemEvent): string {
  const d = e.data as Record<string, string | null | undefined>;
  switch (e.type) {
    case "created":
      return "criou o report";
    case "status":
      return `alterou o status para ${PROBLEM_STATUS_LABEL[(d.to as ProblemStatus) ?? "novo"] ?? d.to}`;
    case "priority":
      return `alterou a prioridade para ${PROBLEM_PRIORITY_LABEL[d.to as keyof typeof PROBLEM_PRIORITY_LABEL] ?? d.to}`;
    case "assignee":
      return d.to ? `atribuiu a ${d.to}` : "removeu o responsável";
    case "area":
      return `mudou a área para ${d.to ?? "—"}`;
    case "edit":
      return "editou o report";
    case "comment":
      return "comentou";
    case "attachment":
      return `anexou ${d.name ?? "um arquivo"}`;
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
 * Detalhe do problema — painel lateral contínuo: informações → descrição →
 * anexos → (resolução) → histórico → comentários. Controles de triagem só
 * aparecem para quem pode usá-los (o banco aplica as mesmas regras).
 */
export function ProblemDetailSheet({
  problem,
  meId,
  canManage,
  isAdmin,
  legacy,
  onClose,
  onChanged,
}: Props) {
  return (
    <Sheet open={!!problem} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-[640px]"
      >
        {problem && (
          <DetailBody
            key={problem.id}
            problem={problem}
            meId={meId}
            canManage={canManage}
            isAdmin={isAdmin}
            legacy={legacy}
            onClose={onClose}
            onChanged={onChanged}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function DetailBody({
  problem,
  meId,
  canManage: canManageProp,
  isAdmin,
  legacy,
  onClose,
  onChanged,
}: Props & { problem: Problem }) {
  const canManage = canManageProp && !legacy;
  const [detail, setDetail] = useState<ProblemDetail | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [resolving, setResolving] = useState<ProblemStatus | null>(null);
  const [resolutionNote, setResolutionNote] = useState("");
  const members = useMemo(() => loadMembers(), []);
  const isAssignee = !!meId && problem.assigneeId === meId;
  const canChangeStatus = !legacy && (canManage || isAssignee);

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

  const apply = async (patch: ProblemPatch, success: string) => {
    setBusy(true);
    try {
      await updateProblem(problem.id, patch);
      toast.success(success);
      onChanged();
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível atualizar.");
    } finally {
      setBusy(false);
    }
  };

  const pickStatus = (s: ProblemStatus) => {
    if (s === problem.status) return;
    // Resolver/fechar pede "Como foi resolvido?" antes de aplicar.
    if (FINISHED_STATUSES.has(s)) {
      setResolving(s);
      setResolutionNote(problem.resolutionNote ?? "");
      return;
    }
    void apply({ status: s }, `Status alterado para ${PROBLEM_STATUS_LABEL[s]}.`);
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

  const statusTrigger = (
    <button
      type="button"
      disabled={busy}
      className="inline-flex items-center gap-1 rounded-md outline-none transition-opacity hover:opacity-85 focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-60"
    >
      <ProblemStatusBadge status={problem.status} className="h-8 px-2.5 text-xs" />
      <ChevronDown aria-hidden className="h-3.5 w-3.5 text-muted-foreground" />
    </button>
  );

  return (
    <>
      <SheetHeader className="space-y-3 border-b border-border px-5 py-4 pr-12 text-left sm:px-6">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <ProblemKindIcon kind={problem.kind} className="h-4 w-4" />
          <span>{PROBLEM_KIND_LABEL[problem.kind]}</span>
          {isAdmin && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="Mais ações"
                  className="ml-auto rounded p-1 hover:bg-muted hover:text-foreground"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={async () => {
                    if (!window.confirm("Excluir este report? Essa ação é permanente.")) return;
                    try {
                      await deleteProblem(problem.id);
                      toast.success("Report excluído.");
                      onChanged();
                      onClose();
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : "Não foi possível excluir.");
                    }
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" /> Excluir report
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
        <SheetTitle className="break-words text-xl leading-snug">{problem.title}</SheetTitle>
        <SheetDescription className="text-xs">
          Reportado por {problem.reporterName} · {formatDateTime(problem.createdAt)}
        </SheetDescription>

        <div className="flex flex-wrap items-center gap-1.5">
          {canChangeStatus ? (
            <TaskOptionPicker
              value={problem.status}
              ariaLabel={`Status: ${PROBLEM_STATUS_LABEL[problem.status]}. Alterar status`}
              widthClass="w-60"
              options={PROBLEM_STATUSES.map((s) => ({
                value: s,
                label: PROBLEM_STATUS_LABEL[s],
                icon: <ProblemStatusIcon status={s} />,
              }))}
              onSelect={pickStatus}
              trigger={statusTrigger}
            />
          ) : (
            <ProblemStatusBadge status={problem.status} className="h-8 px-2.5 text-xs" />
          )}

          {canManage ? (
            <TaskOptionPicker
              value={problem.priority}
              ariaLabel="Prioridade"
              widthClass="w-44"
              options={PROBLEM_PRIORITIES.map((p) => ({
                value: p,
                label: PROBLEM_PRIORITY_LABEL[p],
                icon: <Flag aria-hidden className={`h-3.5 w-3.5 ${PROBLEM_PRIORITY_TONE[p]}`} />,
              }))}
              onSelect={(p) =>
                p !== problem.priority &&
                void apply(
                  { priority: p },
                  `Prioridade alterada para ${PROBLEM_PRIORITY_LABEL[p]}.`,
                )
              }
              trigger={
                <button type="button" disabled={busy} className={TASK_CHIP}>
                  <ProblemPriorityFlag priority={problem.priority} />
                </button>
              }
            />
          ) : (
            <span className={TASK_CHIP}>
              <ProblemPriorityFlag priority={problem.priority} />
            </span>
          )}

          {canManage ? (
            <TaskOptionPicker
              value={problem.area ?? "Outro"}
              ariaLabel="Área"
              widthClass="w-56"
              searchable
              searchPlaceholder="Buscar área..."
              options={PROBLEM_AREAS.map((a) => ({ value: a as string, label: a }))}
              onSelect={(a) => a !== problem.area && void apply({ area: a }, "Área atualizada.")}
              trigger={
                <button type="button" disabled={busy} className={TASK_CHIP}>
                  {problem.area ?? "Sem área"}
                </button>
              }
            />
          ) : (
            <span className={TASK_CHIP}>{problem.area ?? "Sem área"}</span>
          )}

          {canManage ? (
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
              onSelect={(id) =>
                id !== (problem.assigneeId ?? "") &&
                void apply(
                  { assigneeId: id || null },
                  id ? "Responsável atribuído." : "Responsável removido.",
                )
              }
              trigger={
                <button type="button" disabled={busy} className={TASK_CHIP}>
                  <User aria-hidden className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="truncate">{problem.assigneeName ?? "Sem responsável"}</span>
                </button>
              }
            />
          ) : (
            <span className={TASK_CHIP}>
              <User aria-hidden className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="truncate">{problem.assigneeName ?? "Sem responsável"}</span>
            </span>
          )}
        </div>
      </SheetHeader>

      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5 sm:px-6">
        {resolving && (
          <div className="space-y-2 rounded-lg border border-emerald-500/40 bg-emerald-500/[0.06] p-3">
            <p className="text-xs font-semibold text-foreground">
              {resolving === "resolvido" ? "Como foi resolvido?" : "Por que está sendo fechado?"}
            </p>
            <Textarea
              autoFocus
              rows={3}
              value={resolutionNote}
              onChange={(e) => setResolutionNote(e.target.value)}
              placeholder={
                resolving === "resolvido"
                  ? "Ex.: corrigido o filtro que perdia a seleção ao trocar de aba."
                  : "Ex.: duplicado / comportamento esperado."
              }
            />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setResolving(null)}>
                Cancelar
              </Button>
              <Button
                variant="primary"
                size="sm"
                disabled={busy || resolutionNote.trim().length < 3}
                onClick={async () => {
                  await apply(
                    { status: resolving, resolutionNote: resolutionNote.trim() },
                    `Status alterado para ${PROBLEM_STATUS_LABEL[resolving]}.`,
                  );
                  setResolving(null);
                }}
              >
                Confirmar
              </Button>
            </div>
          </div>
        )}

        {FINISHED_STATUSES.has(problem.status) && !resolving && (
          <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-xs">
            <CheckCircle2
              aria-hidden
              className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400"
            />
            <div className="min-w-0 space-y-0.5">
              <p className="font-medium text-foreground">
                {PROBLEM_STATUS_LABEL[problem.status]}
                {problem.resolvedAt && ` em ${formatDateTime(problem.resolvedAt)}`}
                {problem.resolvedByName && ` por ${problem.resolvedByName}`}
              </p>
              {problem.resolutionNote && (
                <p className="whitespace-pre-wrap break-words text-muted-foreground">
                  {problem.resolutionNote}
                </p>
              )}
            </div>
          </div>
        )}

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
          <details className="group rounded-lg border border-border px-3 py-2 text-xs">
            <summary className="cursor-pointer list-none font-medium text-muted-foreground hover:text-foreground">
              Contexto técnico
              <span className="ml-1 text-[10px] font-normal">
                (visível para você e para a triagem)
              </span>
            </summary>
            <dl className="mt-2 grid grid-cols-[110px_minmax(0,1fr)] gap-x-3 gap-y-1">
              {(
                [
                  ["Rota", detail.diagnostics.route],
                  ["Módulo", detail.diagnostics.module],
                  ["Tarefa", detail.diagnostics.task ? detail.diagnostics.task.title : undefined],
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
            Histórico, comentários e triagem ficam disponíveis assim que a atualização do banco da
            Central de Problemas for aplicada.
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
                <p className="text-xs text-muted-foreground">Carregando…</p>
              ) : detail.events.length === 0 ? (
                <p className="text-xs text-muted-foreground">Sem eventos registrados.</p>
              ) : (
                <ol className="space-y-1.5 border-l border-border pl-3">
                  {detail.events
                    .filter((e) => e.type !== "comment")
                    .map((e) => (
                      <li key={e.id} className="relative text-xs">
                        <span
                          aria-hidden
                          className="absolute -left-[15px] top-1.5 h-1.5 w-1.5 rounded-full bg-muted-foreground/50"
                        />
                        <span className="font-medium text-foreground">{e.actorName}</span>{" "}
                        <span className="text-muted-foreground">{eventText(e)}</span>
                        <span className="ml-1.5 text-[10px] text-muted-foreground">
                          {formatDateTime(e.createdAt)}
                        </span>
                      </li>
                    ))}
                </ol>
              )}
            </section>

            <section>
              <SectionTitle>Comentários</SectionTitle>
              <CommentList detail={detail} members={members} urls={urls} />
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
                <span className="text-[10px] text-muted-foreground">
                  {formatDateTime(c.createdAt)}
                </span>
                {c.isInternal && (
                  <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400">
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
