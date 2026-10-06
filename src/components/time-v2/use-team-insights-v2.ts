import { useMemo } from "react";
import type { MemberInsightBundle } from "@/lib/insights-engine";
import type { DashTaskFlat } from "@/lib/task-aggregation";
import { OPEN_STATUSES } from "@/lib/score";
import { useTaskDependencies } from "@/lib/task-dependencies-store";
import { todayIsoInBrasilia } from "@/lib/timezone";
import { last30Range } from "./team-v2";
import { useTeamResponseTime } from "./use-response-time";
import {
  generateTeamInsights,
  previous30Range,
  selectTeamInsights,
  type DependencyTask,
  type MemberSignals,
  type TeamInsightV2,
} from "./team-insights-v2";

/** Liga o motor de insights V2 aos dados que a página Time já carrega: bundles dos últimos 30 dias,
 * tarefas, dependências formais e o tempo de resposta (atual e 30 dias anteriores). Nenhuma
 * consulta nova além da MESMA RPC de resposta do time, chamada também para a janela anterior. */
export function useTeamInsightsV2(
  bundles: MemberInsightBundle[],
  allTasksFlat: DashTaskFlat[],
): TeamInsightV2[] {
  const today = todayIsoInBrasilia();
  const cur = useMemo(() => last30Range(today), [today]);
  const prev = useMemo(() => previous30Range(today), [today]);
  const respCur = useTeamResponseTime(cur);
  const respPrev = useTeamResponseTime(prev);
  const deps = useTaskDependencies();

  return useMemo(() => {
    const idByName = new Map(bundles.map((b) => [b.memberName, b.memberId]));
    const newCur = new Map<string, number>();
    const newPrev = new Map<string, number>();
    let createdCur = 0;
    let createdPrev = 0;
    const tasks = new Map<string, DependencyTask>();
    for (const t of allTasksFlat) {
      const memberIds = t.assignees.map((n) => idByName.get(n)).filter((x): x is string => !!x);
      tasks.set(t.id, {
        id: t.id,
        title: t.title,
        memberIds,
        open: OPEN_STATUSES.has(t.status),
      });
      if (!t.createdAt) continue;
      const day = todayIsoInBrasilia(new Date(t.createdAt));
      const bucket =
        day >= cur.from && day <= cur.to
          ? newCur
          : day >= prev.from && day <= prev.to
            ? newPrev
            : null;
      if (!bucket) continue;
      if (bucket === newCur) createdCur += 1;
      else createdPrev += 1;
      for (const id of memberIds) bucket.set(id, (bucket.get(id) ?? 0) + 1);
    }
    const members: MemberSignals[] = bundles.map((b) => {
      const rc = respCur.data?.byMemberId.get(b.memberId);
      const rp = respPrev.data?.byMemberId.get(b.memberId);
      return {
        id: b.memberId,
        name: b.memberName,
        openCount: b.openTasksCount,
        overdueCount: b.overdueCount,
        overdueHighPriority: b.overdueHighPriorityCount,
        overdueOld: b.overdueOlderThanThresholdCount,
        newTasks: newCur.get(b.memberId) ?? 0,
        newTasksPrev: newPrev.get(b.memberId) ?? 0,
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
        responseAvg: rc?.averageSeconds ?? null,
        responseAvgPrev: rp?.averageSeconds ?? null,
        answered: rc?.answered ?? 0,
        answeredPrev: rp?.answered ?? 0,
      };
    });
    const sum = (f: (m: MemberSignals) => number) => members.reduce((s, m) => s + f(m), 0);
    const answered = sum((m) => m.answered);
    const all = generateTeamInsights(
      {
        members,
        edges: deps.map((d) => ({
          blockingTaskId: d.blockingTaskId,
          blockedTaskId: d.blockedTaskId,
        })),
        tasks,
      },
      {
        tasksCreated: { current: createdCur, previous: createdPrev },
        replans: { current: sum((m) => m.replans), previous: sum((m) => m.replansPrev) },
        response: {
          current: respCur.data?.teamAverageSeconds ?? null,
          previous: respPrev.data?.teamAverageSeconds ?? null,
          answered,
        },
      },
    );
    return selectTeamInsights(all);
  }, [bundles, allTasksFlat, deps, respCur.data, respPrev.data, cur, prev]);
}
