import type { MemberInsightBundle } from "@/lib/insights-engine";
import { todayIsoInBrasilia } from "@/lib/timezone";
import type { MemberSignals } from "./team-insights-v2";

/**
 * Definições ÚNICAS das métricas que alimentam os Insights do Time (ver
 * `docs/development/metricas-time.md`). Nenhuma outra parte do código deve redefinir janela de
 * "30 dias", "tarefa nova" ou a identidade da pessoa.
 */

export type IsoRange = { from: string; to: string };

const iso = (y: number, m0: number, d: number) => {
  const dt = new Date(Date.UTC(y, m0, d));
  return dt.toISOString().slice(0, 10);
};
const shift = (todayIso: string, days: number) => {
  const [y, m, d] = todayIso.split("-").map(Number);
  return iso(y, m - 1, d + days);
};

/** Janela dos Insights: os 30 dias terminando HOJE (Brasília), inclusive, e os 30 anteriores —
 * contíguos e SEM sobreposição. Usada por conclusão no prazo, replanejamentos, reuniões, score,
 * tarefas novas e tempo de resposta. */
export function insightWindows(todayIso: string = todayIsoInBrasilia()): {
  current: IsoRange;
  previous: IsoRange;
} {
  return {
    current: { from: shift(todayIso, -29), to: todayIso },
    previous: { from: shift(todayIso, -59), to: shift(todayIso, -30) },
  };
}

/** "6 a 6 de out." / "1 a 6 de out." / "28 de set. a 6 de out." — para mostrar a janela na tela. */
export function rangeLabel(r: IsoRange): string {
  const f = (s: string, withMonth: boolean) => {
    const d = new Date(`${s}T12:00:00`);
    const mes = d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");
    return withMonth ? `${d.getDate()} de ${mes}.` : String(d.getDate());
  };
  if (r.from === r.to) return f(r.to, true);
  return r.from.slice(0, 7) === r.to.slice(0, 7)
    ? `${f(r.from, false)} a ${f(r.to, true)}`
    : `${f(r.from, true)} a ${f(r.to, true)}`;
}

/** Nome → id do membro. Nomes repetidos (ou vazios) são AMBÍGUOS e não resolvem: melhor não contar
 * do que atribuir a pessoa errada. */
export function memberIdResolver(
  members: { id: string; name: string }[],
): (name: string) => string | undefined {
  const byName = new Map<string, string | null>();
  for (const m of members) {
    const key = m.name.trim();
    if (!key) continue;
    byName.set(key, byName.has(key) ? null : m.id);
  }
  return (name) => byName.get(name.trim()) ?? undefined;
}

export type TaskLike = {
  createdAt?: string;
  assignees: string[];
  /** Presente = subtarefa. */
  parentTitle?: string;
};

export type NewTaskCounts = {
  /** Tarefas (raiz) criadas na janela, por membro responsável ATUAL. */
  byMember: Map<string, number>;
  /** Total de tarefas distintas criadas na janela (não soma atribuições). */
  total: number;
};

/** "Tarefa nova": tarefa RAIZ (subtarefas não contam) cuja data de criação, em Brasília, cai na
 * janela. "Recebeu" = o membro é responsável ATUAL dela (sem histórico de atribuição, reatribuições
 * podem distorcer). Tarefa com 2 responsáveis conta 1 vez no total e 1 para cada responsável. */
export function newTaskCounts(
  tasks: TaskLike[],
  window: IsoRange,
  resolve: (name: string) => string | undefined,
  dayOf: (createdAt: string) => string = (c) => todayIsoInBrasilia(new Date(c)),
): NewTaskCounts {
  const byMember = new Map<string, number>();
  let total = 0;
  for (const t of tasks) {
    if (t.parentTitle || !t.createdAt) continue;
    const day = dayOf(t.createdAt);
    if (day < window.from || day > window.to) continue;
    total += 1;
    const ids = new Set(t.assignees.map(resolve).filter((x): x is string => !!x));
    for (const id of ids) byMember.set(id, (byMember.get(id) ?? 0) + 1);
  }
  return { byMember, total };
}

/** Sinais de um membro: lê o bundle (mesmas métricas do motor/score) e acrescenta as contagens e a
 * resposta. É a ÚNICA ponte bundle → insights. */
export function buildMemberSignals(
  b: MemberInsightBundle,
  extra: {
    newTasks: number;
    newTasksPrev: number;
    response: { averageSeconds: number | null; answered: number } | undefined;
    responsePrev: { averageSeconds: number | null; answered: number } | undefined;
  },
): MemberSignals {
  return {
    id: b.memberId,
    name: b.memberName,
    openCount: b.openTasksCount,
    overdueCount: b.overdueCount,
    overdueHighPriority: b.overdueHighPriorityCount,
    overdueOld: b.overdueOlderThanThresholdCount,
    newTasks: extra.newTasks,
    newTasksPrev: extra.newTasksPrev,
    onTimeRate: b.onTimeRateCurrent,
    onTimeRatePrev: b.onTimeRatePrevious,
    onTimeSample: b.onTimeSampleCurrent,
    onTimeSamplePrev: b.onTimeSamplePrevious,
    replans: b.replansCurrent,
    replansPrev: b.replansPrevious,
    criticalReplans: b.criticalReplansCurrent,
    criticalReplansPrev: b.criticalReplansPrevious,
    repeatedReplans: b.repeatedProblematicReplansCurrent,
    meetingsExpected: b.meetingsExpected,
    meetingsAttended: b.meetingsAttended,
    responseAvg: extra.response?.averageSeconds ?? null,
    responseAvgPrev: extra.responsePrev?.averageSeconds ?? null,
    answered: extra.response?.answered ?? 0,
    answeredPrev: extra.responsePrev?.answered ?? 0,
  };
}
