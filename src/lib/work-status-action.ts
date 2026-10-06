import { pendingDependencyCount, statusGate } from "@/lib/home-work";
import type { DashTask } from "@/lib/task-aggregation";
import type { TaskDependency } from "@/lib/task-dependencies-store";
import type { StatusChangeContext } from "@/lib/task-status-change";
import { changeTaskStatus } from "@/lib/task-status-change";
import type { TaskStatus } from "@/lib/task-status";

/**
 * Mudança de status de uma tarefa a partir de uma LISTA (Início "Meu trabalho", perfil do membro):
 * aplica as mesmas travas do detalhe da tarefa (bloqueio abre a tarefa; dependência pendente
 * impede "Em andamento" e pede confirmação para concluir) e depois o pipeline oficial
 * `changeTaskStatus` — o único que também liga/desliga o cronômetro. Extraído do Início sem mudar
 * comportamento, para os dois lugares nunca divergirem.
 */
export async function runWorkStatusChange(args: {
  task: DashTask;
  next: TaskStatus;
  allDeps: readonly TaskDependency[];
  /** Status atual de uma tarefa pelo id real (sem prefixo "mkt:"). */
  statusOf: (rawId: string) => string | undefined;
  ctx: StatusChangeContext;
  confirm: (
    message: string,
    options?: { title?: string; confirmLabel?: string },
  ) => Promise<boolean>;
  openTask: (t: DashTask) => void;
  notifyError: (message: string) => void;
}): Promise<{ ok: boolean; completed: boolean }> {
  const { task: t, next } = args;
  const raw = t.id.replace(/^mkt:/, "");
  const hasDeps = args.allDeps.some((d) => d.blockedTaskId === raw);
  const pending = hasDeps ? pendingDependencyCount(raw, args.allDeps, args.statusOf) : 0;
  const gate = statusGate(t.status, next, pending);
  if (gate === "noop") return { ok: false, completed: false };
  if (gate === "open-task") {
    args.openTask(t);
    return { ok: false, completed: false };
  }
  if (gate === "blocked-by-dependency") {
    args.notifyError("Esta tarefa depende de outra ainda não concluída.");
    return { ok: false, completed: false };
  }
  if (gate === "confirm-complete") {
    const yes = await args.confirm(
      "Esta tarefa depende de outra ainda não concluída. Concluir mesmo assim?",
      { title: "Concluir tarefa?", confirmLabel: "Concluir" },
    );
    if (!yes) return { ok: false, completed: false };
  }
  const res = changeTaskStatus(t, next, args.ctx);
  if (!res.ok) args.notifyError("Não foi possível alterar o status desta tarefa.");
  return res;
}
