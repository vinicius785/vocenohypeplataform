import { useMemo } from "react";
import {
  computeMemberScoreV2,
  overdueOpenTasks,
  dedupAttendanceEvents,
  previousEquivalentRange,
  computeAggregateIndicators,
  type TaskOutcome,
} from "@/lib/performance-engine";
import type { PerformanceOpenTask } from "@/lib/score";
import { usePerformanceEvents } from "@/lib/performance-events-store";
import { approvalFlowByPerson, type ApprovalFlowSummary } from "@/lib/approval-flow";
import { collectRawFlowNodes } from "@/lib/task-aggregation";

/**
 * Eventos + Score Operacional + indicadores de UMA pessoa num período —
 * extraído de `MemberProfileDialog` (mesmo código, mesma fórmula) pra o
 * perfil da V1 e o perfil central da Time V2 nunca calcularem o Score de
 * formas diferentes. Fetch escopado a pessoa+período (`usePerformanceEvents`
 * filtra por `personId` no servidor): pequeno, sob demanda.
 */
export function useMemberPerformance(
  memberId: string,
  profileRange: { from?: string; to?: string },
  openTasksForMember: PerformanceOpenTask[],
  deadlineCutoffHour: number,
  memberName?: string,
) {
  const { events } = usePerformanceEvents(profileRange, memberId);

  const completions = useMemo(
    () =>
      events
        .filter((e) => e.eventType === "task_completed")
        .map((e) => ({
          outcome: e.data.outcome as TaskOutcome,
          delayMinutes: (e.data.delayMinutes as number) ?? 0,
          taskId: e.taskId,
          taskTitle: e.taskTitle,
          occurredAt: e.occurredAt,
        })),
    [events],
  );
  const deadlineChanges = useMemo(
    () =>
      events
        .filter((e) => e.eventType === "task_deadline_changed")
        .map((e) => ({
          taskId: e.taskId,
          taskTitle: e.taskTitle,
          from: (e.data.from as string) ?? undefined,
          isCritical: !!e.data.isCritical,
          motivo: (e.data.motivo as string) ?? undefined,
          exemptFromResponsibility: !!e.data.exemptFromResponsibility,
          occurredAt: e.occurredAt,
        })),
    [events],
  );
  const attendance = useMemo(
    () =>
      dedupAttendanceEvents(
        events.filter((e) => e.eventType === "meeting_attendance_recorded"),
      ).map((e) => ({
        attended: !!e.data.attended,
        meetingId: e.meetingId,
        occurredAt: e.occurredAt,
      })),
    [events],
  );

  const overdueNow = useMemo(
    () => overdueOpenTasks(openTasksForMember, undefined, deadlineCutoffHour),
    [openTasksForMember, deadlineCutoffHour],
  );
  // Fluxo sem retrabalho (v3): lê as transições de status das tarefas da pessoa no período (e no
  // anterior). O mesmo dado alimenta o score e o que o painel mostra.
  const previousRange = useMemo(() => previousEquivalentRange(profileRange), [profileRange]);
  const flow = useMemo<ApprovalFlowSummary | undefined>(
    () =>
      memberName
        ? approvalFlowByPerson(collectRawFlowNodes(), profileRange).get(memberName)
        : undefined,
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `events` muda a cada refetch (30s)
    [memberName, profileRange, events],
  );
  const previousFlow = useMemo<ApprovalFlowSummary | undefined>(
    () =>
      memberName
        ? approvalFlowByPerson(collectRawFlowNodes(), previousRange).get(memberName)
        : undefined,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [memberName, previousRange, events],
  );
  const score = useMemo(
    () => computeMemberScoreV2(events, openTasksForMember, deadlineCutoffHour, undefined, flow),
    [events, openTasksForMember, deadlineCutoffHour, flow],
  );

  // Comparação com o período imediatamente anterior equivalente (item 12
  // do pedido) — mesmo fetch/extração, só sobre outra janela de tempo.
  const { events: previousEvents } = usePerformanceEvents(previousRange, memberId);
  const previousScore = useMemo(() => {
    // Sem `openTasksForMember` do período anterior, não há como saber
    // quais tarefas estavam ATUALMENTE atrasadas naquele momento passado
    // (reconstruir isso a partir só do estado atual seria inventar dado —
    // limitação documentada, não uma aproximação silenciosa). A tendência
    // usa só as conclusões e replanejamentos do período anterior; mesma
    // fórmula/versão (`OPERATIONAL_SCORE_VERSION`) do período atual.
    return computeMemberScoreV2(previousEvents, [], deadlineCutoffHour, undefined, previousFlow);
  }, [previousEvents, deadlineCutoffHour, previousFlow]);
  const trendLabel = useMemo(() => {
    if (score.score == null || previousScore.score == null) return null;
    const diff = score.score - previousScore.score;
    if (diff === 0) return "— Sem alteração vs. período anterior";
    return diff > 0
      ? `↑ ${diff} pts vs. período anterior`
      : `↓ ${Math.abs(diff)} pts vs. período anterior`;
  }, [score.score, previousScore.score]);

  const previousCompletions = useMemo(
    () =>
      previousEvents
        .filter((e) => e.eventType === "task_completed")
        .map((e) => ({
          outcome: e.data.outcome as TaskOutcome,
          delayMinutes: (e.data.delayMinutes as number) ?? 0,
          taskId: e.taskId,
        })),
    [previousEvents],
  );
  const previousDeadlineChanges = useMemo(
    () =>
      previousEvents
        .filter((e) => e.eventType === "task_deadline_changed")
        .map((e) => ({
          taskId: e.taskId,
          isCritical: !!e.data.isCritical,
          motivo: (e.data.motivo as string) ?? undefined,
          exemptFromResponsibility: !!e.data.exemptFromResponsibility,
        })),
    [previousEvents],
  );
  const aggCurrent = useMemo(
    () => computeAggregateIndicators(completions, deadlineChanges, overdueNow.length),
    [completions, deadlineChanges, overdueNow.length],
  );
  const aggPrevious = useMemo(
    () => computeAggregateIndicators(previousCompletions, previousDeadlineChanges, 0),
    [previousCompletions, previousDeadlineChanges],
  );

  // Terceiro ponto da tendência ("78% → 84% → 90%"): a janela equivalente
  // anterior à anterior — mesmo fetch escopado e mesma extração.
  const previous2Range = useMemo(() => previousEquivalentRange(previousRange), [previousRange]);
  const { events: previous2Events } = usePerformanceEvents(previous2Range, memberId);
  const aggPrevious2 = useMemo(
    () =>
      computeAggregateIndicators(
        previous2Events
          .filter((e) => e.eventType === "task_completed")
          .map((e) => ({
            outcome: e.data.outcome as TaskOutcome,
            delayMinutes: (e.data.delayMinutes as number) ?? 0,
            taskId: e.taskId,
          })),
        previous2Events
          .filter((e) => e.eventType === "task_deadline_changed")
          .map((e) => ({
            taskId: e.taskId,
            isCritical: !!e.data.isCritical,
            exemptFromResponsibility: !!e.data.exemptFromResponsibility,
          })),
        0,
      ),
    [previous2Events],
  );
  const previous2CompletionsCount = useMemo(
    () => previous2Events.filter((e) => e.eventType === "task_completed").length,
    [previous2Events],
  );

  return {
    events,
    previousEvents,
    previousCompletions,
    previousScore,
    completions,
    deadlineChanges,
    attendance,
    overdueNow,
    score,
    flow,
    previousFlow,
    trendLabel,
    aggCurrent,
    aggPrevious,
    aggPrevious2,
    previous2CompletionsCount,
  };
}
