import { useState } from "react";
import { Lock } from "lucide-react";
import {
  TaskPriorityFlag,
  TaskStatusBadge,
  TaskStatusSelect,
  isTaskStatus,
} from "@/components/tasks/task-ui";
import { TASK_PRIORITIES, type TaskPriority } from "@/lib/task-status";
import { formatIsoDate } from "@/lib/utils";
import type { TaskDirectoryEntry } from "@/lib/task-directory";

export type ChatTaskInfo = TaskDirectoryEntry;

/** Card de tarefa mencionada (pedido do upgrade do Chat, seção 10) —
 * enriquecido com projeto/campanha, indicador de bloqueio e progresso de
 * subtarefas (`task-directory.ts`'s `updateTaskDirectoryStatus`, mesma
 * persistência já usada pelo board). "Alterar status" só aparece pra
 * tarefas de primeiro nível (subtarefas já têm seletor rico no próprio
 * modal — ver comentário em `updateTaskDirectoryStatus`). Nunca mostra a
 * descrição da tarefa aqui — só o card, texto da mensagem fica separado
 * (mensagem já renderiza à parte, acima).
 *
 * Extraído de `ChatSection.tsx` (era uma função local ali) pra ser
 * reaproveitado pelo Chat V2 sem duplicar comportamento — comportamento
 * visual/lógico preservado 1:1, só mudou de arquivo. */
export function TaskMentionCard({
  task,
  onOpen,
  onComment,
}: {
  task: ChatTaskInfo;
  onOpen: (id: string) => void;
  onComment?: (task: ChatTaskInfo) => void;
}) {
  const [status, setStatus] = useState(task.status);
  const subtaskPct =
    task.subtasksTotal && task.subtasksTotal > 0
      ? Math.round(((task.subtasksDone ?? 0) / task.subtasksTotal) * 100)
      : null;

  return (
    <div className="flex w-full max-w-[420px] flex-col gap-1.5 rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-xs">
      <button
        type="button"
        onClick={() => onOpen(task.id)}
        className="flex flex-col gap-1 text-left hover:opacity-80"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="min-w-0 truncate font-medium text-foreground">{task.label}</span>
          {isTaskStatus(status) ? (
            <TaskStatusBadge status={status} size="xs" />
          ) : (
            <span className="shrink-0 text-[11px] text-muted-foreground">{status}</span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
          {task.project && <span>{task.project}</span>}
          {task.assignees.length > 0 && <span>{task.assignees.join(", ")}</span>}
          {task.dueDate && <span>Prazo: {formatIsoDate(task.dueDate)}</span>}
          {task.priority && (TASK_PRIORITIES as string[]).includes(task.priority) && (
            <TaskPriorityFlag priority={task.priority as TaskPriority} size="xs" />
          )}
        </div>
        {task.blockedReason && (
          <div className="flex min-w-0 items-center gap-1 text-[11px] font-medium text-amber-800 dark:text-amber-300">
            <Lock aria-hidden className="h-3 w-3 shrink-0" />
            <span className="truncate">Bloqueada · {task.blockedReason}</span>
          </div>
        )}
        {subtaskPct !== null && (
          <div className="flex items-center gap-1.5">
            <div className="h-1 flex-1 rounded-full bg-muted">
              <div className="h-1 rounded-full bg-brand" style={{ width: `${subtaskPct}%` }} />
            </div>
            <span className="shrink-0 text-[11px] text-muted-foreground">
              {task.subtasksDone}/{task.subtasksTotal} subtarefas
            </span>
          </div>
        )}
      </button>
      <div className="flex items-center gap-1 border-t border-border/60 pt-1.5">
        {isTaskStatus(status) && (
          <TaskStatusSelect
            value={status}
            // Mesmas opções de antes: "Bloqueada" exige o questionário do
            // modal e "Arquivado" não é oferecido pelo chat.
            exclude={["Bloqueada", "Arquivado"]}
            onChange={(s) => {
              const previous = status;
              setStatus(s);
              void import("@/lib/task-directory").then(({ updateTaskDirectoryStatus }) => {
                if (!updateTaskDirectoryStatus(task, s)) setStatus(previous);
              });
            }}
            trigger={
              <button
                type="button"
                className="rounded px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                Alterar status
              </button>
            }
          />
        )}
        {onComment && (
          <button
            type="button"
            onClick={() => onComment(task)}
            className="rounded px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            Comentar
          </button>
        )}
      </div>
    </div>
  );
}
