import { useMemo, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  TaskDeadlineBadge,
  TaskPriorityFlag,
  deadlineViewFromDashTask,
} from "@/components/tasks/task-ui";
import { OPEN_STATUSES } from "@/lib/score";
import { TASK_STATUS_DOT, type TaskStatus } from "@/lib/task-status";
import { BUCKET_ORDER, type DashTask, type DashTaskFlat } from "@/lib/task-aggregation";
import type { Member } from "@/components/TimeSection";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { TASK_BLOCK_CATEGORY_LABEL } from "@/lib/task-blocks-rules";
import { isBlocked } from "@/components/time-v2/member-metrics";
import { cn } from "@/lib/utils";
import { avatarAccent, initialsOf } from "./member-ui";

export type AttentionTab = "atrasadas" | "hoje" | "bloqueadas";

const TAB_DEFS: { key: AttentionTab; label: string }[] = [
  { key: "atrasadas", label: "Atrasadas" },
  { key: "hoje", label: "Vencem hoje" },
  { key: "bloqueadas", label: "Bloqueadas" },
];

const EMPTY_MESSAGE: Record<AttentionTab, string> = {
  atrasadas: "Nenhuma tarefa atrasada.",
  hoje: "Nada vencendo hoje.",
  bloqueadas: "Nenhuma tarefa bloqueada.",
};

const LIMIT = 8;

export function matchesTab(t: DashTaskFlat, tab: AttentionTab): boolean {
  if (!OPEN_STATUSES.has(t.status)) return false;
  if (tab === "bloqueadas") return isBlocked(t);
  if (tab === "atrasadas") return t.bucket === "atrasada";
  return t.bucket === "hoje";
}

/** Contagem por aba (só abertas) — alimenta os rótulos e o vazio. */
export function attentionCounts(tasks: DashTaskFlat[]): Record<AttentionTab, number> {
  return {
    atrasadas: tasks.filter((t) => matchesTab(t, "atrasadas")).length,
    hoje: tasks.filter((t) => matchesTab(t, "hoje")).length,
    bloqueadas: tasks.filter((t) => matchesTab(t, "bloqueadas")).length,
  };
}

/**
 * "Precisa de atenção": só o que exige ação — atrasadas, vencem hoje e bloqueadas. Uma linha por
 * tarefa: [foto] título / responsável · cliente · projeto, e à direita o prazo e o status (texto com
 * a cor própria). Prioridade só aparece quando não é Normal. Clicar abre a tarefa.
 */
export function AttentionTasks({
  tasks,
  members,
  activeTab,
  onTabChange,
  onOpenTask,
  context,
}: {
  tasks: DashTaskFlat[];
  members: Member[];
  activeTab: AttentionTab;
  onTabChange: (tab: AttentionTab) => void;
  onOpenTask: (t: DashTask) => void;
  /** "Cliente · Projeto" da tarefa. */
  context: (t: DashTaskFlat) => string;
}) {
  const [all, setAll] = useState(false);
  const counts = useMemo(() => attentionCounts(tasks), [tasks]);
  const filtered = useMemo(
    () =>
      tasks
        .filter((t) => matchesTab(t, activeTab))
        .sort(
          (a, b) => BUCKET_ORDER[a.bucket] - BUCKET_ORDER[b.bucket] || a.due.localeCompare(b.due),
        ),
    [tasks, activeTab],
  );
  const visible = all ? filtered : filtered.slice(0, LIMIT);
  const findMember = (name: string) => members.find((m) => m.name === name);

  return (
    <section aria-label="Precisa de atenção" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-[15px] font-semibold text-foreground">Precisa de atenção</h3>
        <SegmentedControl
          aria-label="Tipo de atenção"
          size="sm"
          value={activeTab}
          onChange={(v) => {
            setAll(false);
            onTabChange(v);
          }}
          options={TAB_DEFS.map((t) => ({
            value: t.key,
            label: counts[t.key] > 0 ? `${t.label} · ${counts[t.key]}` : t.label,
          }))}
        />
      </div>

      {filtered.length === 0 ? (
        <p className="py-3 text-sm text-text-secondary">{EMPTY_MESSAGE[activeTab]}</p>
      ) : (
        <>
          <ul className="-mx-2 divide-y divide-border/50">
            {visible.map((t) => {
              const assignees = t.assignees.length ? t.assignees : ["Sem responsável"];
              const status = t.status as TaskStatus;
              const sub = [
                t.blockCategory ? TASK_BLOCK_CATEGORY_LABEL[t.blockCategory] : null,
                assignees.join(", "),
                context(t),
              ]
                .filter(Boolean)
                .join(" · ");
              return (
                <li key={`${t.projectId}_${t.id}`}>
                  <button
                    type="button"
                    onClick={() => onOpenTask(t)}
                    className="group flex w-full items-center gap-3 rounded-md px-2 py-2.5 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <div className="flex shrink-0 -space-x-1.5">
                      {assignees.slice(0, 2).map((name) => {
                        const member = findMember(name);
                        return (
                          <Avatar
                            key={name}
                            className="h-7 w-7 shrink-0 ring-2 ring-background"
                            title={name}
                          >
                            {member?.photo && <AvatarImage src={member.photo} alt="" />}
                            <AvatarFallback
                              className={`text-[11px] ${avatarAccent(member?.id ?? name)}`}
                            >
                              {initialsOf(member?.name ?? "", name)}
                            </AvatarFallback>
                          </Avatar>
                        );
                      })}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="flex min-w-0 items-center gap-1.5 text-sm font-medium text-foreground group-hover:underline">
                        {t.parentTitle && (
                          <span className="inline-flex shrink-0 items-center rounded border border-border bg-muted/60 px-1 py-0.5 text-[11px] font-semibold uppercase leading-none tracking-wide text-text-secondary">
                            Sub
                          </span>
                        )}
                        <span className="truncate">{t.title}</span>
                      </p>
                      <p className="truncate text-xs text-text-secondary">{sub}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 sm:hidden">
                        <TaskDeadlineBadge view={deadlineViewFromDashTask(t)} size="xs" />
                        <span className="text-[11px] text-text-secondary">{t.status}</span>
                      </div>
                    </div>

                    <div className="hidden shrink-0 flex-col items-end gap-0.5 sm:flex">
                      <TaskDeadlineBadge view={deadlineViewFromDashTask(t)} size="xs" />
                      <span className="inline-flex items-center gap-1.5 text-[11px] text-text-secondary">
                        {t.priority && t.priority !== "Normal" && (
                          <TaskPriorityFlag priority={t.priority} size="xs" />
                        )}
                        <span
                          aria-hidden
                          className={cn(
                            "h-1.5 w-1.5 rounded-full",
                            TASK_STATUS_DOT[status] ?? "bg-muted-foreground/50",
                          )}
                        />
                        {t.status}
                      </span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
          {filtered.length > LIMIT && (
            <button
              type="button"
              onClick={() => setAll((v) => !v)}
              className="text-xs font-medium text-text-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {all ? "Ver menos" : `Ver todas (${filtered.length})`}
            </button>
          )}
        </>
      )}
    </section>
  );
}
