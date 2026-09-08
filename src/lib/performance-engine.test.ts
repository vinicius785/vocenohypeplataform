import { describe, expect, it } from "vitest";
import {
  computeEntrega,
  computePrevisibilidade,
  computeCompromissos,
  combineScoreV2,
  computeScoreGuardrails,
  overdueOpenTasks,
  overdueTaskDetails,
  classifyReplanTiming,
  classificacaoDoScore,
  isHighPriority,
  MIN_TASK_SAMPLE,
  ATRASO_LONGO_DIAS,
  GUARDRAIL_ACUMULO_LIMIAR,
  type TaskOutcome,
  type OverdueTaskDetail,
} from "./performance-engine";
import { OPEN_STATUSES } from "./score";

const onTime = (n: number) =>
  Array.from({ length: n }, () => ({ outcome: "on_time" as TaskOutcome }));
const late = (n: number) => Array.from({ length: n }, () => ({ outcome: "late" as TaskOutcome }));
const overdue = (n: number, extra: Partial<OverdueTaskDetail> = {}): OverdueTaskDetail[] =>
  Array.from({ length: n }, () => ({ daysOverdue: 1, highPriority: false, ...extra }));

/** Monta o score completo do jeito que a UI faz: Entrega -> Previsibilidade
 * (mesma `tarefasElegiveis`) -> Compromissos -> combineScoreV2. */
function buildScore(
  completions: { outcome: TaskOutcome }[],
  overdueTasks: OverdueTaskDetail[],
  deadlineChanges: { taskId: string | null; from?: string; occurredAt: string }[] = [],
  attendance: { attended: boolean }[] = [],
) {
  const entrega = computeEntrega(completions, overdueTasks);
  const previsibilidade = computePrevisibilidade(deadlineChanges, entrega.tarefasElegiveis);
  const compromissos = computeCompromissos(attendance);
  return combineScoreV2(entrega, previsibilidade, compromissos);
}

describe("computeEntrega — ausência de dado nunca vira pontuação", () => {
  it("sem conclusão e sem tarefa atualmente atrasada => value null (não 50 de fábrica)", () => {
    const entrega = computeEntrega([], []);
    expect(entrega.value).toBeNull();
    expect(entrega.tarefasElegiveis).toBe(0);
  });

  it("uma única tarefa atualmente atrasada, zero conclusões => taxa 0%, não 50% de base", () => {
    const entrega = computeEntrega([], overdue(1));
    expect(entrega.value).toBe(0);
    expect(entrega.tarefasElegiveis).toBe(1);
    expect(entrega.atualmenteAtrasadas).toBe(1);
  });

  it("28 tarefas concluídas no prazo, nenhuma atrasada => 50/50", () => {
    const entrega = computeEntrega(onTime(28), []);
    expect(entrega.value).toBe(50);
    expect(entrega.amostraReduzida).toBe(false);
  });

  it("penaliza gradualmente atraso longo (>5 dias) e prioridade alta, sem ficar negativo", () => {
    const baseline = computeEntrega(onTime(10), []);
    const withLongOverdue = computeEntrega(
      onTime(10),
      overdue(1, { daysOverdue: ATRASO_LONGO_DIAS + 1 }),
    );
    const withHighPriority = computeEntrega(
      onTime(10),
      overdue(1, { highPriority: true, daysOverdue: 1 }),
    );
    expect(withLongOverdue.value!).toBeLessThan(baseline.value!);
    expect(withHighPriority.value!).toBeLessThan(baseline.value!);
    const extreme = computeEntrega([], overdue(50, { highPriority: true, daysOverdue: 100 }));
    expect(extreme.value).toBe(0); // clamp nunca deixa negativo
  });

  it("amostra abaixo de MIN_TASK_SAMPLE marca amostraReduzida", () => {
    const small = computeEntrega(onTime(MIN_TASK_SAMPLE - 1), []);
    const enough = computeEntrega(onTime(MIN_TASK_SAMPLE), []);
    expect(small.amostraReduzida).toBe(true);
    expect(enough.amostraReduzida).toBe(false);
  });
});

describe("computePrevisibilidade — sem tarefa elegível nunca é 35/35 de fábrica", () => {
  it("tarefasElegiveis = 0 => value null (Sem dados), mesmo com evento de replan solto", () => {
    const result = computePrevisibilidade(
      [{ taskId: "t1", from: "2026-01-01", occurredAt: "2026-01-01T10:00:00" }],
      0,
    );
    expect(result.value).toBeNull();
  });

  it("sem nenhum replanejamento, com tarefas elegíveis => 35/35", () => {
    const result = computePrevisibilidade([], 10);
    expect(result.value).toBe(35);
  });

  it("replanejamento antecipado penaliza menos que no dia, que penaliza menos que após vencimento", () => {
    const antecipado = computePrevisibilidade(
      [{ taskId: "t1", from: "2026-01-10", occurredAt: "2026-01-05T10:00:00" }],
      5,
    );
    const noDia = computePrevisibilidade(
      [{ taskId: "t1", from: "2026-01-10", occurredAt: "2026-01-10T10:00:00" }],
      5,
    );
    const aposVencimento = computePrevisibilidade(
      [{ taskId: "t1", from: "2026-01-10", occurredAt: "2026-01-12T10:00:00" }],
      5,
    );
    expect(antecipado.value!).toBeGreaterThan(noDia.value!);
    expect(noDia.value!).toBeGreaterThan(aposVencimento.value!);
  });
});

describe("computeCompromissos — Não aplicável nunca vira 15 de fábrica", () => {
  it("sem reunião esperada => value null", () => {
    expect(computeCompromissos([]).value).toBeNull();
  });

  it("todas as reuniões esperadas participadas => 100 (15/15 depois de combinado)", () => {
    const result = computeCompromissos([{ attended: true }, { attended: true }]);
    expect(result.value).toBe(100);
  });
});

describe("combineScoreV2 — estados Sem dados / Provisório / Definitivo", () => {
  it("cenário 1: sem tarefas e sem reuniões => Sem dados", () => {
    const score = buildScore([], []);
    expect(score.score).toBeNull();
    expect(score.dataState).toBe("sem_dados");
    expect(score.classificacao).toBeNull();
  });

  it("cenário 2: sem tarefas mas COM reuniões => ainda Sem dados (atividade operacional é sobre tarefa, não reunião)", () => {
    const score = buildScore([], [], [], [{ attended: true }, { attended: false }]);
    expect(score.score).toBeNull();
    expect(score.dataState).toBe("sem_dados");
  });

  it("cenário 3: uma única tarefa atualmente atrasada => provisório, com o atraso contabilizado", () => {
    const score = buildScore([], overdue(1));
    expect(score.dataState).toBe("provisorio");
    expect(score.score).not.toBeNull();
    expect(score.entrega.atualmenteAtrasadas).toBe(1);
    expect(score.classificacao).toBeNull();
  });

  it("cenário 4: uma tarefa concluída atrasada => provisório, 0% no prazo", () => {
    const score = buildScore(late(1), []);
    expect(score.dataState).toBe("provisorio");
    expect(score.entrega.noPrazo).toBe(0);
    expect(score.entrega.comAtraso).toBe(1);
  });

  it("cenário 5: 28 tarefas concluídas no prazo, sem reunião => score próximo de 100, Excelente", () => {
    const score = buildScore(onTime(28), []);
    expect(score.dataState).toBe("definitivo");
    expect(score.score).toBeGreaterThanOrEqual(95);
    expect(score.classificacao).toBe("Excelente");
  });

  it("cenário 6: 8 no prazo + 15 atrasadas + 4 atualmente atrasadas => nunca acima de 59", () => {
    const score = buildScore([...onTime(8), ...late(15)], overdue(4));
    expect(score.score!).toBeLessThanOrEqual(59);
  });

  it("cenário 7: 3 no prazo + 6 atrasadas + 12 atualmente atrasadas => crítico, no máximo 49", () => {
    const score = buildScore([...onTime(3), ...late(6)], overdue(12));
    expect(score.score!).toBeLessThanOrEqual(49);
    expect(score.classificacao).toBe(score.dataState === "definitivo" ? "Crítico" : null);
  });

  it("cenário 8: sem reunião esperada => dimensão Não aplicável, sem bônus nem penalidade", () => {
    const withMeeting = buildScore(onTime(10), [], [], [{ attended: true }]);
    const withoutMeeting = buildScore(onTime(10), [], [], []);
    expect(withoutMeeting.compromissosAplicavel).toBe(false);
    expect(withoutMeeting.compromissosPontos).toBeNull();
    // Sem a dimensão, o score é renormalizado sobre Entrega+Previsibilidade — não deve ficar
    // artificialmente pior só por faltar reunião.
    expect(withoutMeeting.score).toBe(withMeeting.score);
  });

  it("cenário 9: todas as reuniões esperadas participadas => 15/15 quando aplicável", () => {
    const score = buildScore(onTime(10), [], [], [{ attended: true }, { attended: true }]);
    expect(score.compromissosAplicavel).toBe(true);
    expect(score.compromissosPontos).toBe(15);
  });

  it("cenário 13: score nunca fica abaixo de 0 nem acima de 100", () => {
    const worst = buildScore([...late(50)], overdue(50, { highPriority: true, daysOverdue: 365 }));
    expect(worst.score!).toBeGreaterThanOrEqual(0);
    const best = buildScore(
      onTime(100),
      [],
      [],
      Array.from({ length: 50 }, () => ({ attended: true })),
    );
    expect(best.score!).toBeLessThanOrEqual(100);
  });
});

describe("computeScoreGuardrails — salvaguardas de coerência centralizadas", () => {
  it("taxa de entrega no prazo abaixo de 35% => teto 49", () => {
    const entrega = computeEntrega([...onTime(1), ...late(2)], overdue(1)); // 1/4 = 25%
    const reasons = computeScoreGuardrails(entrega);
    expect(reasons.some((r) => r.key === "taxa_no_prazo_abaixo_35" && r.cap === 49)).toBe(true);
  });

  it("taxa entre 35% e 50% => teto 59, mais leve que abaixo de 35%", () => {
    const entrega = computeEntrega(onTime(4), overdue(4)); // 4/8 = 50% exato, não entra na regra <50
    const entregaAbaixo = computeEntrega(onTime(4), overdue(5)); // 4/9 ≈ 44%
    expect(computeScoreGuardrails(entrega).some((r) => r.key.startsWith("taxa_no_prazo"))).toBe(
      false,
    );
    expect(
      computeScoreGuardrails(entregaAbaixo).some(
        (r) => r.key === "taxa_no_prazo_abaixo_50" && r.cap === 59,
      ),
    ).toBe(true);
  });

  it("tarefa de prioridade alta atrasada há mais de 5 dias => teto 49", () => {
    const entrega = computeEntrega(
      onTime(10),
      overdue(1, { highPriority: true, daysOverdue: ATRASO_LONGO_DIAS + 1 }),
    );
    expect(
      computeScoreGuardrails(entrega).some((r) => r.key === "prioridade_alta_atraso_longo"),
    ).toBe(true);
  });

  it(`${GUARDRAIL_ACUMULO_LIMIAR} ou mais tarefas atualmente atrasadas => teto 49`, () => {
    const entrega = computeEntrega(onTime(10), overdue(GUARDRAIL_ACUMULO_LIMIAR));
    expect(computeScoreGuardrails(entrega).some((r) => r.key === "acumulo_atrasadas")).toBe(true);
  });

  it("zero pontos em Entrega com tarefas elegíveis => teto 49", () => {
    const entrega = computeEntrega([], overdue(1));
    expect(entrega.value).toBe(0);
    expect(computeScoreGuardrails(entrega).some((r) => r.key === "entrega_zero")).toBe(true);
  });

  it("nenhuma condição disparada => nenhuma salvaguarda", () => {
    const entrega = computeEntrega(onTime(10), []);
    expect(computeScoreGuardrails(entrega)).toEqual([]);
  });
});

describe("overdueOpenTasks / overdueTaskDetails — estado atual, nunca filtrado por período", () => {
  it("cenário 10: tarefa com prazo do mês anterior, ainda aberta, continua contando como atualmente atrasada", () => {
    const tasks = [{ id: "t1", title: "Tarefa antiga", status: "Aberto", dueDate: "2026-01-05" }];
    const now = new Date("2026-03-01T12:00:00-03:00");
    expect(overdueOpenTasks(tasks, now).length).toBe(1);
  });

  it("cenário 11: tarefa concluída (com atraso) nunca aparece na lista de atualmente atrasadas — listas de entrada são disjuntas por construção (status Concluído sai de OPEN_STATUSES)", () => {
    expect(OPEN_STATUSES.has("Concluído")).toBe(false);
  });

  it("overdueTaskDetails nunca reporta menos de 1 dia de atraso e propaga prioridade alta", () => {
    const tasks = [
      { id: "t1", title: "x", status: "Aberto", dueDate: "2026-01-05", priority: "Urgente" },
    ];
    const now = new Date("2026-01-05T20:00:00-03:00"); // poucas horas após o corte de 19h
    const details = overdueTaskDetails(tasks, now);
    expect(details).toHaveLength(1);
    expect(details[0].daysOverdue).toBeGreaterThanOrEqual(1);
    expect(details[0].highPriority).toBe(true);
  });
});

describe("classifyReplanTiming / isHighPriority / classificacaoDoScore — utilidades", () => {
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

  it("classificacaoDoScore usa os 4 níveis (90/75/60/0)", () => {
    expect(classificacaoDoScore(95)).toBe("Excelente");
    expect(classificacaoDoScore(80)).toBe("Bom");
    expect(classificacaoDoScore(65)).toBe("Atenção");
    expect(classificacaoDoScore(10)).toBe("Crítico");
  });
});
