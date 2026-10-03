import { useMemo } from "react";
import { AlertTriangle } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  TaskDeadlineBadge,
  TaskPriorityFlag,
  TaskStatusBadge,
  deadlineViewFromDashTask,
} from "@/components/tasks/task-ui";
import { OPEN_STATUSES } from "@/lib/score";
import { BUCKET_ORDER, type DashTask, type DashTaskFlat } from "@/lib/task-aggregation";
import type { Member } from "@/components/TimeSection";
import { avatarAccent, initialsOf } from "./member-ui";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { TASK_BLOCK_CATEGORY_LABEL } from "@/lib/task-blocks-rules";
import { isBlocked } from "@/components/time-v2/member-metrics";

export type AttentionTab = "atrasadas" | "hoje" | "semana" | "bloqueadas";

const TAB_DEFS: { key: AttentionTab; label: string }[] = [
  { key: "atrasadas", label: "Atrasadas" },
  { key: "hoje", label: "Hoje" },
  { key: "semana", label: "Esta semana" },
  { key: "bloqueadas", label: "Bloqueadas" },
];

const EMPTY_MESSAGE: Record<AttentionTab, string> = {
  atrasadas: "Não há tarefas atrasadas 🎉",
  hoje: "Nada vencendo hoje.",
  semana: "Nada previsto pra esta semana.",
  bloqueadas: "Nenhuma tarefa bloqueada.",
};

function matchesTab(t: DashTaskFlat, tab: AttentionTab): boolean {
  if (!OPEN_STATUSES.has(t.status)) return false;
  if (tab === "bloqueadas") return isBlocked(t);
  if (tab === "atrasadas") return t.bucket === "atrasada";
  if (tab === "hoje") return t.bucket === "hoje";
  return t.bucket === "hoje" || t.bucket === "amanha" || t.bucket === "semana";
}

/** Painel "Tarefas que precisam de atenção" — substitui o antigo
 * `TeamTasksPanel` (só hoje/atrasadas, sem responsável de verdade e sem
 * prioridade). Uma tabela compacta por aba, com todos os responsáveis de
 * cada tarefa (avatares empilhados) e clique abrindo a tarefa pelo mesmo
 * deep-link já usado no resto do app. */
export function AttentionTasks({
  tasks,
  members,
  activeTab,
  onTabChange,
  onOpenTask,
}: {
  tasks: DashTaskFlat[];
  members: Member[];
  activeTab: AttentionTab;
  onTabChange: (tab: AttentionTab) => void;
  onOpenTask: (t: DashTask) => void;
}) {
  const filtered = useMemo(
    () =>
      tasks
        .filter((t) => matchesTab(t, activeTab))
        .sort(
          (a, b) => BUCKET_ORDER[a.bucket] - BUCKET_ORDER[b.bucket] || a.due.localeCompare(b.due),
        ),
    [tasks, activeTab],
  );
  const findMember = (name: string) => members.find((m) => m.name === name);

  return (
    <div className="surface-card flex h-full flex-col p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-[15px] font-semibold text-foreground">
          Tarefas que precisam de atenção
        </h3>
        <SegmentedControl
          aria-label="Filtro de tarefas por prazo"
          size="sm"
          value={activeTab}
          onChange={onTabChange}
          options={TAB_DEFS.map((t) => ({ value: t.key, label: t.label }))}
        />
      </div>

      <div className="mt-3 min-h-0 flex-1">
        {filtered.length === 0 ? (
          <p className="flex h-full items-center justify-center py-8 text-center text-sm text-text-secondary">
            {EMPTY_MESSAGE[activeTab]}
          </p>
        ) : (
          <ul className="max-h-[420px] divide-y divide-border overflow-y-auto">
            {filtered.map((t) => {
              const assignees = t.assignees.length ? t.assignees : ["Sem responsável"];
              return (
                <li key={`${t.projectId}_${t.id}`}>
                  <button
                    type="button"
                    onClick={() => onOpenTask(t)}
                    className="group flex w-full items-center gap-3 px-1 py-2.5 text-left hover:bg-muted/40"
                  >
                    <div className="flex shrink-0 -space-x-1.5">
                      {assignees.slice(0, 3).map((name) => {
                        const member = findMember(name);
                        return (
                          <Avatar
                            key={name}
                            className="h-6 w-6 shrink-0 ring-2 ring-card"
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
                      {assignees.length > 3 && (
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[11px] font-medium text-text-secondary ring-2 ring-card">
                          +{assignees.length - 3}
                        </span>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="flex min-w-0 items-center gap-1.5 truncate text-sm text-foreground group-hover:underline">
                        {t.parentTitle && (
                          <span className="inline-flex shrink-0 items-center rounded border border-border bg-muted/60 px-1 py-0.5 text-[11px] font-semibold uppercase leading-none tracking-wide text-text-secondary">
                            Sub
                          </span>
                        )}
                        <span className="truncate">{t.title}</span>
                      </p>
                      <p className="truncate text-[11px] text-text-secondary">
                        {t.blockCategory && `${TASK_BLOCK_CATEGORY_LABEL[t.blockCategory]} · `}
                        {assignees.join(", ")} · {t.projectName}
                      </p>
                    </div>

                    {t.priority && t.priority !== "Normal" && (
                      <TaskPriorityFlag
                        priority={t.priority}
                        size="xs"
                        className="hidden sm:inline-flex"
                      />
                    )}

                    <TaskStatusBadge
                      status={t.status}
                      size="xs"
                      className="hidden md:inline-flex"
                    />

                    <TaskDeadlineBadge view={deadlineViewFromDashTask(t)} size="xs" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {activeTab === "atrasadas" && filtered.length > 0 && (
        <p className="mt-3 flex items-center gap-1.5 text-[11px] text-text-secondary">
          <AlertTriangle className="h-3 w-3 text-destructive" />
          Atrasadas pesam no Score de quem é responsável — exceto as bloqueadas aguardando cliente
          ou fornecedor.
        </p>
      )}
    </div>
  );
}
