import { describe, expect, it } from "vitest";
import {
  generateTeamInsights,
  previous30Range,
  ruleAtraso,
  ruleCarga,
  ruleDependencias,
  ruleDestaque,
  ruleMaisDemandado,
  ruleReplanejamento,
  ruleResposta,
  ruleTendenciasTime,
  selectTeamInsights,
  type MemberSignals,
  type TeamInsightV2,
} from "./team-insights-v2";

const sig = (id: string, o: Partial<MemberSignals> = {}): MemberSignals => ({
  id,
  name: `Pessoa ${id.toUpperCase()}`,
  openCount: 4,
  overdueCount: 0,
  overdueHighPriority: 0,
  overdueOld: 0,
  newTasks: 3,
  newTasksPrev: 3,
  onTimeRate: 70,
  onTimeRatePrev: 70,
  onTimeSample: 10,
  onTimeSamplePrev: 10,
  replans: 1,
  replansPrev: 1,
  criticalReplans: 0,
  criticalReplansPrev: 0,
  repeatedReplans: 0,
  meetingsExpected: 4,
  meetingsAttended: 4,
  responseAvg: 600,
  responseAvgPrev: 600,
  answered: 10,
  answeredPrev: 10,
  ...o,
});
const time = (...over: Partial<MemberSignals>[]) =>
  over.map((o, i) => sig(String.fromCharCode(97 + i), o));

describe("acúmulo por atraso (não é sobrecarga)", () => {
  it("muitas abertas, a maioria atrasada → acúmulo por atraso, sem a palavra sobrecarga", () => {
    const i = ruleAtraso(sig("a", { openCount: 8, overdueCount: 5 }))!;
    expect(i.ruleId).toBe("atraso");
    expect(i.evidence).toContain("8 tarefas abertas, 5 atrasadas");
    expect(`${i.evidence} ${i.reading}`.toLowerCase()).not.toContain("sobrecarg");
    expect(i.reading).toContain("não de volume novo");
  });
  it("junta atraso + queda de pontualidade numa única frase (mesma causa)", () => {
    const i = ruleAtraso(
      sig("a", {
        openCount: 8,
        overdueCount: 5,
        overdueHighPriority: 1,
        onTimeRate: 13,
        onTimeRatePrev: 41,
      }),
    )!;
    expect(i.evidence).toContain("5 atrasadas");
    expect(i.evidence).toContain("de 41% para 13%");
    expect(i.priority).toBe(0);
  });
  it("sem amostra mínima, a queda não dispara", () => {
    expect(
      ruleAtraso(sig("a", { onTimeRate: 10, onTimeRatePrev: 60, onTimeSample: 2 })),
    ).toBeNull();
  });
});

describe("carga acima do esperado e concentração de demandas", () => {
  it("muitas tarefas, mas conclui normalmente e sem demanda nova → NADA (volume ≠ sobrecarga)", () => {
    const t = time({ openCount: 12, newTasks: 2 }, {}, {}, {});
    expect(ruleCarga(t[0], t)).toBeNull();
  });
  it("muitas tarefas porque atrasou → não é carga (vira acúmulo por atraso)", () => {
    const t = time(
      { openCount: 12, overdueCount: 8, newTasks: 6 },
      { newTasks: 6 },
      { newTasks: 6 },
      { newTasks: 6 },
    );
    expect(ruleCarga(t[0], t)).toBeNull();
    expect(ruleAtraso(t[0])).not.toBeNull();
  });
  it("recebeu muitas tarefas novas e concentra as abertas → carga acima do esperado, com ressalva", () => {
    const t = time(
      { openCount: 12, newTasks: 10 },
      { newTasks: 2 },
      { newTasks: 2 },
      { newTasks: 2 },
    );
    const i = ruleCarga(t[0], t)!;
    expect(i.ruleId).toBe("carga_acima");
    expect(i.evidence).toContain("das tarefas abertas do time");
    expect(i.evidence).toContain("das tarefas criadas nos últimos 30 dias");
    expect(i.caveat).toContain("reatribuições");
  });
  it("só concentração de novas demandas → concentracao_demandas", () => {
    const t = time(
      { openCount: 4, newTasks: 9 },
      { newTasks: 4 },
      { newTasks: 4 },
      { newTasks: 3 },
    );
    expect(ruleCarga(t[0], t)!.ruleId).toBe("concentracao_demandas");
  });
  it("time pequeno demais para comparar → nada", () => {
    const t = time({ openCount: 12, newTasks: 12 }, {});
    expect(ruleCarga(t[0], t)).toBeNull();
  });
});

describe("mais demandado (≥ 3 sinais)", () => {
  it("lidera em 3 sinais → insight; não é chamado de sobrecarga", () => {
    const t = time(
      { openCount: 10, newTasks: 9, answered: 30, meetingsAttended: 4 },
      { openCount: 4, newTasks: 3, answered: 10, meetingsAttended: 4 },
      { openCount: 4, newTasks: 3, answered: 10, meetingsAttended: 4 },
      { openCount: 4, newTasks: 3, answered: 10, meetingsAttended: 4 },
    );
    const i = ruleMaisDemandado(t)!;
    expect(i.memberId).toBe("a");
    expect(i.evidence).toContain("tarefas abertas");
    expect(i.evidence).toContain("demandas respondidas");
    expect(i.reading).toContain("não de sobrecarga");
  });
  it("só 2 sinais → nada", () => {
    const t = time(
      { openCount: 10, newTasks: 9 },
      { openCount: 4, newTasks: 3 },
      { openCount: 4, newTasks: 3 },
      { openCount: 4, newTasks: 3 },
    );
    expect(ruleMaisDemandado(t)).toBeNull();
  });
});

describe("performance e execução", () => {
  it("replanejamento crítico recorrente", () => {
    const i = ruleReplanejamento(sig("a", { criticalReplans: 7, criticalReplansPrev: 3 }))!;
    expect(i.evidence).toContain("replanejou 7 tarefas");
    expect(ruleReplanejamento(sig("a", { criticalReplans: 4, criticalReplansPrev: 3 }))).toBeNull();
  });
  it("boa previsibilidade exige evidência (≥90%, sem crítico, sem atraso, amostra)", () => {
    expect(ruleDestaque(sig("a", { onTimeRate: 100, onTimeSample: 8 }))!.ruleId).toBe(
      "previsibilidade",
    );
    expect(ruleDestaque(sig("a", { onTimeRate: 100, onTimeSample: 2 }))).toBeNull();
    expect(
      ruleDestaque(
        sig("a", { onTimeRate: 100, onTimeRatePrev: 100, onTimeSample: 8, overdueCount: 1 }),
      ),
    ).toBeNull();
  });
  it("melhora de conclusão no prazo é reconhecimento", () => {
    const i = ruleDestaque(sig("a", { onTimeRate: 68, onTimeRatePrev: 41 }))!;
    expect(i.ruleId).toBe("pontualidade_melhora");
    expect(i.category).toBe("destaque");
  });
});

describe("tempo de resposta", () => {
  it("piora relevante com amostra", () => {
    const i = ruleResposta(sig("a", { responseAvg: 3600, responseAvgPrev: 1800 }))!;
    expect(i.ruleId).toBe("resposta_piora");
    expect(i.evidence).toContain("subiu 100%");
  });
  it("melhora relevante é destaque", () => {
    const i = ruleResposta(sig("a", { responseAvg: 420, responseAvgPrev: 7740 }))!;
    expect(i.ruleId).toBe("resposta_melhora");
    expect(i.evidence).toContain("2h 09min");
    expect(i.evidence).toContain("7 min");
  });
  it("sem amostra ou sem período anterior → nada", () => {
    expect(
      ruleResposta(sig("a", { answered: 2, responseAvg: 3600, responseAvgPrev: 600 })),
    ).toBeNull();
    expect(ruleResposta(sig("a", { responseAvgPrev: null }))).toBeNull();
  });
});

describe("dependências formais", () => {
  const m = time({}, {}, {});
  const tasks = new Map(
    [
      ["t1", "Roteiro", ["a"], true],
      ["t2", "Gravação", ["b"], true],
      ["t3", "Edição", ["b"], true],
      ["t4", "Postagem", ["c"], true],
      ["t5", "Concluída", ["c"], false],
    ].map(([id, title, memberIds, open]) => [
      id as string,
      {
        id: id as string,
        title: title as string,
        memberIds: memberIds as string[],
        open: open as boolean,
      },
    ]),
  );
  it("gargalo: uma tarefa bloqueando 3 entregas", () => {
    const out = ruleDependencias({
      members: m,
      tasks,
      edges: [
        { blockingTaskId: "t1", blockedTaskId: "t2" },
        { blockingTaskId: "t1", blockedTaskId: "t3" },
        { blockingTaskId: "t1", blockedTaskId: "t4" },
      ],
    });
    expect(out.find((i) => i.ruleId === "gargalo")!.evidence).toContain("bloqueando 3 outras");
    const quem = out.find((i) => i.ruleId === "mais_bloqueia")!;
    expect(quem.memberId).toBe("a");
    expect(quem.evidence).toContain("3 tarefas do time estão aguardando entregas de Pessoa A");
  });
  it("mais bloqueada: 3 tarefas esperando outras pessoas", () => {
    const t2 = new Map(tasks);
    t2.set("t6", { id: "t6", title: "X", memberIds: ["a"], open: true });
    t2.set("t7", { id: "t7", title: "Y", memberIds: ["a"], open: true });
    t2.set("t8", { id: "t8", title: "Z", memberIds: ["a"], open: true });
    const out = ruleDependencias({
      members: m,
      tasks: t2,
      edges: [
        { blockingTaskId: "t2", blockedTaskId: "t6" },
        { blockingTaskId: "t3", blockedTaskId: "t7" },
        { blockingTaskId: "t4", blockedTaskId: "t8" },
      ],
    });
    expect(out.find((i) => i.ruleId === "mais_bloqueado")!.memberId).toBe("a");
  });
  it("tarefa bloqueadora já concluída ou sem relação formal → nada", () => {
    expect(
      ruleDependencias({
        members: m,
        tasks,
        edges: [{ blockingTaskId: "t5", blockedTaskId: "t2" }],
      }),
    ).toEqual([]);
    expect(ruleDependencias({ members: m, tasks, edges: [] })).toEqual([]);
  });
});

describe("tendências do time", () => {
  it("só variações relevantes e com base", () => {
    const out = ruleTendenciasTime({
      tasksCreated: { current: 64, previous: 50 },
      replans: { current: 12, previous: 10 },
      response: { current: 1080, previous: 2520, answered: 40 },
    });
    expect(out.map((i) => i.ruleId).sort()).toEqual(["tendencia_resposta", "tendencia_tarefas"]);
    expect(out.find((i) => i.ruleId === "tendencia_tarefas")!.evidence).toContain("28% mais");
  });
  it("base pequena ou mudança irrelevante → nada", () => {
    expect(
      ruleTendenciasTime({
        tasksCreated: { current: 3, previous: 2 },
        replans: { current: 11, previous: 10 },
        response: { current: null, previous: null, answered: 0 },
      }),
    ).toEqual([]);
  });
});

describe("seleção", () => {
  const mkI = (
    ruleId: string,
    memberId: string | undefined,
    priority: TeamInsightV2["priority"],
    cat: TeamInsightV2["category"] = "atencao",
    weight = 1,
  ): TeamInsightV2 => ({
    id: `${ruleId}:${memberId ?? "t"}`,
    ruleId,
    category: cat,
    priority,
    memberId,
    memberName: memberId,
    evidence: "e",
    reading: "r",
    weight,
  });
  it("ordena P0→P3, 1 por pessoa, no máximo 2 destaques e 6 no total", () => {
    const all = [
      mkI("a1", "a", 1),
      mkI("a0", "a", 0),
      mkI("b", "b", 3, "destaque"),
      mkI("c", "c", 3, "destaque"),
      mkI("d", "d", 3, "destaque"),
      mkI("t1", undefined, 2, "tendencia"),
      mkI("e", "e", 1),
      mkI("f", "f", 1),
      mkI("g", "g", 1),
    ];
    const out = selectTeamInsights(all);
    expect(out).toHaveLength(6);
    expect(out[0].ruleId).toBe("a0");
    expect(out.filter((i) => i.memberId === "a")).toHaveLength(1);
    expect(out.filter((i) => i.category === "destaque").length).toBeLessThanOrEqual(2);
  });
  it("poucos relevantes → poucos; sem dados → vazio", () => {
    expect(selectTeamInsights([mkI("x", "a", 1)])).toHaveLength(1);
    expect(generateTeamInsights({ members: [], edges: [], tasks: new Map() }, null)).toEqual([]);
  });
  it("limiares são sobrescrevíveis (ajuste sem mexer nas regras)", () => {
    const a = sig("a", { openCount: 5, overdueCount: 3 });
    expect(ruleAtraso(a)).not.toBeNull();
    expect(ruleAtraso(a, { acumuloPctAbertas: 0.9, acumuloMinAtrasadas: 5 })).toBeNull();
  });
  it("janela anterior de 30 dias", () => {
    expect(previous30Range("2026-10-06")).toEqual({ from: "2026-08-08", to: "2026-09-06" });
  });
});
