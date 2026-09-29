import { useState } from "react";
import { Lock } from "lucide-react";
import { formatIsoDate } from "@/lib/utils";
import type { TaskDirectoryEntry } from "@/lib/task-directory";

export type ChatTaskInfo = TaskDirectoryEntry;

const CHAT_TASK_STATUS_TONE: Record<string, string> = {
  Aberto: "bg-muted text-muted-foreground",
  "Em andamento": "bg-sky-500/15 text-sky-700 dark:text-sky-400",
  "Em aprovação": "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  "Em ajustes": "bg-orange-500/15 text-orange-700 dark:text-orange-400",
  Aprovado: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  Concluído: "bg-foreground text-background",
  Arquivado: "bg-muted/60 text-muted-foreground line-through",
};
const CHAT_TASK_PRIORITY_TONE: Record<string, string> = {
  Urgente: "text-red-600 dark:text-red-400",
  Alta: "text-amber-600 dark:text-amber-400",
  Normal: "text-sky-600 dark:text-sky-400",
  Baixa: "text-muted-foreground",
};

const CHAT_TASK_STATUS_OPTIONS = [
  "Aberto",
  "Em andamento",
  "Em aprovação",
  "Em ajustes",
  "Aprovado",
  "Concluído",
] as const;

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
  const [statusOpen, setStatusOpen] = useState(false);
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
          <span
            className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${
              CHAT_TASK_STATUS_TONE[status] ?? "bg-muted text-muted-foreground"
            }`}
          >
            {status}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
          {task.project && <span>{task.project}</span>}
          {task.assignees.length > 0 && <span>{task.assignees.join(", ")}</span>}
          {task.dueDate && <span>Prazo: {formatIsoDate(task.dueDate)}</span>}
          {task.priority && (
            <span className={CHAT_TASK_PRIORITY_TONE[task.priority] ?? undefined}>
              {task.priority}
            </span>
          )}
        </div>
        {task.blockedReason && (
          <div className="flex items-center gap-1 text-[11px] font-medium text-amber-700 dark:text-amber-400">
            <Lock className="h-3 w-3" /> Bloqueada · {task.blockedReason}
          </div>
        )}
        {subtaskPct !== null && (
          <div className="flex items-center gap-1.5">
            <div className="h-1 flex-1 rounded-full bg-muted">
              <div className="h-1 rounded-full bg-brand" style={{ width: `${subtaskPct}%` }} />
            </div>
            <span className="shrink-0 text-[10px] text-muted-foreground">
              {task.subtasksDone}/{task.subtasksTotal} subtarefas
            </span>
          </div>
        )}
      </button>
      <div className="flex items-center gap-1 border-t border-border/60 pt-1.5">
        <div className="relative">
          <button
            type="button"
            onClick={() => setStatusOpen((v) => !v)}
            className="rounded px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            Alterar status
          </button>
          {statusOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setStatusOpen(false)} />
              <div className="absolute bottom-full left-0 z-40 mb-1 w-40 rounded-md border border-border bg-background p-1 shadow-lg">
                {CHAT_TASK_STATUS_OPTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => {
                      const previous = status;
                      setStatus(s);
                      setStatusOpen(false);
                      void import("@/lib/task-directory").then(({ updateTaskDirectoryStatus }) => {
                        if (!updateTaskDirectoryStatus(task, s)) setStatus(previous);
                      });
                    }}
                    className="flex w-full items-center rounded px-2 py-1 text-left text-xs hover:bg-muted"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
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
