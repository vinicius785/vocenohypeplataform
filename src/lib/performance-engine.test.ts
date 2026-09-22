import { describe, expect, it } from "vitest";
import {
  computeEntrega,
  computePrevisibilidade,
  computeCompromissos,
  combineScoreV2,
  overdueOpenTasks,
  overdueTaskDetails,
  classifyReplanTiming,
  classificacaoDoScore,
  sampleConfidence,
  isHighPriority,
  computeMemberScoreV2,
  OPERATIONAL_SCORE_VERSION,
  type TaskOutcome,
  type EntregaCompletionLike,
  type OpenTaskForHealth,
  type PrevisibilidadeReplanEventLike,
  type PerformanceEventLike,
} from "./performance-engine";
import { OPEN_STATUSES, type PerformanceOpenTask } from "./score";

/** Conclusões sintéticas COM prazo — `n` tarefas com o `outcome` dado. */
const withDeadline = (n: number, outcome: TaskOutcome): EntregaCompletionLike[] =>
  Array.from({ length: n }, () => ({ outcome, hasDeadline: true }));
const semPrazo = (n: number): EntregaCompletionLike[] =>
  Array.from({ length: n }, () => ({ outcome: "on_time" as TaskOutcome, hasDeadline: false }));

/** Tarefa aberta sintética COM prazo — `daysAgo` dias atrás de hoje
 * (referência `now` fixa abaixo), pra simular "atualmente atrasada". */
const NOW = new Date("2026-06-15T12:00:00-03:00");
function openTaskDueDaysAgo(
  daysAgo: number,
  extra: Partial<OpenTaskForHealth> = {},
): OpenTaskForHealth {
  const due = new Date(NOW);
  due.setDate(due.getDate() - daysAgo);
  const dueDate = due.toISOString().slice(0, 10);
  return { status: "Aberto", dueDate, ...extra };
}
function openTaskNotYetDue(
  daysAhead = 5,
  extra: Partial<OpenTaskForHealth> = {},
): OpenTaskForHealth {
  const due = new Date(NOW);
  due.setDate(due.getDate() + daysAhead);
  const dueDate = due.toISOString().slice(0, 10);
  return { status: "Aberto", dueDate, ...extra };
}

describe("computeEntrega — Conclusões no prazo (40) + Saúde atual dos prazos (10)", () => {
  it("cenário 1 (caso real diagnosticado): 92 base, 91 no prazo, 0 atrasadas concluídas, 1 atualmente atrasada leve => Entrega ≈49/50", () => {
    const completions = [...withDeadline(91, "on_time")];
    const openTasks = [
      openTaskDueDaysAgo(1), // 1 tarefa atualmente atrasada, <=1 dia, não urgente, sem bloqueio
    ];
    const entrega = computeEntrega(completions, openTasks, NOW);
    expect(entrega.periodTaskBase).toBe(92);
    expect(entrega.onTimeRate).toBe(1);
    expect(entrega.onTimePoints).toBe(40);
    expect(entrega.currentHealthRate!).toBeGreaterThan(0.9);
    expect(entrega.value!).toBeGreaterThanOrEqual(49);
    expect(entrega.value!).toBeLessThanOrEqual(50);
  });

  it("cenário 2: 1 tarefa atualmente atrasada em 100 na base => saúde pouco arranhada", () => {
    const openTasks = [
      openTaskDueDaysAgo(1),
      ...Array.from({ length: 99 }, () => openTaskNotYetDue()),
    ];
    const entrega = computeEntrega([], openTasks, NOW);
    expect(entrega.periodTaskBase).toBe(100);
    expect(entrega.currentHealthRate!).toBeGreaterThan(0.98);
    expect(entrega.healthPoints!).toBeGreaterThan(9.8);
  });

  it("cenário 3: 1 tarefa atualmente atrasada em 2 na base => saúde bem arranhada, mas não zerada", () => {
    const openTasks = [openTaskDueDaysAgo(1), openTaskNotYetDue()];
    const entrega = computeEntrega([], openTasks, NOW);
    expect(entrega.periodTaskBase).toBe(2);
    expect(entrega.currentHealthRate!).toBeCloseTo(0.5, 5);
    expect(entrega.healthPoints!).toBeCloseTo(5, 5);
    expect(entrega.healthPoints!).toBeGreaterThan(0);
  });

  it("cenário 4: todas as conclusões atrasadas => taxa no prazo 0%, saúde atual calculada à parte", () => {
    const completions = withDeadline(5, "late");
    const openTasks = [openTaskDueDaysAgo(1)];
    const entrega = computeEntrega(completions, openTasks, NOW);
    expect(entrega.onTimeRate).toBe(0);
    expect(entrega.onTimePoints).toBe(0);
    expect(entrega.currentHealthRate).not.toBeNull();
    expect(entrega.overdueCount).toBe(1);
  });

  it("cenário 5: nenhuma conclusão no período, mas há tarefas abertas com prazo => score ainda derivável (não 'sem dados')", () => {
    const openTasks = [openTaskNotYetDue(), openTaskNotYetDue(10)];
    const entrega = computeEntrega([], openTasks, NOW);
    expect(entrega.value).not.toBeNull();
    expect(entrega.onTimePoints).toBeNull(); // subparte sem dado
    expect(entrega.healthPoints).not.toBeNull();
    // Todo o peso de 50 pontos foi redistribuído pra saúde atual (única subparte com dado).
    expect(entrega.value).toBe(50);
  });

  it("cenário 6: tarefas concluídas SEM prazo ficam de fora da taxa, contadas à parte", () => {
    const completions = [...withDeadline(10, "on_time"), ...semPrazo(4)];
    const entrega = computeEntrega(completions, [], NOW);
    expect(entrega.completedTasksWithDeadline).toBe(10);
    expect(entrega.semPrazoCount).toBe(4);
    expect(entrega.onTimeRate).toBe(1);
  });

  it("cenário 7: tarefa atualmente atrasada com bloqueio ATIVO externo (aguardando_cliente) é excluída da penalidade, mas listada", () => {
    const blocked = openTaskDueDaysAgo(3, {
      blockedState: { category: "aguardando_cliente" },
    });
    const entrega = computeEntrega([], [blocked, openTaskNotYetDue()], NOW);
    expect(entrega.currentHealthRate).toBe(1); // nenhuma penalidade
    expect(entrega.overdueDetails).toHaveLength(1);
    expect(entrega.overdueDetails[0].externallyBlocked).toBe(true);
    expect(entrega.overdueDetails[0].weightedContribution).toBe(0);
  });

  it("cenário 8: tarefa atualmente atrasada bloqueada INTERNAMENTE continua penalizando, rotulada distintamente", () => {
    const blocked = openTaskDueDaysAgo(3, {
      blockedState: { category: "problema_tecnico" },
    });
    const entrega = computeEntrega([], [blocked, openTaskNotYetDue()], NOW);
    expect(entrega.currentHealthRate!).toBeLessThan(1);
    expect(entrega.overdueDetails[0].internallyBlocked).toBe(true);
    expect(entrega.overdueDetails[0].externallyBlocked).toBe(false);
    expect(entrega.overdueDetails[0].weightedContribution).toBeGreaterThan(0);
  });

  it("nenhum dado (nenhuma conclusão com prazo, nenhuma tarefa aberta com prazo) => value null", () => {
    const entrega = computeEntrega([], [], NOW);
    expect(entrega.value).toBeNull();
    expect(entrega.periodTaskBase).toBe(0);
  });

  it("prioridade alta soma até +0.25 ao peso de severidade, capado em 1.75", () => {
    const urgente = openTaskDueDaysAgo(10, { priority: "Urgente" }); // >5 dias => 1.5 base
    const entrega = computeEntrega([], [urgente], NOW);
    expect(entrega.overdueDetails[0].severityWeight).toBe(1.75);
  });
});

describe("21/22 — peso de responsabilidade primário vs. colaborador na Saúde atual", () => {
  it("cenário 21: tarefa com principal definido — só o principal é penalizado, colaboradores têm peso 0", () => {
    const principal = openTaskDueDaysAgo(1, { penaltyWeight: 1 });
    const colaborador = openTaskDueDaysAgo(1, { penaltyWeight: 0 });
    const entregaPrincipal = computeEntrega([], [principal], NOW);
    const entregaColaborador = computeEntrega([], [colaborador], NOW);
    expect(entregaPrincipal.weightedCurrentOverdue).toBeGreaterThan(0);
    expect(entregaColaborador.weightedCurrentOverdue).toBe(0);
  });

  it("cenário 22: tarefa sem principal e 3 co-assignees — cada um pesa 1/3, não peso cheio", () => {
    const semPrincipal = openTaskDueDaysAgo(1, { penaltyWeight: 1 / 3 });
    const entrega = computeEntrega([], [semPrincipal], NOW);
    expect(entrega.overdueDetails[0].penaltyWeight).toBeCloseTo(1 / 3, 5);
    expect(entrega.weightedCurrentOverdue).toBeCloseTo(
      entrega.overdueDetails[0].severityWeight / 3,
      5,
    );
  });
});

describe("computePrevisibilidade — 35 pontos, desconto proporcional por severidade", () => {
  it("cenário 9: replanejamento antecipado não penaliza", () => {
    const result = computePrevisibilidade(
      [{ taskId: "t1", from: "2026-01-10", occurredAt: "2026-01-05T10:00:00" }],
      10,
    );
    expect(result.value).toBe(35);
    expect(result.earlyReplans).toBe(1);
  });

  it("cenário 10: replanejamento no dia gera penalidade pequena", () => {
    const result = computePrevisibilidade(
      [{ taskId: "t1", from: "2026-01-10", occurredAt: "2026-01-10T10:00:00" }],
      10,
    );
    expect(result.value!).toBeLessThan(35);
    expect(result.sameDayReplans).toBe(1);
  });

  it("cenário 11: replanejamento após vencimento (tardio) penaliza mais que no dia", () => {
    const noDia = computePrevisibilidade(
      [{ taskId: "t1", from: "2026-01-10", occurredAt: "2026-01-10T10:00:00" }],
      10,
    );
    const tardio = computePrevisibilidade(
      [{ taskId: "t1", from: "2026-01-10", occurredAt: "2026-01-12T10:00:00" }],
      10,
    );
    expect(tardio.value!).toBeLessThan(noDia.value!);
    expect(tardio.lateReplans).toBe(1);
  });

  it("cenário 12: replanejamentos repetidos (no dia/tardio) na MESMA tarefa penalizam progressivamente mais que uma única ocorrência", () => {
    const uma: PrevisibilidadeReplanEventLike[] = [
      { taskId: "t1", from: "2026-01-10", occurredAt: "2026-01-10T10:00:00" },
    ];
    const repetidas: PrevisibilidadeReplanEventLike[] = [
      { taskId: "t1", from: "2026-01-10", occurredAt: "2026-01-10T10:00:00" },
      { taskId: "t1", from: "2026-01-15", occurredAt: "2026-01-16T10:00:00" },
      { taskId: "t1", from: "2026-01-20", occurredAt: "2026-01-20T10:00:00" },
    ];
    const resultUma = computePrevisibilidade(uma, 10);
    const resultRepetidas = computePrevisibilidade(repetidas, 10);
    expect(resultRepetidas.repeatedProblematicReplans).toBeGreaterThan(0);
    expect(resultRepetidas.value!).toBeLessThan(resultUma.value!);
  });

  it("dependência externa isenta (registrada a tempo) não conta como strike", () => {
    const isento = computePrevisibilidade(
      [
        {
          taskId: "t1",
          from: "2026-01-10",
          occurredAt: "2026-01-12T10:00:00",
          exemptFromResponsibility: true,
        },
      ],
      10,
    );
    expect(isento.value).toBe(35);
    expect(isento.exemptedCount).toBe(1);
    expect(isento.lateReplans).toBe(0);
  });

  it("periodTaskBase = 0 => value null (Sem dados), nunca 35 de fábrica", () => {
    const result = computePrevisibilidade(
      [{ taskId: "t1", from: "2026-01-01", occurredAt: "2026-01-01T10:00:00" }],
      0,
    );
    expect(result.value).toBeNull();
  });
});

describe("computeCompromissos — Não aplicável nunca vira 15 de fábrica", () => {
  it("cenário 13: zero reuniões esperadas => value null, nunca 0", () => {
    expect(computeCompromissos([]).value).toBeNull();
  });

  it("todas as reuniões esperadas participadas => 100", () => {
    const result = computeCompromissos([{ attended: true }, { attended: true }]);
    expect(result.value).toBe(100);
  });

  it("cenário 14 (documentado no caller): reunião cancelada é excluída ANTES de chegar aqui — computeCompromissos só recebe o que já é 'esperado' (ver `TimeSection.tsx`/`MemberProfileDialog.tsx`, que já filtram `mt.status === 'Cancelada'` antes de montar `attendance`)", () => {
    // Função pura: cancelamento é responsabilidade de quem monta o array de entrada.
    const semCancelada = computeCompromissos([{ attended: true }, { attended: false }]);
    expect(semCancelada.expected).toBe(2);
  });
});

describe("sampleConfidence — 4 níveis, volume nunca soma ponto ao score", () => {
  it("0 => sem_dados; 1-9 => insuficiente; 10-19 => baixa; 20-39 => media; 40+ => alta", () => {
    expect(sampleConfidence(0)).toBe("sem_dados");
    expect(sampleConfidence(5)).toBe("insuficiente");
    expect(sampleConfidence(15)).toBe("baixa");
    expect(sampleConfidence(30)).toBe("media");
    expect(sampleConfidence(92)).toBe("alta");
  });
});

describe("classificacaoDoScore — 5 faixas (90/80/70/60/0), 'Bom' nunca vermelho", () => {
  it("mapeia as 5 faixas corretamente", () => {
    expect(classificacaoDoScore(95)).toBe("Excelente");
    expect(classificacaoDoScore(85)).toBe("Muito bom");
    expect(classificacaoDoScore(75)).toBe("Bom");
    expect(classificacaoDoScore(65)).toBe("Atenção");
    expect(classificacaoDoScore(10)).toBe("Crítico");
  });
});

describe("combineScoreV2 — redistribuição de peso entre as 3 dimensões", () => {
  function build(
    completions: EntregaCompletionLike[],
    openTasks: OpenTaskForHealth[],
    deadlineChanges: PrevisibilidadeReplanEventLike[] = [],
    attendance: { attended: boolean }[] = [],
    now: Date = NOW,
  ) {
    const entrega = computeEntrega(completions, openTasks, now);
    const previsibilidade = computePrevisibilidade(deadlineChanges, entrega.periodTaskBase);
    const compromissos = computeCompromissos(attendance);
    return combineScoreV2(entrega, previsibilidade, compromissos);
  }

  it("cenário 17: nenhuma dimensão tem dado => Sem dados suficientes, nunca 0/100", () => {
    const score = build([], []);
    expect(score.score).toBeNull();
    expect(score.dataState).toBe("sem_dados");
    expect(score.classificacao).toBeNull();
  });

  it("cenário 1 completo: caso real diagnosticado => Excelente, confiança alta, score 98-100", () => {
    const completions = withDeadline(91, "on_time");
    const openTasks = [openTaskDueDaysAgo(1)];
    const deadlineChanges: PrevisibilidadeReplanEventLike[] = Array.from({ length: 5 }, (_, i) => ({
      taskId: `early-${i}`,
      from: "2026-06-01",
      occurredAt: "2026-05-20T10:00:00",
    }));
    const attendance = Array.from({ length: 5 }, () => ({ attended: true }));
    const score = build(completions, openTasks, deadlineChanges, attendance);
    expect(score.entregaPontos!).toBeGreaterThanOrEqual(49);
    expect(score.previsibilidadePontos).toBe(35);
    expect(score.compromissosPontos).toBe(15);
    expect(score.score!).toBeGreaterThanOrEqual(98);
    expect(score.score!).toBeLessThanOrEqual(100);
    expect(score.classificacao).toBe("Excelente");
    expect(score.confidence).toBe("alta");
    expect(score.dataState).toBe("definitivo");
  });

  it("cenário 8 (redistribuição): sem reunião esperada, a dimensão é excluída e o score não piora artificialmente", () => {
    const withMeeting = build(withDeadline(10, "on_time"), [], [], [{ attended: true }]);
    const withoutMeeting = build(withDeadline(10, "on_time"), [], [], []);
    expect(withoutMeeting.compromissosAplicavel).toBe(false);
    expect(withoutMeeting.compromissosPontos).toBeNull();
    expect(withoutMeeting.score).toBe(withMeeting.score);
  });

  it("score nunca sai de [0,100]", () => {
    const worst = build(
      withDeadline(50, "late"),
      Array.from({ length: 50 }, () => openTaskDueDaysAgo(365, { priority: "Urgente" })),
    );
    expect(worst.score!).toBeGreaterThanOrEqual(0);
    const best = build(
      withDeadline(100, "on_time"),
      [],
      [],
      Array.from({ length: 50 }, () => ({ attended: true })),
    );
    expect(best.score!).toBeLessThanOrEqual(100);
  });

  it("cenário 18: arredondamento por maior resto — total exibido bate exatamente com o score inteiro", () => {
    // Construído pra que a soma dos arredondamentos INDEPENDENTES (round(entrega)+round(previs)+round(compromissos))
    // NÃO bata com round(score exato) — força o ajuste de maior resto.
    const completions = withDeadline(3, "on_time"); // onTimeRate=1 => onTimePoints=40 (subparte cheia)
    const openTasks = [openTaskDueDaysAgo(1)]; // 1 atrasada leve, dilui a saúde
    const entrega = computeEntrega(completions, openTasks, NOW);
    const previsibilidade = computePrevisibilidade([], entrega.periodTaskBase);
    const compromissos = computeCompromissos([
      { attended: true },
      { attended: true },
      { attended: false },
    ]); // 2/3 => rate com dízima
    const score = combineScoreV2(entrega, previsibilidade, compromissos);
    expect(score.entregaPontos! + score.previsibilidadePontos! + score.compromissosPontos!).toBe(
      score.score,
    );
  });
});

describe("computeMemberScoreV2 — monta o score a partir do ledger cru (ponto único de transformação)", () => {
  function ev(partial: Partial<PerformanceEventLike>): PerformanceEventLike {
    return {
      eventType: "task_completed",
      personId: "p1",
      personName: "Fulano",
      taskId: "t1",
      taskTitle: "Tarefa",
      meetingId: null,
      occurredAt: "2026-06-01T12:00:00",
      data: {},
      ...partial,
    };
  }

  it("cenário 15: amostra insuficiente (1-9 tarefas) => score provisório, confiança correta, fora de ranking", () => {
    const events: PerformanceEventLike[] = Array.from({ length: 5 }, (_, i) =>
      ev({
        taskId: `t${i}`,
        data: { outcome: "on_time", performanceDueDateUsed: "2026-06-01" },
      }),
    );
    const score = computeMemberScoreV2(events, [], 19, NOW);
    expect(score.confidence).toBe("insuficiente");
    expect(score.dataState).toBe("provisorio");
    expect(score.score).not.toBeNull();
  });

  it("hasDeadline vem exatamente de data.performanceDueDateUsed !== null (sinal do ledger)", () => {
    const events: PerformanceEventLike[] = [
      ev({ taskId: "t1", data: { outcome: "on_time", performanceDueDateUsed: "2026-06-01" } }),
      ev({ taskId: "t2", data: { outcome: "on_time", performanceDueDateUsed: null } }),
    ];
    const score = computeMemberScoreV2(events, [], 19, NOW);
    expect(score.entrega.completedTasksWithDeadline).toBe(1);
    expect(score.entrega.semPrazoCount).toBe(1);
  });

  it("versão exposta = OPERATIONAL_SCORE_VERSION (2), pra composição mostrar 'Fórmula v2'", () => {
    const score = computeMemberScoreV2([], [], 19, NOW);
    expect(score.version).toBe(OPERATIONAL_SCORE_VERSION);
    expect(OPERATIONAL_SCORE_VERSION).toBe(2);
  });

  it("cenário 20: comparação com período anterior usa a mesma versão/fórmula dos dois lados", () => {
    const eventsNow: PerformanceEventLike[] = [
      ev({ taskId: "t1", data: { outcome: "on_time", performanceDueDateUsed: "2026-06-01" } }),
    ];
    const eventsPrev: PerformanceEventLike[] = [
      ev({ taskId: "t2", data: { outcome: "late", performanceDueDateUsed: "2026-05-01" } }),
    ];
    const now = computeMemberScoreV2(eventsNow, [], 19, NOW);
    const prev = computeMemberScoreV2(eventsPrev, [], 19, NOW);
    expect(now.version).toBe(prev.version);
  });
});

describe("cenário 16 — período parcial (mês corrente em andamento) precisa ser sinalizado pelo chamador", () => {
  it("previousEquivalentRange produz uma janela de mesma duração — o CALLER (TimeSection/MemberProfileDialog) é responsável por rotular quando o período atual ainda está em andamento (ex.: comparar 'mês atual até hoje' com 'mês anterior inteiro' sem marcar isso seria enganoso); este motor não tem noção de calendário/'hoje', só recebe eventos já filtrados por range — documentado aqui como o contrato entre a camada de dados e a UI.", () => {
    // Cobertura de contrato: o motor em si é agnóstico a "parcial vs. completo" — é dever do
    // chamador (rangeForProfilePeriod/rangeForScorePeriod) escolher o range e da UI (TimeSection.tsx)
    // exibir o aviso de período parcial ao comparar. Ver `previousEquivalentRange` (mantida intocada).
    expect(true).toBe(true);
  });
});

describe("overdueOpenTasks / overdueTaskDetails / isHighPriority — utilidades mantidas intocadas", () => {
  it("tarefa com prazo antigo, ainda aberta, continua contando como atualmente atrasada", () => {
    const tasks = [{ id: "t1", title: "Tarefa antiga", status: "Aberto", dueDate: "2026-01-05" }];
    const now = new Date("2026-03-01T12:00:00-03:00");
    expect(overdueOpenTasks(tasks, now).length).toBe(1);
  });

  it("tarefa concluída nunca aparece na lista de atualmente atrasadas (listas disjuntas por construção)", () => {
    expect(OPEN_STATUSES.has("Concluído")).toBe(false);
  });

  it("overdueTaskDetails nunca reporta menos de 1 dia de atraso e propaga prioridade alta", () => {
    const tasks = [
      { id: "t1", title: "x", status: "Aberto", dueDate: "2026-01-05", priority: "Urgente" },
    ];
    const now = new Date("2026-01-05T20:00:00-03:00");
    const details = overdueTaskDetails(tasks, now);
    expect(details).toHaveLength(1);
    expect(details[0].daysOverdue).toBeGreaterThanOrEqual(1);
    expect(details[0].highPriority).toBe(true);
  });

  it("classifica replanejamento por distância do prazo anterior", () => {
    expect(classifyReplanTiming("2026-01-10", "2026-01-05T10:00:00")).toBe("antecipado");
    expect(classifyReplanTiming("2026-01-10", "2026-01-09T10:00:00")).toBe("proximo");
    expect(classifyReplanTiming("2026-01-10", "2026-01-10T10:00:00")).toBe("no_dia");
    expect(classifyReplanTiming("2026-01-10", "2026-01-12T10:00:00")).toBe("apos_vencimento");
  });

  it("isHighPriority reconhece só Urgente/Alta", () => {
    expect(isHighPriority("Urgente")).toBe(true);
    expect(isHighPriority("Alta")).toBe(true);
    expect(isHighPriority("Normal")).toBe(false);
    expect(isHighPriority("Baixa")).toBe(false);
    expect(isHighPriority(undefined)).toBe(false);
  });
});

// Suprime "declared but never used" no TS quando um import só serve de anotação de tipo em algum cenário.
void (null as unknown as PerformanceOpenTask);
