import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronUp,
  CircleDashed,
  CornerUpRight,
  Lock,
  LockOpen,
  Undo2,
  User as UserIcon,
} from "lucide-react";
import {
  Avatar,
  formatWhen,
  fmtDate,
  renderMentions,
  DEADLINE_CHANGE_MOTIVOS,
  DEADLINE_CHANGE_MOTIVO_LABEL,
  type Activity,
  type ActivityKind,
  type Comment,
  type DeadlineChangeEntry,
  type DeadlineChangeMotivo,
  type Member,
  type TaskBlockedState,
  type TaskBlockCategory,
  type BlockFormFields,
  type ResolveFormFields,
  type TaskStatus,
  TASK_STATUSES,
} from "@/components/tasks/TaskBoard";
import { ACTIVITY_STATUS_COMPLETED_ACTION } from "@/lib/projetos";
import { taskDeadlineHealth, type TaskDeadlineHealthLike } from "@/lib/performance-engine";
import {
  TASK_BLOCK_CATEGORIES,
  TASK_BLOCK_CATEGORY_LABEL,
  decidesPausesDeadlineByCategory,
  isValidBlockReason,
} from "@/lib/task-blocks-rules";
import { TaskPicker } from "@/components/tasks/TaskPicker";
import type { TaskDirectoryEntry } from "@/lib/task-directory";

/** Janela de agrupamento pra eventos secundários consecutivos do mesmo
 * autor (item 12 do pedido) — puramente de apresentação, nada é
 * persistido diferente por causa disso. */
const MINOR_GROUP_WINDOW_MS = 10 * 60 * 1000;

const IMPORTANT_KINDS = new Set<ActivityKind>([
  "completed",
  "reopened",
  "deadline",
  "primary_assignee",
  "status",
  "blocked",
  "unblocked",
]);

/** Rede de segurança só-pra-exibição pra entradas antigas sem `kind`
 * (aditivo desde esta rodada) — nunca escrita de volta ao objeto, nunca
 * usada por scoring (que continua lendo `action` por regex exato, ver
 * `ACTIVITY_STATUS_COMPLETED_ACTION`). */
function classifyActivityKind(action: string): ActivityKind {
  if (action === ACTIVITY_STATUS_COMPLETED_ACTION) return "completed";
  if (action.startsWith("mudou status para")) return "status";
  if (action.startsWith("definiu prazo") || action === "removeu prazo") return "deadline";
  if (
    action.startsWith("transferiu a responsabilidade principal") ||
    action === "removeu o responsável principal"
  )
    return "primary_assignee";
  if (action.startsWith("atribuiu a") || action === "removeu responsável") return "assignee";
  return "minor";
}

function iconForKind(kind: ActivityKind) {
  switch (kind) {
    case "completed":
      return <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />;
    case "reopened":
      return <Undo2 className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />;
    case "deadline":
      return <CornerUpRight className="h-3.5 w-3.5 shrink-0 text-foreground/70" />;
    case "primary_assignee":
      return <UserIcon className="h-3.5 w-3.5 shrink-0 text-foreground/70" />;
    case "status":
      return <CircleDashed className="h-3.5 w-3.5 shrink-0 text-foreground/70" />;
    case "blocked":
      return <Lock className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />;
    case "unblocked":
      return <LockOpen className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />;
    default:
      return null;
  }
}

function memberFor(name: string, entry: { initials: string; color: string }, members: Member[]) {
  return (
    members.find((m) => m.name === name) ?? { name, initials: entry.initials, color: entry.color }
  );
}

type FeedItem =
  | { type: "comment"; item: Comment; ts: string }
  | { type: "important"; item: Activity; ts: string; deadlineEntry?: DeadlineChangeEntry }
  | { type: "minor_single"; item: Activity; ts: string }
  | { type: "minor_group"; items: Activity[]; ts: string; author: string };

function groupMinor(entries: Activity[]): FeedItem[] {
  const sorted = [...entries].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const groups: Activity[][] = [];
  for (const e of sorted) {
    const last = groups[groups.length - 1];
    const lastOfGroup = last?.[last.length - 1];
    if (
      last &&
      lastOfGroup &&
      last[0].author === e.author &&
      new Date(e.createdAt).getTime() - new Date(lastOfGroup.createdAt).getTime() <=
        MINOR_GROUP_WINDOW_MS
    ) {
      last.push(e);
    } else {
      groups.push([e]);
    }
  }
  return groups.map((g) =>
    g.length === 1
      ? { type: "minor_single" as const, item: g[0], ts: g[0].createdAt }
      : {
          type: "minor_group" as const,
          items: g,
          ts: g[g.length - 1].createdAt,
          author: g[0].author,
        },
  );
}

type ActivityTab = "tudo" | "comentarios" | "historico";
const TAB_DEFS: { key: ActivityTab; label: string }[] = [
  { key: "tudo", label: "Tudo" },
  { key: "comentarios", label: "Comentários" },
  { key: "historico", label: "Histórico" },
];

/**
 * Painel de Activity do modal de tarefa — extraído de `TaskBoard.tsx`
 * (o maior bloco novo desta rodada: tabs, 3 tiers de hierarquia visual,
 * agrupamento de eventos secundários, composer de comentário com
 * @mention). `TaskDialog` continua dono de `activity`/`comments` (é
 * quem `save()` grava) — este componente só recebe e apresenta, mais o
 * texto do comentário em edição via callbacks.
 */
export function TaskActivityPanel({
  task,
  activity,
  comments,
  members,
  commentText,
  onCommentTextChange,
  onPostComment,
  deadlineCutoffHour,
  pendingDeadlineChange,
  onConfirmDeadlineChange,
  onCancelDeadlineChange,
  blockedState,
  pendingBlockAction,
  blockActionBusy,
  onConfirmBlock,
  onConfirmResolve,
  onCancelBlockAction,
  onBlockComposerDirtyChange,
  excludeTaskId,
  currentProjectId,
  currentCampanhaId,
}: {
  /** Só os campos que este painel precisa (saúde do prazo +
   * cross-referência de `deadlineHistory`) — não o `Task` inteiro, pra
   * uma tarefa nova (ainda sem `initial`) poder passar um objeto
   * mínimo sem forçar todos os campos obrigatórios de `Task`. */
  task: TaskDeadlineHealthLike & { deadlineHistory?: DeadlineChangeEntry[] };
  activity: Activity[];
  comments: Comment[];
  members: Member[];
  commentText: string;
  onCommentTextChange: (v: string) => void;
  onPostComment: () => void;
  deadlineCutoffHour?: number;
  /** Mudança de prazo crítica aguardando confirmação (vence hoje/está
   * atrasada, sendo adiada) — enquanto presente, mostra o formulário
   * inline abaixo do feed (nunca modal/popup/drawer). */
  pendingDeadlineChange?: { from: string; to: string } | null;
  onConfirmDeadlineChange?: (motivo: DeadlineChangeMotivo, observacao: string) => void;
  onCancelDeadlineChange?: () => void;
  /** Bloqueio ativo (cache denormalizado) e questionário de bloquear/
   * resolver pendente — mesmo princípio do trio acima
   * (`pendingDeadlineChange`), card inline dentro do feed. */
  blockedState?: TaskBlockedState | null;
  pendingBlockAction?: { mode: "block" } | { mode: "resolve" } | null;
  blockActionBusy?: boolean;
  onConfirmBlock?: (fields: BlockFormFields) => void;
  onConfirmResolve?: (fields: ResolveFormFields) => void;
  onCancelBlockAction?: () => void;
  onBlockComposerDirtyChange?: (dirty: boolean) => void;
  excludeTaskId?: string;
  currentProjectId?: string;
  currentCampanhaId?: string;
}) {
  const [tab, setTab] = useState<ActivityTab>("tudo");

  // Abrir o questionário de bloqueio/resolução leva o foco pra
  // "Comentários" automaticamente (mesma área usada pelo replanejamento)
  // — o painel em si já está sempre visível (não há um estado de
  // "fechado" pra reabrir nesta UI).
  useEffect(() => {
    if (pendingBlockAction) setTab("comentarios");
  }, [pendingBlockAction]);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const commentRef = useRef<HTMLTextAreaElement>(null);

  // `commentText` esvaziado por fora (comentário postado) — fecha
  // qualquer dropdown de @menção que tenha ficado aberto.
  useEffect(() => {
    if (!commentText) setMentionQuery(null);
  }, [commentText]);

  const onCommentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const v = e.target.value;
    onCommentTextChange(v);
    const caret = e.target.selectionStart ?? v.length;
    const before = v.slice(0, caret);
    const m = before.match(/(?:^|\s)@([\wÀ-ÿ]*)$/);
    setMentionQuery(m ? m[1] : null);
  };
  const insertMention = (name: string) => {
    const el = commentRef.current;
    const caret = el?.selectionStart ?? commentText.length;
    const before = commentText.slice(0, caret).replace(/@([\wÀ-ÿ]*)$/, `@${name} `);
    const after = commentText.slice(caret);
    onCommentTextChange(before + after);
    setMentionQuery(null);
    setTimeout(() => {
      el?.focus();
      el?.setSelectionRange(before.length, before.length);
    }, 0);
  };
  const mentionMatches =
    mentionQuery !== null
      ? members.filter((m) => m.name.toLowerCase().includes(mentionQuery.toLowerCase())).slice(0, 5)
      : [];

  const feed = useMemo<FeedItem[]>(() => {
    const includeComments = tab !== "historico";
    const includeEvents = tab !== "comentarios";
    const items: FeedItem[] = [];
    if (includeComments) {
      for (const c of comments) items.push({ type: "comment", item: c, ts: c.createdAt });
    }
    if (includeEvents) {
      const withKind = activity.map((a) => ({
        ...a,
        effectiveKind: (a.kind ?? classifyActivityKind(a.action)) as ActivityKind,
      }));
      const important = withKind.filter((a) => IMPORTANT_KINDS.has(a.effectiveKind));
      const minor = withKind.filter((a) => !IMPORTANT_KINDS.has(a.effectiveKind));

      // "deadline"-kind entries e `task.deadlineHistory` NÃO são 1:1: a
      // 1ª definição de prazo de uma tarefa (`!initial.dueDate` em
      // `save()`) sempre gera uma atividade "definiu prazo X", mas NUNCA
      // uma entrada em `deadlineHistory` (só mudanças SUBSEQUENTES
      // geram). Ou seja, pode haver até 1 atividade "deadline" a mais do
      // que entradas de histórico — e essa sobra é sempre a(s) MAIS
      // ANTIGA(S) (a 1ª definição), nunca a mais recente. Pareia da
      // direita pra esquerda (mais recente com mais recente) em vez de
      // por índice cru, senão a 1ª definição "rouba" o slot da mudança
      // real seguinte no feed.
      const deadlineActivities = important
        .filter((a) => a.effectiveKind === "deadline")
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      const deadlineEntries = [...(task.deadlineHistory ?? [])].sort((a, b) =>
        a.changedAt.localeCompare(b.changedAt),
      );
      const deadlineByActivityId = new Map<string, DeadlineChangeEntry>();
      const offset = Math.max(0, deadlineActivities.length - deadlineEntries.length);
      deadlineActivities.forEach((a, i) => {
        const entry = deadlineEntries[i - offset];
        if (entry) deadlineByActivityId.set(a.id, entry);
      });

      for (const a of important) {
        items.push({
          type: "important",
          item: a,
          ts: a.createdAt,
          deadlineEntry: deadlineByActivityId.get(a.id),
        });
      }
      for (const group of groupMinor(minor)) items.push(group);
    }
    return items.sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());
  }, [tab, activity, comments, task.deadlineHistory]);

  const health = taskDeadlineHealth(task, undefined, deadlineCutoffHour);

  return (
    <div className="flex min-h-0 flex-col border-l border-border bg-muted/20">
      <div className="border-b border-border px-4 py-2.5">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-semibold">Atividade</p>
          <span className="text-[10px] text-muted-foreground">
            {activity.length + comments.length}
          </span>
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-border p-0.5">
          {TAB_DEFS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                tab === t.key
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {health.health === "atrasada" && (
        <div className="flex items-center gap-1.5 border-b border-border bg-red-500/10 px-4 py-1.5 text-[11px] font-medium text-red-700 dark:text-red-400">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />
          {health.label}
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-5 py-3 [overscroll-behavior:contain]">
        <div className="space-y-3">
          {feed.length === 0 && (
            <p className="py-6 text-center text-xs text-muted-foreground">Nada por aqui ainda.</p>
          )}
          {feed.map((f) => {
            if (f.type === "comment") {
              const member = memberFor(f.item.author, f.item, members);
              return (
                <div key={f.item.id} className="flex min-w-0 items-start gap-2">
                  <Avatar member={member} size={28} />
                  <div className="min-w-0 flex-1 rounded-md border border-border bg-background px-2.5 py-2">
                    <div className="mb-0.5 flex items-baseline gap-1.5">
                      <span className="text-xs font-semibold">{f.item.author}</span>
                      <span className="text-[10px] text-muted-foreground/70">
                        {formatWhen(f.item.createdAt)}
                      </span>
                    </div>
                    <div className="whitespace-pre-wrap break-words text-xs leading-relaxed text-foreground [overflow-wrap:anywhere]">
                      {renderMentions(f.item.text, members)}
                    </div>
                  </div>
                </div>
              );
            }
            if (f.type === "important") {
              const member = memberFor(f.item.author, f.item, members);
              const kind = f.item.kind ?? classifyActivityKind(f.item.action);
              return (
                <div key={f.item.id} className="flex min-w-0 items-start gap-2">
                  <Avatar member={member} size={24} />
                  <div className="min-w-0 flex-1 text-xs leading-relaxed">
                    <div className="flex items-center gap-1.5">
                      {iconForKind(kind)}
                      <span className="font-medium text-foreground">
                        {kind === "deadline" && f.deadlineEntry
                          ? "Prazo replanejado"
                          : f.item.action}
                      </span>
                    </div>
                    {kind === "deadline" && f.deadlineEntry && (
                      <div
                        className={
                          f.deadlineEntry.isCritical && !f.deadlineEntry.exemptFromResponsibility
                            ? "mt-0.5 text-red-700 dark:text-red-400"
                            : "mt-0.5 text-muted-foreground"
                        }
                      >
                        <p className="font-medium">
                          {f.deadlineEntry.from ? fmtDate(f.deadlineEntry.from) : "—"} →{" "}
                          {f.deadlineEntry.to ? fmtDate(f.deadlineEntry.to) : "—"}
                        </p>
                        {f.deadlineEntry.motivo && (
                          <p className="text-[11px]">
                            {DEADLINE_CHANGE_MOTIVO_LABEL[f.deadlineEntry.motivo]}
                          </p>
                        )}
                        {f.deadlineEntry.observacao && (
                          <p className="text-[11px] italic text-muted-foreground">
                            "{f.deadlineEntry.observacao}"
                          </p>
                        )}
                        {f.deadlineEntry.isCritical &&
                          !f.deadlineEntry.exemptFromResponsibility && (
                            <p className="text-[11px] font-medium">
                              Alterado após o prazo operacional
                            </p>
                          )}
                      </div>
                    )}
                    {kind === "blocked" && f.item.meta && (
                      <div className="mt-0.5 space-y-0.5 text-muted-foreground">
                        <p>
                          Categoria:{" "}
                          {TASK_BLOCK_CATEGORY_LABEL[f.item.meta.category as TaskBlockCategory] ??
                            String(f.item.meta.category)}
                        </p>
                        <p className="italic">"{String(f.item.meta.reason ?? "")}"</p>
                        {typeof f.item.meta.responsibleForUnblockingName === "string" && (
                          <p>Dependência: {f.item.meta.responsibleForUnblockingName}</p>
                        )}
                        {typeof f.item.meta.requiredAction === "string" &&
                          f.item.meta.requiredAction && (
                            <p>Ação necessária: {f.item.meta.requiredAction}</p>
                          )}
                        {typeof f.item.meta.expectedResolutionAt === "string" &&
                          f.item.meta.expectedResolutionAt && (
                            <p>
                              Previsão:{" "}
                              {fmtDate(String(f.item.meta.expectedResolutionAt).slice(0, 10))}
                            </p>
                          )}
                        <p className="font-medium">
                          Prazo: {f.item.meta.pausesDeadline ? "pausado" : "continua correndo"}
                        </p>
                      </div>
                    )}
                    {kind === "unblocked" && f.item.meta && (
                      <div className="mt-0.5 space-y-0.5 text-muted-foreground">
                        <p>Resolução: {String(f.item.meta.resolutionNote ?? "")}</p>
                        <p>Novo status: {String(f.item.meta.newStatus ?? "")}</p>
                        {typeof f.item.meta.performanceDueDate === "string" &&
                          f.item.meta.performanceDueDate && (
                            <p>
                              Novo prazo efetivo:{" "}
                              {fmtDate(String(f.item.meta.performanceDueDate).slice(0, 10))}
                            </p>
                          )}
                      </div>
                    )}
                    <div className="mt-0.5 text-[10px] text-muted-foreground/70">
                      {f.item.author} · {formatWhen(f.item.createdAt)}
                    </div>
                  </div>
                </div>
              );
            }
            if (f.type === "minor_single") {
              const member = memberFor(f.item.author, f.item, members);
              return (
                <div key={f.item.id} className="flex min-w-0 items-start gap-2">
                  <Avatar member={member} size={24} />
                  <div className="min-w-0 flex-1 break-words text-xs leading-relaxed [overflow-wrap:anywhere]">
                    <span className="font-medium text-foreground">{f.item.author}</span>{" "}
                    <span className="text-muted-foreground">{f.item.action}</span>
                    <div className="text-[10px] text-muted-foreground/70">
                      {formatWhen(f.item.createdAt)}
                    </div>
                  </div>
                </div>
              );
            }
            // minor_group
            return <MinorGroupRow key={f.items[0].id} group={f.items} members={members} />;
          })}
          {pendingDeadlineChange && onConfirmDeadlineChange && onCancelDeadlineChange && (
            <DeadlinePendingForm
              from={pendingDeadlineChange.from}
              to={pendingDeadlineChange.to}
              onConfirm={onConfirmDeadlineChange}
              onCancel={onCancelDeadlineChange}
            />
          )}
          {pendingBlockAction?.mode === "block" && onConfirmBlock && onCancelBlockAction && (
            <BlockedPendingForm
              busy={!!blockActionBusy}
              onConfirm={onConfirmBlock}
              onCancel={onCancelBlockAction}
              onDirtyChange={onBlockComposerDirtyChange}
              excludeTaskId={excludeTaskId}
              currentProjectId={currentProjectId}
              currentCampanhaId={currentCampanhaId}
              members={members}
            />
          )}
          {pendingBlockAction?.mode === "resolve" &&
            blockedState &&
            onConfirmResolve &&
            onCancelBlockAction && (
              <ResolveBlockForm
                busy={!!blockActionBusy}
                onConfirm={onConfirmResolve}
                onCancel={onCancelBlockAction}
                onDirtyChange={onBlockComposerDirtyChange}
              />
            )}
        </div>
      </div>

      <div className="relative border-t border-border bg-background p-3">
        {mentionMatches.length > 0 && (
          <div className="absolute bottom-full left-3 right-3 mb-1 overflow-hidden rounded-md border border-border bg-popover shadow-md">
            {mentionMatches.map((m) => (
              <button
                key={m.name}
                type="button"
                onClick={() => insertMention(m.name)}
                className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs hover:bg-muted"
              >
                <Avatar member={m} size={20} />
                {m.name}
              </button>
            ))}
          </div>
        )}
        <textarea
          ref={commentRef}
          value={commentText}
          onChange={onCommentChange}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              onPostComment();
            }
          }}
          rows={2}
          placeholder="Escreva um comentário… use @ para mencionar"
          className="w-full resize-none rounded-md border border-border bg-background px-2 py-1.5 text-xs outline-none placeholder:text-muted-foreground/70 focus:border-primary"
        />
        <div className="mt-1 flex justify-end">
          <button
            type="button"
            onClick={onPostComment}
            disabled={!commentText.trim()}
            className="rounded-md bg-foreground px-2.5 py-1 text-[11px] font-medium text-background hover:opacity-90 disabled:opacity-50"
          >
            Comentar
          </button>
        </div>
      </div>
    </div>
  );
}

function MinorGroupRow({ group, members }: { group: Activity[]; members: Member[] }) {
  const [open, setOpen] = useState(false);
  const first = group[0];
  const last = group[group.length - 1];
  const member = memberFor(first.author, first, members);
  return (
    <div className="flex min-w-0 items-start gap-2">
      <Avatar member={member} size={24} />
      <div className="min-w-0 flex-1 text-xs leading-relaxed">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1 text-left hover:text-foreground"
        >
          <span className="font-medium text-foreground">{first.author}</span>
          <span className="text-muted-foreground">atualizou a tarefa</span>
          {open ? (
            <ChevronUp className="h-3 w-3 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
          )}
        </button>
        <div className="text-[10px] text-muted-foreground/70">
          {formatWhen(last.createdAt)} · {group.length} alteraç{group.length === 1 ? "ão" : "ões"}
        </div>
        {open && (
          <ul className="mt-1 space-y-0.5">
            {group.map((g) => (
              <li key={g.id} className="text-muted-foreground">
                {g.action}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/**
 * Formulário inline pra justificar um replanejamento crítico (tarefa
 * vencendo hoje/já atrasada, prazo sendo adiado) — vive dentro do
 * próprio Activity, nunca como modal/popup/drawer. Some assim que
 * confirmado ou cancelado; enquanto aberto, a mudança de prazo ainda
 * não foi persistida (ver `TaskBoard.tsx`'s `pendingDeadlineChange`).
 */
function DeadlinePendingForm({
  from,
  to,
  onConfirm,
  onCancel,
}: {
  from: string;
  to: string;
  onConfirm: (motivo: DeadlineChangeMotivo, observacao: string) => void;
  onCancel: () => void;
}) {
  const [motivo, setMotivo] = useState<DeadlineChangeMotivo>("replanejamento_operacional");
  const [observacao, setObservacao] = useState("");
  const selectRef = useRef<HTMLSelectElement>(null);
  const precisaObservacao = motivo === "outro";

  useEffect(() => {
    selectRef.current?.focus();
  }, []);

  const confirm = () => {
    if (precisaObservacao && !observacao.trim()) return;
    onConfirm(motivo, observacao.trim());
  };

  return (
    <div className="space-y-2 rounded-lg border border-border bg-background p-3">
      <div>
        <p className="text-xs font-semibold text-foreground">Alteração de prazo</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {fmtDate(from)} → {fmtDate(to)}
        </p>
      </div>
      <label className="block space-y-1">
        <span className="text-[11px] font-medium text-muted-foreground">Motivo</span>
        <select
          ref={selectRef}
          value={motivo}
          onChange={(e) => setMotivo(e.target.value as DeadlineChangeMotivo)}
          className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs outline-none focus:border-ring focus:ring-1 focus:ring-ring"
        >
          {DEADLINE_CHANGE_MOTIVOS.map((m) => (
            <option key={m} value={m}>
              {DEADLINE_CHANGE_MOTIVO_LABEL[m]}
            </option>
          ))}
        </select>
      </label>
      <label className="block space-y-1">
        <span className="text-[11px] font-medium text-muted-foreground">
          Contexto{precisaObservacao ? "" : " (opcional)"}
        </span>
        <textarea
          value={observacao}
          onChange={(e) => setObservacao(e.target.value)}
          rows={2}
          placeholder="Explique brevemente o motivo da alteração..."
          className="w-full resize-none rounded-md border border-input bg-background px-2 py-1.5 text-xs outline-none focus:border-ring focus:ring-1 focus:ring-ring"
        />
      </label>
      <div className="flex justify-end gap-2 pt-0.5">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={confirm}
          disabled={precisaObservacao && !observacao.trim()}
          className="rounded-md bg-foreground px-2.5 py-1 text-xs font-medium text-background hover:opacity-90 disabled:opacity-50"
        >
          Confirmar alteração
        </button>
      </div>
    </div>
  );
}

/**
 * Questionário de bloqueio — mesmo padrão estrutural/comportamental de
 * `DeadlinePendingForm` (card inline na Activity, cabeçalho, campos,
 * rodapé Cancelar/Confirmar, loading), clonado em vez de duplicado
 * livremente: mesma classe de card, mesmo `<select>`/`<textarea>`, mesmo
 * layout de rodapé. A decisão de pausar o prazo NUNCA é escolhida aqui —
 * o "Resumo do impacto" abaixo é só uma prévia (`decidesPausesDeadlineByCategory`,
 * mesma regra usada no backend); quem decide de verdade é `blockTask`
 * no servidor.
 */
function BlockedPendingForm({
  busy,
  onConfirm,
  onCancel,
  onDirtyChange,
  excludeTaskId,
  currentProjectId,
  currentCampanhaId,
  members,
}: {
  busy: boolean;
  onConfirm: (fields: BlockFormFields) => void;
  onCancel: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  excludeTaskId?: string;
  currentProjectId?: string;
  currentCampanhaId?: string;
  members: Member[];
}) {
  const [category, setCategory] = useState<TaskBlockCategory>("aguardando_time");
  const [reason, setReason] = useState("");
  const [relatedTaskEntry, setRelatedTaskEntry] = useState<TaskDirectoryEntry | null>(null);
  const [showTaskPicker, setShowTaskPicker] = useState(false);
  const [memberId, setMemberId] = useState("");
  const [requiredAction, setRequiredAction] = useState("");
  const [relatedEntityType, setRelatedEntityType] = useState("");
  const [expectedResolutionAt, setExpectedResolutionAt] = useState("");
  const selectRef = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    selectRef.current?.focus();
  }, []);

  useEffect(() => {
    const dirty =
      reason.trim().length > 0 ||
      !!relatedTaskEntry ||
      !!memberId ||
      requiredAction.trim().length > 0 ||
      relatedEntityType.trim().length > 0;
    onDirtyChange?.(dirty);
    return () => onDirtyChange?.(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reason, relatedTaskEntry, memberId, requiredAction, relatedEntityType]);

  const reasonValid = isValidBlockReason(reason);
  const needsRelatedTask = category === "dependencia_tarefa";
  const needsMember = category === "aguardando_time";
  const needsEntity = category === "aguardando_cliente" || category === "aguardando_fornecedor";
  const fieldsValid =
    reasonValid &&
    (!needsRelatedTask || !!relatedTaskEntry) &&
    (!needsMember || !!memberId) &&
    (!needsEntity || relatedEntityType.trim().length > 0);

  const pausesPreview = decidesPausesDeadlineByCategory(category);
  const selectedMember = members.find((m) => m.id === memberId);

  const confirm = () => {
    if (!fieldsValid) return;
    onConfirm({
      category,
      reason: reason.trim(),
      responsibleForUnblockingUserId: needsMember ? memberId : undefined,
      responsibleForUnblockingName: needsMember ? selectedMember?.name : undefined,
      relatedTaskId: needsRelatedTask ? relatedTaskEntry?.rawId : undefined,
      relatedTaskTitle: needsRelatedTask ? relatedTaskEntry?.label : undefined,
      relatedTaskEntry: needsRelatedTask ? (relatedTaskEntry ?? undefined) : undefined,
      relatedEntityType: needsEntity ? relatedEntityType.trim() : undefined,
      requiredAction: requiredAction.trim() || undefined,
      expectedResolutionAt: expectedResolutionAt
        ? new Date(expectedResolutionAt).toISOString()
        : undefined,
    });
  };

  return (
    <div className="space-y-2.5 rounded-lg border border-amber-500/30 bg-background p-3">
      <div>
        <p className="text-xs font-semibold text-foreground">Bloquear tarefa</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          Informe o que está impedindo o avanço da tarefa. Essas informações serão registradas no
          histórico e podem alterar a contagem do prazo.
        </p>
      </div>

      <label className="block space-y-1">
        <span className="text-[11px] font-medium text-muted-foreground">Categoria</span>
        <select
          ref={selectRef}
          value={category}
          onChange={(e) => {
            setCategory(e.target.value as TaskBlockCategory);
            setRelatedTaskEntry(null);
            setMemberId("");
            setRelatedEntityType("");
          }}
          className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs outline-none focus:border-ring focus:ring-1 focus:ring-ring"
        >
          {TASK_BLOCK_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {TASK_BLOCK_CATEGORY_LABEL[c]}
            </option>
          ))}
        </select>
      </label>

      <label className="block space-y-1">
        <span className="text-[11px] font-medium text-muted-foreground">Motivo</span>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          placeholder="Explique o que está impedindo esta tarefa de avançar."
          className="w-full resize-none rounded-md border border-input bg-background px-2 py-1.5 text-xs outline-none focus:border-ring focus:ring-1 focus:ring-ring"
        />
        {!reasonValid && reason.length > 0 && (
          <span className="text-[10.5px] text-destructive">
            Descreva com mais detalhe (mínimo 10 caracteres).
          </span>
        )}
      </label>

      {needsRelatedTask && (
        <div className="space-y-1">
          <span className="text-[11px] font-medium text-muted-foreground">
            Qual tarefa precisa ser concluída primeiro?
          </span>
          {relatedTaskEntry && !showTaskPicker ? (
            <button
              type="button"
              onClick={() => setShowTaskPicker(true)}
              className="flex w-full items-center justify-between rounded-md border border-input bg-muted/40 px-2 py-1.5 text-left text-xs hover:bg-muted"
            >
              <span className="truncate">{relatedTaskEntry.label}</span>
              <span className="shrink-0 text-[10.5px] text-muted-foreground">Trocar</span>
            </button>
          ) : (
            <div className="rounded-md border border-input">
              <TaskPicker
                excludeTaskId={excludeTaskId ?? ""}
                currentProjectId={currentProjectId}
                currentCampanhaId={currentCampanhaId}
                onSelect={(t) => {
                  setRelatedTaskEntry(t);
                  setShowTaskPicker(false);
                }}
              />
            </div>
          )}
        </div>
      )}

      {needsMember && (
        <>
          <label className="block space-y-1">
            <span className="text-[11px] font-medium text-muted-foreground">Quem do time?</span>
            <select
              value={memberId}
              onChange={(e) => setMemberId(e.target.value)}
              className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs outline-none focus:border-ring focus:ring-1 focus:ring-ring"
            >
              <option value="">— Selecionar —</option>
              {members
                .filter((m) => m.id)
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-[11px] font-medium text-muted-foreground">
              O que essa pessoa precisa fazer?
            </span>
            <textarea
              value={requiredAction}
              onChange={(e) => setRequiredAction(e.target.value)}
              rows={2}
              placeholder="Ex.: enviar o briefing aprovado"
              className="w-full resize-none rounded-md border border-input bg-background px-2 py-1.5 text-xs outline-none focus:border-ring focus:ring-1 focus:ring-ring"
            />
          </label>
        </>
      )}

      {needsEntity && (
        <label className="block space-y-1">
          <span className="text-[11px] font-medium text-muted-foreground">
            {category === "aguardando_cliente"
              ? "Campanha, conteúdo ou aprovação relacionada"
              : "Fornecedor/parceiro e o que precisa ser entregue"}
          </span>
          <input
            value={relatedEntityType}
            onChange={(e) => setRelatedEntityType(e.target.value)}
            placeholder="Descreva livremente"
            className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs outline-none focus:border-ring focus:ring-1 focus:ring-ring"
          />
        </label>
      )}

      {(category === "problema_tecnico" || category === "aguardando_aprovacao") && (
        <label className="block space-y-1">
          <span className="text-[11px] font-medium text-muted-foreground">Detalhes</span>
          <textarea
            value={requiredAction}
            onChange={(e) => setRequiredAction(e.target.value)}
            rows={2}
            placeholder={
              category === "problema_tecnico"
                ? "Área/serviço afetado, ticket relacionado se existir"
                : "O que está aguardando aprovação e de quem"
            }
            className="w-full resize-none rounded-md border border-input bg-background px-2 py-1.5 text-xs outline-none focus:border-ring focus:ring-1 focus:ring-ring"
          />
        </label>
      )}

      <label className="block space-y-1">
        <span className="text-[11px] font-medium text-muted-foreground">
          Previsão de resolução (opcional)
        </span>
        <input
          type="datetime-local"
          value={expectedResolutionAt}
          onChange={(e) => setExpectedResolutionAt(e.target.value)}
          className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs outline-none focus:border-ring focus:ring-1 focus:ring-ring"
        />
        {!expectedResolutionAt && (
          <span className="text-[10.5px] text-muted-foreground">
            Sem previsão, este bloqueio será sinalizado para acompanhamento.
          </span>
        )}
      </label>

      <div className="rounded-md bg-muted/50 px-2.5 py-2 text-[11px] text-muted-foreground">
        {pausesPreview
          ? "Seu prazo será pausado a partir de agora. Atrasos anteriores permanecem contabilizados."
          : "Este motivo não pausa automaticamente o prazo."}
        {needsMember && selectedMember && (
          <>
            {" "}
            {selectedMember.name} receberá uma pendência
            {expectedResolutionAt
              ? ` até ${new Date(expectedResolutionAt).toLocaleDateString("pt-BR")}`
              : ""}
            .
          </>
        )}
      </div>

      <div className="flex justify-end gap-2 pt-0.5">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted disabled:opacity-50"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={confirm}
          disabled={!fieldsValid || busy}
          className="rounded-md bg-amber-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50"
        >
          {busy ? "Bloqueando..." : "Confirmar bloqueio"}
        </button>
      </div>
    </div>
  );
}

/**
 * Questionário de resolução — mesma família visual/comportamental dos
 * dois acima. `newStatus` sempre um dos `TASK_STATUSES` reais (nunca
 * "Bloqueada" de novo, senão a resolução não resolveria nada).
 */
function ResolveBlockForm({
  busy,
  onConfirm,
  onCancel,
  onDirtyChange,
}: {
  busy: boolean;
  onConfirm: (fields: ResolveFormFields) => void;
  onCancel: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const [resolutionNote, setResolutionNote] = useState("");
  const [newStatus, setNewStatus] = useState<TaskStatus>("Em andamento");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const resolvableStatuses = TASK_STATUSES.filter((s) => s !== "Bloqueada");

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  useEffect(() => {
    onDirtyChange?.(resolutionNote.trim().length > 0);
    return () => onDirtyChange?.(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolutionNote]);

  const valid = resolutionNote.trim().length >= 5;

  return (
    <div className="space-y-2.5 rounded-lg border border-emerald-500/30 bg-background p-3">
      <div>
        <p className="text-xs font-semibold text-foreground">Resolver bloqueio</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          Descreva como o impedimento foi resolvido e o novo status da tarefa. O prazo retoma a
          contagem a partir de agora.
        </p>
      </div>
      <label className="block space-y-1">
        <span className="text-[11px] font-medium text-muted-foreground">Nota de resolução</span>
        <textarea
          ref={textareaRef}
          value={resolutionNote}
          onChange={(e) => setResolutionNote(e.target.value)}
          rows={2}
          placeholder="Ex.: briefing enviado pelo cliente"
          className="w-full resize-none rounded-md border border-input bg-background px-2 py-1.5 text-xs outline-none focus:border-ring focus:ring-1 focus:ring-ring"
        />
      </label>
      <label className="block space-y-1">
        <span className="text-[11px] font-medium text-muted-foreground">Novo status</span>
        <select
          value={newStatus}
          onChange={(e) => setNewStatus(e.target.value as TaskStatus)}
          className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs outline-none focus:border-ring focus:ring-1 focus:ring-ring"
        >
          {resolvableStatuses.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
      <div className="flex justify-end gap-2 pt-0.5">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted disabled:opacity-50"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={() => valid && onConfirm({ resolutionNote: resolutionNote.trim(), newStatus })}
          disabled={!valid || busy}
          className="rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {busy ? "Resolvendo..." : "Resolver e retomar tarefa"}
        </button>
      </div>
    </div>
  );
}
