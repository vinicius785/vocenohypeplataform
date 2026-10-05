import { useEffect, useState } from "react";
import { Play, Square } from "lucide-react";
import {
  TaskDeadlineBadge,
  TaskPriorityFlag,
  TaskStatusSelect,
  deadlineViewFromDashTask,
  isTaskStatus,
} from "@/components/tasks/task-ui";
import type { TaskStatus } from "@/lib/task-status";
import type { DashTask } from "@/lib/task-aggregation";
import { formatClock } from "@/lib/home-work";
import { cn } from "@/lib/utils";

/** Relógio que gira sozinho (1 s) — só existe enquanto a linha tem cronômetro rodando. */
function ElapsedClock({ startedAt }: { startedAt: string }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const iv = window.setInterval(() => tick((n) => n + 1), 1000);
    return () => window.clearInterval(iv);
  }, []);
  return <>{formatClock((Date.now() - Date.parse(startedAt)) / 1000)}</>;
}

/**
 * Uma tarefa em "Meu trabalho": [status] Título / Cliente · Projeto, e à direita prioridade, prazo
 * e o cronômetro. Status e cronômetro agem direto (sem abrir a tarefa); o resto da linha abre.
 */
export function WorkTaskRow({
  task,
  context,
  timerStartedAt,
  leaving,
  onOpen,
  onStatus,
  onTimerStart,
  onTimerStop,
}: {
  task: DashTask;
  context: string;
  /** Preenchido quando o cronômetro rodando é desta tarefa. */
  timerStartedAt: string | null;
  /** Concluída agora: fica um instante riscada antes de sair da lista. */
  leaving?: boolean;
  onOpen: () => void;
  onStatus: (next: TaskStatus) => void;
  onTimerStart: () => void;
  onTimerStop: () => void;
}) {
  const status: TaskStatus = isTaskStatus(task.status) ? task.status : "Aberto";
  const canStart = !timerStartedAt && status === "Em andamento";
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className={cn(
        "group flex w-full cursor-pointer flex-wrap items-start gap-x-3 gap-y-1 px-4 py-2.5 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset md:px-5",
        leaving && "bg-muted/30",
      )}
    >
      <span
        className="mt-0.5 shrink-0"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <TaskStatusSelect
          value={status}
          variant="icon"
          onChange={onStatus}
          onSelectBlocked={() => onStatus("Bloqueada")}
        />
      </span>

      <div className="min-w-0 flex-1 basis-[14rem]">
        <p
          className={cn(
            "flex min-w-0 items-center gap-1.5 text-sm font-medium text-foreground group-hover:underline",
            leaving && "text-muted-foreground line-through",
          )}
          title={task.title}
        >
          {task.parentTitle && (
            <span
              title={`Subtarefa de "${task.parentTitle}"`}
              className="inline-flex shrink-0 items-center rounded-full border border-border bg-muted/60 px-1.5 py-0.5 text-[11px] font-semibold uppercase leading-none tracking-wide text-muted-foreground"
            >
              Sub
            </span>
          )}
          <span className="truncate">{task.title}</span>
        </p>
        {context && (
          <p className="truncate text-xs text-text-secondary" title={context}>
            {context}
          </p>
        )}
      </div>

      <div className="flex basis-full flex-wrap items-center gap-x-3 gap-y-1 pl-8 sm:basis-auto sm:shrink-0 sm:pl-0">
        <TaskPriorityFlag priority={task.priority ?? "Normal"} size="xs" />
        <TaskDeadlineBadge view={deadlineViewFromDashTask(task)} size="xs" />
        {timerStartedAt ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onTimerStop();
            }}
            aria-label="Parar cronômetro"
            title="Parar cronômetro"
            className="inline-flex items-center gap-1 rounded px-1 py-0.5 text-[11px] font-medium tabular-nums text-text-brand hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Square className="h-3 w-3 fill-current" />
            <ElapsedClock startedAt={timerStartedAt} />
          </button>
        ) : canStart ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onTimerStart();
            }}
            aria-label="Iniciar cronômetro"
            title="Iniciar cronômetro"
            className="inline-flex items-center rounded p-1 text-text-secondary hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Play className="h-3 w-3 fill-current" />
          </button>
        ) : null}
      </div>
    </div>
  );
}
