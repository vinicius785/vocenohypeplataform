import { formatDateToIso } from "@/lib/utils";

export type TaskRecurrenceUnit = "dias" | "semanas" | "meses";

export type TaskRecurrence = {
  /** A cada quantas unidades repetir (>= 1). Ignorado quando `weekdays`
   * está preenchido (ver `computeNextRecurrenceDueDate`). */
  interval: number;
  unit: TaskRecurrenceUnit;
  /** Só relevante quando `unit === "semanas"`: em quais dias da semana
   * repetir (0=domingo...6=sábado). Vazio/undefined = repete no mesmo
   * dia da semana em que a tarefa foi concluída, a cada `interval`
   * semanas. */
  weekdays?: number[];
};

export const RECURRENCE_UNIT_LABEL: Record<
  TaskRecurrenceUnit,
  { singular: string; plural: string }
> = {
  dias: { singular: "dia", plural: "dias" },
  semanas: { singular: "semana", plural: "semanas" },
  meses: { singular: "mês", plural: "meses" },
};

export const WEEKDAY_SHORT_LABELS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

function addMonths(base: Date, months: number): Date {
  const d = new Date(base);
  const day = d.getDate();
  d.setDate(1); // evita "vazar" de mês ao incrementar (ex. 31 jan + 1 mês)
  d.setMonth(d.getMonth() + months);
  const lastDayOfTargetMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, lastDayOfTargetMonth));
  return d;
}

function localDateOnly(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Próxima data de vencimento a partir da conclusão de um ciclo — a
 * tarefa recorrente nunca duplica: o mesmo registro volta pro início do
 * kanban com este novo prazo (ver `applyRecurrenceIfCompleted` em
 * `TaskBoard.tsx`). `fromISO` é o timestamp exato de conclusão
 * (`completedAt`); o cálculo sempre opera em dias de calendário locais,
 * nunca UTC. */
export function computeNextRecurrenceDueDate(fromISO: string, rule: TaskRecurrence): string {
  const base = localDateOnly(new Date(fromISO));
  const interval = Math.max(1, Math.floor(rule.interval) || 1);

  if (rule.unit === "dias") return formatDateToIso(addDays(base, interval));
  if (rule.unit === "meses") return formatDateToIso(addMonths(base, interval));

  // "semanas": com dias específicos marcados, repete toda semana nesses
  // dias (o multiplicador `interval` não se combina com dias específicos
  // nesta v1 — "a cada 2 semanas nas segundas E quartas" fica de fora,
  // documentado como fora de escopo). Sem dias marcados, é o caso
  // simples: a cada `interval` semanas, no mesmo dia da semana.
  if (rule.weekdays && rule.weekdays.length > 0) {
    let candidate = addDays(base, 1);
    for (let i = 0; i < 7; i++) {
      if (rule.weekdays.includes(candidate.getDay())) break;
      candidate = addDays(candidate, 1);
    }
    return formatDateToIso(candidate);
  }
  return formatDateToIso(addDays(base, interval * 7));
}

/** Resumo curto pra exibir junto do prazo (ex. "A cada 2 semanas", "Toda
 * seg, qua, sex", "Todo mês"). */
export function describeRecurrence(rule: TaskRecurrence): string {
  if (rule.unit === "semanas" && rule.weekdays && rule.weekdays.length > 0) {
    const days = [...rule.weekdays].sort().map((d) => WEEKDAY_SHORT_LABELS[d]);
    return `Toda ${days.join(", ")}`;
  }
  const label = RECURRENCE_UNIT_LABEL[rule.unit];
  if (rule.interval <= 1) return `Todo(a) ${label.singular}`;
  return `A cada ${rule.interval} ${label.plural}`;
}
