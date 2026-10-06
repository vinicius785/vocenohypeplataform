import { useMemo } from "react";
import type { MemberInsightBundle } from "@/lib/insights-engine";
import type { DashTaskFlat } from "@/lib/task-aggregation";
import { OPEN_STATUSES } from "@/lib/score";
import { useTaskDependencies } from "@/lib/task-dependencies-store";
import { todayIsoInBrasilia } from "@/lib/timezone";
import {
  buildMemberSignals,
  insightWindows,
  memberIdResolver,
  newTaskCounts,
} from "./team-metrics";
import { useTeamResponseTime } from "./use-response-time";
import {
  generateTeamInsights,
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
  const { current: cur, previous: prev } = useMemo(() => insightWindows(today), [today]);
  const respCur = useTeamResponseTime(cur);
  const respPrev = useTeamResponseTime(prev);
  const deps = useTaskDependencies();

  return useMemo(() => {
    const resolve = memberIdResolver(bundles.map((b) => ({ id: b.memberId, name: b.memberName })));
    const roots = allTasksFlat.map((t) => ({
      createdAt: t.createdAt,
      assignees: t.assignees,
      parentTitle: t.parentTitle,
    }));
    const novasAtual = newTaskCounts(roots, cur, resolve);
    const novasAnterior = newTaskCounts(roots, prev, resolve);

    const tasks = new Map<string, DependencyTask>();
    for (const t of allTasksFlat) {
      const memberIds = t.assignees.map(resolve).filter((x): x is string => !!x);
      tasks.set(t.id, { id: t.id, title: t.title, memberIds, open: OPEN_STATUSES.has(t.status) });
    }

    const members: MemberSignals[] = bundles.map((b) =>
      buildMemberSignals(b, {
        newTasks: novasAtual.byMember.get(b.memberId) ?? 0,
        newTasksPrev: novasAnterior.byMember.get(b.memberId) ?? 0,
        response: respCur.data?.byMemberId.get(b.memberId),
        responsePrev: respPrev.data?.byMemberId.get(b.memberId),
      }),
    );
    const sum = (f: (m: MemberSignals) => number) => members.reduce((s, m) => s + f(m), 0);
    const all = generateTeamInsights(
      {
        members,
        edges: deps.map((d) => ({
          blockingTaskId: d.blockingTaskId,
          blockedTaskId: d.blockedTaskId,
        })),
        tasks,
        newTasksTotal: novasAtual.total,
      },
      {
        tasksCreated: { current: novasAtual.total, previous: novasAnterior.total },
        replans: { current: sum((m) => m.replans), previous: sum((m) => m.replansPrev) },
        flow: {
          current: {
            evaluated: sum((m) => m.flowEvaluated),
            withAdjustments: sum((m) => m.flowWithAdjustments),
          },
          previous: {
            evaluated: sum((m) => m.flowEvaluatedPrev),
            withAdjustments: sum((m) => m.flowWithAdjustmentsPrev),
          },
        },
        response: {
          current: respCur.data?.teamAverageSeconds ?? null,
          previous: respPrev.data?.teamAverageSeconds ?? null,
          answered: sum((m) => m.answered),
        },
      },
    );
    return selectTeamInsights(all);
  }, [bundles, allTasksFlat, deps, respCur.data, respPrev.data, cur, prev]);
}
