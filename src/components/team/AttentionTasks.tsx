import { useMemo } from "react";
import { AlertTriangle } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { TASK_STATUS_TONE, TASK_STATUS_DOT, PRIORITY_TONE } from "@/components/tasks/TaskBoard";
import { OPEN_STATUSES } from "@/lib/score";
import { BUCKET_ORDER, type DashTask, type DashTaskFlat } from "@/lib/task-aggregation";
import type { Member } from "@/components/TimeSection";
import { avatarAccent, initialsOf } from "./member-ui";

export type AttentionTab = "atrasadas" | "hoje" | "semana";

const TAB_DEFS: { key: AttentionTab; label: string }[] = [
  { key: "atrasadas", label: "Atrasadas" },
  { key: "hoje", label: "Hoje" },
  { key: "semana", label: "Esta semana" },
];

const EMPTY_MESSAGE: Record<AttentionTab, string> = {
  atrasadas: "Não há tarefas atrasadas 🎉",
  hoje: "Nada vencendo hoje.",
  semana: "Nada previsto pra esta semana.",
};

function matchesTab(t: DashTaskFlat, tab: AttentionTab): boolean {
  if (!OPEN_STATUSES.has(t.status)) return false;
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
    <div className="flex h-full flex-col rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Tarefas que precisam de atenção
        </h3>
        <div className="flex items-center gap-1 rounded-lg border border-border p-0.5">
          {TAB_DEFS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => onTabChange(tab.key)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                activeTab === tab.key
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 min-h-0 flex-1">
        {filtered.length === 0 ? (
          <p className="flex h-full items-center justify-center py-8 text-center text-sm text-muted-foreground">
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
                              className={`text-[10px] ${avatarAccent(member?.id ?? name)}`}
                            >
                              {initialsOf(member?.name ?? "", name)}
                            </AvatarFallback>
                          </Avatar>
                        );
                      })}
                      {assignees.length > 3 && (
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[9px] font-medium text-muted-foreground ring-2 ring-card">
                          +{assignees.length - 3}
                        </span>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="flex min-w-0 items-center gap-1.5 truncate text-sm text-foreground group-hover:underline">
                        {t.parentTitle && (
                          <span className="inline-flex shrink-0 items-center rounded border border-border bg-muted/60 px-1 py-0.5 text-[9px] font-semibold uppercase leading-none tracking-wide text-muted-foreground">
                            Sub
                          </span>
                        )}
                        <span className="truncate">{t.title}</span>
                      </p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {assignees.join(", ")} · {t.projectName}
                      </p>
                    </div>

                    {t.priority && (
                      <span
                        className={`hidden shrink-0 text-[11px] font-semibold sm:inline ${PRIORITY_TONE[t.priority]}`}
                      >
                        {t.priority}
                      </span>
                    )}

                    <span
                      className={`hidden shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide md:inline-flex ${TASK_STATUS_TONE[t.status]}`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${TASK_STATUS_DOT[t.status]}`} />
                      {t.status}
                    </span>

                    <span
                      className={`shrink-0 text-xs tabular-nums ${
                        t.bucket === "atrasada" ? "text-destructive" : "text-muted-foreground"
                      }`}
                    >
                      {t.due}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {activeTab === "atrasadas" && filtered.length > 0 && (
        <p className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <AlertTriangle className="h-3 w-3 text-destructive" />
          Tarefas atrasadas pesam negativo na pontuação de quem está com elas em aberto.
        </p>
      )}
    </div>
  );
}
