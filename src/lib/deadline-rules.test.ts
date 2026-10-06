import { describe, expect, it } from "vitest";
import {
  classifyOutcome,
  classifyReplanTiming,
  computeEntrega,
  computeMemberScoreV2,
  computePrevisibilidade,
  effectivePerformanceDueDate,
  isCriticalDeadlineMove,
  isCriticalReplan,
  overdueOpenTasks,
  reconcilePerformanceReference,
  taskDeadlineHealth,
  type DeadlineHistoryEntryLike,
  type PerformanceEventLike,
} from "./performance-engine";
import { reconcileLedgerEvents } from "./performance-reconcile";
import {
  computeEffectivePerformanceDueDate,
  computeEligibleBlockDurationMs,
} from "./task-blocks-rules";

/** Atraso = descumprir o PRAZO VIGENTE (corte às 19h). Replanejar antes de expirar é só
 * replanejamento; depois de expirar é atraso E replanejamento. */

const H = (
  from: string,
  to: string,
  changedAt: string,
  o: { exempt?: boolean; stored?: boolean } = {},
): DeadlineHistoryEntryLike => ({
  from,
  to,
  changedAt,
  // `isCritical` gravado pela regra ANTIGA: mesmo dia (ou depois) = crítico.
  isCritical: o.stored ?? changedAt.slice(0, 10) >= from,
  exemptFromResponsibility: !!o.exempt,
});

describe("conclusão x prazo vigente", () => {
  it("antes do vencimento → antecipada", () => {
    expect(classifyOutcome("2026-10-06", "2026-10-05T10:00:00").outcome).toBe("early");
  });
  it("exatamente no vencimento (corte 19:00) → no prazo; 1 minuto depois → atraso", () => {
    expect(classifyOutcome("2026-10-06", "2026-10-06T19:00:00").outcome).toBe("on_time");
    const late = classifyOutcome("2026-10-06", "2026-10-06T19:01:00");
    expect(late.outcome).toBe("late");
    expect(late.delayMinutes).toBe(1);
  });
});

describe("replanejamento", () => {
  it("ANTES do vencimento: replanejamento, não atraso; o novo prazo é o vigente", () => {
    const h = [H("2026-10-06", "2026-10-08", "2026-10-03T10:00:00")];
    expect(isCriticalReplan("2026-10-06", "2026-10-03T10:00:00")).toBe(false);
    expect(classifyReplanTiming("2026-10-06", "2026-10-03T10:00:00")).toBe("antecipado");
    const ref = effectivePerformanceDueDate("2026-10-06", h);
    expect(ref).toBe("2026-10-08");
    expect(classifyOutcome(ref, "2026-10-08T15:00:00").outcome).toBe("on_time");
  });

  it("NO DIA, antes do corte: replanejamento SIM, atraso NÃO, concluída no prazo vigente (exemplo 1)", () => {
    const h = [H("2026-10-06", "2026-10-08", "2026-10-06T14:00:00")];
    expect(isCriticalReplan("2026-10-06", "2026-10-06T14:00:00")).toBe(false);
    expect(classifyReplanTiming("2026-10-06", "2026-10-06T14:00:00")).toBe("no_dia");
    const ref = effectivePerformanceDueDate("2026-10-06", h);
    expect(ref).toBe("2026-10-08");
    expect(classifyOutcome(ref, "2026-10-08T15:00:00").outcome).toBe("on_time");
  });
  it("no corte exato ainda não expirou; um minuto depois expirou", () => {
    expect(isCriticalReplan("2026-10-06", "2026-10-06T19:00:00")).toBe(false);
    expect(isCriticalReplan("2026-10-06", "2026-10-06T19:01:00")).toBe(true);
  });

  it("DEPOIS do vencimento: o prazo vigente passa a ser o novo; o custo fica na Previsibilidade (v3)", () => {
    const h = [H("2026-10-06", "2026-10-09", "2026-10-07T10:00:00")];
    expect(isCriticalReplan("2026-10-06", "2026-10-07T10:00:00")).toBe(true);
    expect(classifyReplanTiming("2026-10-06", "2026-10-07T10:00:00")).toBe("apos_vencimento");
    const ref = effectivePerformanceDueDate("2026-10-06", h);
    expect(ref).toBe("2026-10-09"); // não fica preso ao prazo antigo
    expect(classifyOutcome(ref, "2026-10-08T10:00:00").outcome).toBe("early");
    // …mas o replanejamento tardio custa caro em Previsibilidade (uma vez só)
    const prev = computePrevisibilidade(
      [{ taskId: "t1", from: "2026-10-06", occurredAt: "2026-10-07T10:00:00" }],
      10,
    );
    expect(prev.lateReplans).toBe(1);
    expect(prev.predictabilityLoss).toBeGreaterThan(1);
  });
  it("replanejar depois de expirado NÃO continua acumulando atraso depois do novo prazo", () => {
    const t = {
      status: "Aberto",
      dueDate: "2026-10-10",
      originalDueDate: "2026-10-06",
      performanceDueDate: "2026-10-06", // referência congelada pelo modelo anterior
      deadlineHistory: [H("2026-10-06", "2026-10-10", "2026-10-07T10:00:00")],
    };
    // 08/10: contra o prazo ANTIGO seriam 2 dias de atraso; contra o vigente (10/10) está no prazo
    expect(taskDeadlineHealth(t, new Date("2026-10-08T10:00:00")).health).toBe("no_prazo");
    // só depois do novo corte volta a atrasar — e contando a partir do novo prazo
    const late = taskDeadlineHealth(t, new Date("2026-10-11T09:00:00"));
    expect(late.health).toBe("atrasada");
    expect(late.delayDays).toBe(1);
  });
  it("no dia do vencimento, DEPOIS do corte: prazo vigente novo, custo em Previsibilidade", () => {
    const h = [H("2026-10-06", "2026-10-08", "2026-10-06T20:00:00")];
    expect(effectivePerformanceDueDate("2026-10-06", h)).toBe("2026-10-08");
    expect(classifyReplanTiming("2026-10-06", "2026-10-06T20:00:00")).toBe("apos_vencimento");
  });
  it("com isenção por motivo externo, a referência avança mesmo depois de expirar", () => {
    const h = [H("2026-10-06", "2026-10-09", "2026-10-07T10:00:00", { exempt: true })];
    expect(effectivePerformanceDueDate("2026-10-06", h)).toBe("2026-10-09");
  });

  it("tarefa vencida sem replanejamento: atrasada pelo prazo vigente", () => {
    const open = [{ status: "Aberto", dueDate: "2026-10-06" }];
    expect(overdueOpenTasks(open, new Date("2026-10-07T09:00:00"))).toHaveLength(1);
    expect(overdueOpenTasks(open, new Date("2026-10-06T18:59:00"))).toHaveLength(0);
  });

  it("múltiplos replanejamentos antes de expirar: vale o último prazo", () => {
    const h = [
      H("2026-10-06", "2026-10-08", "2026-10-06T10:00:00"),
      H("2026-10-08", "2026-10-10", "2026-10-08T09:00:00"),
    ];
    expect(effectivePerformanceDueDate("2026-10-06", h)).toBe("2026-10-10");
  });
  it("com isenção por motivo externo, o replanejamento sai da conta de Previsibilidade", () => {
    const apos = computePrevisibilidade(
      [
        {
          taskId: "t1",
          from: "2026-10-06",
          occurredAt: "2026-10-07T10:00:00",
          exemptFromResponsibility: true,
        },
      ],
      10,
    );
    expect(apos.exemptedCount).toBe(1);
    expect(apos.lateReplans).toBe(0);
    expect(apos.predictabilityLoss).toBe(0);
  });
  it("pedido de justificativa continua no dia do vencimento (adiando), sem virar atraso", () => {
    expect(isCriticalDeadlineMove("2026-10-06", "2026-10-08", "2026-10-06T10:00:00")).toBe(true);
    expect(isCriticalDeadlineMove("2026-10-06", "2026-10-08", "2026-10-03T10:00:00")).toBe(false);
    expect(isCriticalReplan("2026-10-06", "2026-10-06T10:00:00")).toBe(false);
  });
  it("calendário: D-1 às 20h é 'próximo do prazo', não 'no dia'", () => {
    expect(classifyReplanTiming("2026-10-06", "2026-10-05T20:00:00")).toBe("proximo");
  });
});

describe("bloqueio", () => {
  it("bloqueio externo ativo: não penaliza atraso, mas continua listado (distinção bloqueio × atraso)", () => {
    const r = computeEntrega(
      [],
      [
        {
          status: "Bloqueada",
          dueDate: "2026-10-01",
          blockedState: { category: "aguardando_cliente" },
        },
      ],
      new Date("2026-10-07T10:00:00"),
    );
    expect(r.overdueCount).toBe(1);
    expect(r.overdueDetails[0].externallyBlocked).toBe(true);
    expect(r.weightedCurrentOverdue).toBe(0);
  });
  it("bloqueio interno continua penalizando, rotulado", () => {
    const r = computeEntrega(
      [],
      [{ status: "Bloqueada", dueDate: "2026-10-01", blockedState: { category: "outro" } }],
      new Date("2026-10-07T10:00:00"),
    );
    expect(r.overdueDetails[0].internallyBlocked).toBe(true);
    expect(r.weightedCurrentOverdue).toBeGreaterThan(0);
  });
  it("desbloqueada e depois atrasada: o prazo estende pelos dias bloqueados, e atrasa depois", () => {
    const eligible = computeEligibleBlockDurationMs(
      [
        {
          pausesDeadline: true,
          blockedAt: "2026-10-05T12:00:00Z",
          unblockedAt: "2026-10-07T12:00:00Z",
        },
      ],
      "2026-10-07T12:00:00Z",
    );
    const vigente = computeEffectivePerformanceDueDate("2026-10-06", eligible);
    expect(vigente).toBe("2026-10-08");
    const open = [{ status: "Aberto", dueDate: "2026-10-06", performanceDueDate: vigente }];
    expect(overdueOpenTasks(open, new Date("2026-10-08T18:00:00"))).toHaveLength(0);
    expect(overdueOpenTasks(open, new Date("2026-10-09T09:00:00"))).toHaveLength(1);
  });
});

describe("reconciliação do que já está gravado", () => {
  it("referência congelada pela regra antiga (mudança no dia, antes do corte) é corrigida", () => {
    const history = [H("2026-10-06", "2026-10-08", "2026-10-06T14:00:00")];
    expect(
      reconcilePerformanceReference({
        stored: "2026-10-06", // gravado pela regra antiga: congelado
        originalDueDate: "2026-10-06",
        deadlineHistory: history,
      }),
    ).toBe("2026-10-08");
  });
  it("preserva os dias de bloqueio que o histórico não explica", () => {
    const history = [H("2026-10-06", "2026-10-08", "2026-10-06T14:00:00")];
    // antigo: 06/10 congelado + 3 dias de bloqueio = 09/10; novo: 08/10 + 3 = 11/10
    expect(
      reconcilePerformanceReference({
        stored: "2026-10-09",
        originalDueDate: "2026-10-06",
        deadlineHistory: history,
      }),
    ).toBe("2026-10-11");
  });
  it("sem histórico de prazo, mantém o gravado", () => {
    expect(
      reconcilePerformanceReference({
        stored: "2026-10-06",
        originalDueDate: "2026-10-06",
        deadlineHistory: [],
      }),
    ).toBe("2026-10-06");
  });
  it("badge de saúde do prazo da tarefa usa o prazo vigente reconciliado", () => {
    const t = {
      status: "Aberto",
      dueDate: "2026-10-08",
      originalDueDate: "2026-10-06",
      performanceDueDate: "2026-10-06", // congelado pela regra antiga
      deadlineHistory: [H("2026-10-06", "2026-10-08", "2026-10-06T14:00:00")],
    };
    expect(taskDeadlineHealth(t, new Date("2026-10-07T10:00:00")).health).toBe("no_prazo");
  });
});

const completion = (over: Partial<PerformanceEventLike["data"]> = {}): PerformanceEventLike => ({
  eventType: "task_completed",
  personId: "p1",
  personName: "Ana",
  taskId: "t1",
  taskTitle: "T",
  meetingId: null,
  occurredAt: "2026-10-08T15:00:00",
  data: {
    outcome: "late",
    delayMinutes: 30 * 60,
    performanceDueDateUsed: "2026-10-06",
    ...over,
  },
});
const replan = (): PerformanceEventLike => ({
  eventType: "task_deadline_changed",
  personId: "p1",
  personName: "Ana",
  taskId: "t1",
  taskTitle: "T",
  meetingId: null,
  occurredAt: "2026-10-06T14:00:00",
  data: { from: "2026-10-06", to: "2026-10-08", isCritical: true, exemptFromResponsibility: false },
});
const lookup = (id: string) =>
  id === "t1"
    ? {
        originalDueDate: "2026-10-06",
        dueDate: "2026-10-08",
        deadlineHistory: [H("2026-10-06", "2026-10-08", "2026-10-06T14:00:00")],
      }
    : undefined;

describe("ledger: recalculado na leitura, nunca regravado", () => {
  it("replanejamento no dia vira não-atraso; conclusão passa a ser no prazo vigente", () => {
    const original = [completion(), replan()];
    const snapshot = JSON.stringify(original);
    const out = reconcileLedgerEvents(original, lookup);
    expect(JSON.stringify(original)).toBe(snapshot); // eventos gravados intactos
    const c = out.find((e) => e.eventType === "task_completed")!;
    expect(c.data.outcome).toBe("on_time");
    expect(c.data.delayMinutes).toBe(0);
    expect(c.data.performanceDueDateUsed).toBe("2026-10-08");
    expect(out.find((e) => e.eventType === "task_deadline_changed")!.data.isCritical).toBe(false);
  });
  it("replanejamento depois de expirar: criticidade preservada, conclusão medida no prazo vigente", () => {
    const late = replan();
    late.occurredAt = "2026-10-07T10:00:00";
    const out = reconcileLedgerEvents([completion(), late], (id) =>
      id === "t1"
        ? {
            originalDueDate: "2026-10-06",
            deadlineHistory: [H("2026-10-06", "2026-10-08", "2026-10-07T10:00:00")],
          }
        : undefined,
    );
    expect(out[0].data.outcome).toBe("on_time"); // concluída 08/10 15:00, prazo vigente 08/10
    expect(out[1].data.isCritical).toBe(true); // continua um replanejamento depois de vencido
  });
  it("tarefa inexistente ou sem histórico: evento como gravado", () => {
    const c = completion();
    const out = reconcileLedgerEvents([c], () => undefined);
    expect(out[0]).toBe(c);
  });
  it("conclusão sem prazo (performanceDueDateUsed nulo) não é tocada", () => {
    const c = completion({ performanceDueDateUsed: null });
    expect(reconcileLedgerEvents([c], lookup)[0]).toBe(c);
  });
});

describe("score antes × depois da correção", () => {
  it("quem replanejou no dia deixa de ser penalizado em prazo; só um custo leve em previsibilidade", () => {
    const events = [completion(), replan()];
    const antes = computeMemberScoreV2(events, [], 19, new Date("2026-10-09T10:00:00"));
    const depois = computeMemberScoreV2(
      reconcileLedgerEvents(events, lookup),
      [],
      19,
      new Date("2026-10-09T10:00:00"),
    );
    // Execução: 0% no prazo (atraso retroativo) → 100%
    expect(antes.entrega.onTimeRate).toBe(0);
    expect(depois.entrega.onTimeRate).toBe(1);
    expect(depois.entrega.value!).toBeGreaterThan(antes.entrega.value!);
    // Previsibilidade: o replanejamento no dia custa pouco (≤ 5 pts) e nunca é atraso
    expect(depois.previsibilidade.sameDayReplans).toBe(1);
    expect(depois.previsibilidade.lateReplans).toBe(0);
    expect(depois.previsibilidade.predictabilityLoss).toBeLessThanOrEqual(5);
    expect(depois.score!).toBeGreaterThan(antes.score!);
  });
  it("taxa de conclusão é só informação: não altera o valor de Entrega", () => {
    const a = computeEntrega([{ outcome: "on_time", hasDeadline: true }], [], new Date());
    expect(a.completionRate).toBe(1);
    const b = computeEntrega(
      [{ outcome: "on_time", hasDeadline: true }],
      [{ status: "Aberto", dueDate: "2999-01-01" }],
      new Date(),
    );
    expect(b.completionRate).toBe(0.5);
    expect(b.onTimePoints).toBe(a.onTimePoints);
  });
  it("replanejamento NO DIA custa menos que APÓS o vencimento (previsibilidade)", () => {
    const ev = (changedAt: string) => ({
      taskId: "t1",
      from: "2026-10-06",
      occurredAt: changedAt,
    });
    const noDia = computePrevisibilidade([ev("2026-10-06T14:00:00")], 10);
    const apos = computePrevisibilidade([ev("2026-10-07T14:00:00")], 10);
    expect(noDia.predictabilityLoss).toBeLessThan(apos.predictabilityLoss);
    expect(noDia.value!).toBeGreaterThan(apos.value!);
  });
});
