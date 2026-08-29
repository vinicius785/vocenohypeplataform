import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronUp,
  CircleDashed,
  CornerUpRight,
  Undo2,
  User as UserIcon,
} from "lucide-react";
import {
  Avatar,
  formatWhen,
  fmtDate,
  renderMentions,
  DEADLINE_CHANGE_MOTIVO_LABEL,
  type Activity,
  type ActivityKind,
  type Comment,
  type DeadlineChangeEntry,
  type Member,
} from "@/components/tasks/TaskBoard";
import { ACTIVITY_STATUS_COMPLETED_ACTION } from "@/lib/projetos";
import { taskDeadlineHealth, type TaskDeadlineHealthLike } from "@/lib/performance-engine";

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
}) {
  const [tab, setTab] = useState<ActivityTab>("tudo");
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

      // "deadline"-kind entries e `task.deadlineHistory` são sempre
      // criados 1:1 no mesmo bloco de `save()` — casar por ORDEM
      // cronológica (não por timestamp exato, frágil) é seguro.
      const deadlineActivities = important
        .filter((a) => a.effectiveKind === "deadline")
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      const deadlineEntries = [...(task.deadlineHistory ?? [])].sort((a, b) =>
        a.changedAt.localeCompare(b.changedAt),
      );
      const deadlineByActivityId = new Map<string, DeadlineChangeEntry>();
      deadlineActivities.forEach((a, i) => {
        if (deadlineEntries[i]) deadlineByActivityId.set(a.id, deadlineEntries[i]);
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

  const health = taskDeadlineHealth(task);

  return (
    <div className="flex min-h-0 flex-col border-l border-border bg-muted/20">
      <div className="border-b border-border px-4 py-2.5">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-semibold">Activity</p>
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

      <div className="flex-1 overflow-y-auto px-4 py-3">
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
                            Motivo: {DEADLINE_CHANGE_MOTIVO_LABEL[f.deadlineEntry.motivo]}
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
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-semibold ${m.color}`}
                >
                  {m.initials}
                </span>
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
