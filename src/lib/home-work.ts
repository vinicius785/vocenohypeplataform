import type { DashTask } from "@/lib/task-aggregation";
import type { TimeEntry } from "@/lib/time-entries";
import { statusTargetOrigin } from "@/lib/task-status-change";

/** Regras PURAS do bloco "Meu trabalho" do Início (sem UI). */

/** "Cliente · Projeto", sem rótulos repetidos. Campanha: cliente · campanha; projeto: nome do
 * projeto; Marketing: "Marketing". Só cliente → só o cliente. */
export function workContextLabel(
  task: Pick<DashTask, "campanhaId" | "projectName">,
  clienteByCampanha: ReadonlyMap<string, string>,
): string {
  const project = task.projectName?.trim();
  const cliente = task.campanhaId ? clienteByCampanha.get(task.campanhaId)?.trim() : undefined;
  return [cliente, project].filter(Boolean).join(" · ");
}

/** A entrada de cronômetro rodando é desta tarefa? (id cru + origem) */
export function timerMatchesTask(
  task: Pick<DashTask, "id" | "projectId" | "campanhaId" | "parentId" | "comercial">,
  entry: Pick<TimeEntry, "taskId" | "taskOrigin"> | null | undefined,
): boolean {
  if (!entry || task.comercial) return false;
  return (
    entry.taskId === task.id.replace(/^mkt:/, "") && entry.taskOrigin === statusTargetOrigin(task)
  );
}

/** 00:27:14 */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(h)}:${p(m)}:${p(sec)}`;
}

export type StatusGate =
  | "noop"
  /** Bloqueio/desbloqueio exige o questionário: abrir a tarefa em vez de contornar. */
  | "open-task"
  /** Dependência pendente impede "Em andamento". */
  | "blocked-by-dependency"
  /** Concluir com dependência pendente: só avisa, pede confirmação. */
  | "confirm-complete"
  | "apply";

/** O que a Home pode fazer ao escolher `next` para uma tarefa em `current` — mesmas regras do
 * diálogo da tarefa. */
export function statusGate(current: string, next: string, pendingDependencies: number): StatusGate {
  if (current === next) return "noop";
  if (next === "Bloqueada" || current === "Bloqueada") return "open-task";
  if (next === "Em andamento" && pendingDependencies > 0) return "blocked-by-dependency";
  if (next === "Concluído" && pendingDependencies > 0) return "confirm-complete";
  return "apply";
}

/** Quantas dependências da tarefa ainda não estão concluídas (mesmo critério do diálogo). */
export function pendingDependencyCount(
  rawTaskId: string,
  deps: readonly { blockedTaskId: string; blockingTaskId: string }[],
  statusOf: (rawId: string) => string | undefined,
): number {
  return deps.filter(
    (d) => d.blockedTaskId === rawTaskId && statusOf(d.blockingTaskId) !== "Concluído",
  ).length;
}
