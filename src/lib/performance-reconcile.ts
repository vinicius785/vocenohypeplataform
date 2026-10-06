import {
  DEADLINE_CUTOFF_HOUR,
  classifyOutcome,
  isCriticalReplan,
  reconcilePerformanceReference,
  type DeadlineHistoryEntryLike,
  type PerformanceEventLike,
  type TaskOutcome,
} from "@/lib/performance-engine";

/**
 * Reconciliação de LEITURA do ledger com a regra de prazo vigente. Os eventos gravados nunca são
 * alterados (o histórico continua dizendo o que aconteceu); ao ler, `task_deadline_changed` ganha a
 * criticidade da regra atual (crítico = o prazo anterior JÁ havia expirado) e `task_completed`
 * ganha o resultado medido contra o PRAZO VIGENTE da época, derivado do histórico de prazos da
 * própria tarefa. Tarefa que não existe mais, ou sem histórico de prazos, mantém o evento como
 * gravado.
 */
export type TaskDeadlineSource = {
  originalDueDate?: string;
  dueDate?: string;
  deadlineHistory?: DeadlineHistoryEntryLike[];
};

export function reconcileLedgerEvents<E extends PerformanceEventLike>(
  events: E[],
  lookup: (taskId: string) => TaskDeadlineSource | undefined,
  cutoffHour: number = DEADLINE_CUTOFF_HOUR,
): E[] {
  return events.map((e) => {
    if (e.eventType === "task_deadline_changed") {
      const from = e.data.from as string | undefined;
      if (!from) return e;
      const critical = isCriticalReplan(from, e.occurredAt, cutoffHour);
      return !!e.data.isCritical === critical
        ? e
        : { ...e, data: { ...e.data, isCritical: critical } };
    }
    if (e.eventType !== "task_completed" || !e.taskId) return e;
    const stored = e.data.performanceDueDateUsed as string | null | undefined;
    if (stored == null) return e;
    const task = lookup(e.taskId);
    const history = (task?.deadlineHistory ?? []).filter(
      (h) => !h.changedAt || h.changedAt <= e.occurredAt,
    );
    if (!task || history.length === 0) return e;
    const ref = reconcilePerformanceReference({
      stored,
      originalDueDate: task.originalDueDate ?? task.dueDate,
      deadlineHistory: history,
      cutoffHour,
    });
    if (!ref || ref === stored) return e;
    const { outcome, delayMinutes } = classifyOutcome(ref, e.occurredAt, cutoffHour);
    return {
      ...e,
      data: {
        ...e.data,
        outcome: outcome as TaskOutcome,
        delayMinutes,
        performanceDueDateUsed: ref,
      },
    };
  });
}
