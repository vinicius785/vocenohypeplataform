import { describe, expect, it } from "vitest";
import { mapResponseTimeRow, mapTeamResponseRows } from "@/lib/member-response-time";
import type { MemberInsightBundle } from "@/lib/insights-engine";
import { generateTeamInsights } from "./team-insights-v2";
import {
  buildMemberSignals,
  insightWindows,
  memberIdResolver,
  newTaskCounts,
  rangeLabel,
} from "./team-metrics";
import { last30Range } from "./team-v2";

describe("janelas dos Insights", () => {
  it("30 dias terminando hoje, e os 30 anteriores contíguos e sem sobreposição", () => {
    const w = insightWindows("2026-10-06");
    expect(w.current).toEqual({ from: "2026-09-07", to: "2026-10-06" });
    expect(w.previous).toEqual({ from: "2026-08-08", to: "2026-09-06" });
    const dias = (r: { from: string; to: string }) =>
      (Date.parse(r.to) - Date.parse(r.from)) / 86_400_000 + 1;
    expect(dias(w.current)).toBe(30);
    expect(dias(w.previous)).toBe(30);
    expect(Date.parse(w.current.from) - Date.parse(w.previous.to)).toBe(86_400_000);
  });
  it("virada de ano e de mês", () => {
    expect(insightWindows("2027-01-05").current.from).toBe("2026-12-07");
    expect(insightWindows("2026-03-01").previous.to).toBe("2026-01-30");
  });
  it("a janela do `team-v2` é a MESMA (uma só definição)", () => {
    expect(last30Range("2026-10-06")).toEqual(insightWindows("2026-10-06").current);
  });
  it("rótulo da janela", () => {
    expect(rangeLabel({ from: "2026-10-01", to: "2026-10-06" })).toBe("1 a 6 de out.");
    expect(rangeLabel({ from: "2026-09-07", to: "2026-10-06" })).toBe("7 de set. a 6 de out.");
    expect(rangeLabel({ from: "2026-10-06", to: "2026-10-06" })).toBe("6 de out.");
  });
});

describe("identidade da pessoa", () => {
  it("nome repetido é ambíguo e não resolve", () => {
    const r = memberIdResolver([
      { id: "a", name: "Ana Souza" },
      { id: "b", name: "Bruno Lima" },
      { id: "c", name: "Ana Souza" },
    ]);
    expect(r("Bruno Lima")).toBe("b");
    expect(r("Ana Souza")).toBeUndefined();
    expect(r("Fulano")).toBeUndefined();
  });
});

describe("tarefas novas (definição única)", () => {
  const resolve = memberIdResolver([
    { id: "v", name: "Vinícius" },
    { id: "t", name: "Toni" },
  ]);
  const w = { from: "2026-09-07", to: "2026-10-06" };
  const dayOf = (c: string) => c.slice(0, 10);
  const t = (createdAt: string | undefined, assignees: string[], parentTitle?: string) => ({
    createdAt,
    assignees,
    parentTitle,
  });
  it("conta tarefas raiz uma vez; subtarefas não contam", () => {
    const r = newTaskCounts(
      [
        t("2026-10-01", ["Vinícius"]),
        t("2026-10-02", ["Vinícius"], "Mãe"),
        t("2026-10-02", ["Vinícius"], "Mãe"),
        t("2026-10-03", ["Toni"]),
      ],
      w,
      resolve,
      dayOf,
    );
    expect(r.total).toBe(2);
    expect(r.byMember.get("v")).toBe(1);
    expect(r.byMember.get("t")).toBe(1);
  });
  it("tarefa com 2 responsáveis: 1 no total, 1 para cada", () => {
    const r = newTaskCounts([t("2026-10-01", ["Vinícius", "Toni"])], w, resolve, dayOf);
    expect(r.total).toBe(1);
    expect(r.byMember.get("v")).toBe(1);
    expect(r.byMember.get("t")).toBe(1);
  });
  it("fora da janela, sem data e responsável desconhecido", () => {
    const r = newTaskCounts(
      [
        t("2026-09-06", ["Vinícius"]),
        t("2026-10-07", ["Vinícius"]),
        t(undefined, ["Vinícius"]),
        t("2026-10-01", ["Pessoa Que Saiu"]),
      ],
      w,
      resolve,
      dayOf,
    );
    expect(r.total).toBe(1);
    expect(r.byMember.size).toBe(0);
  });
  it("fuso: 02:00 UTC já é o dia anterior em Brasília", () => {
    const r = newTaskCounts(
      [t("2026-10-06T02:30:00Z", ["Vinícius"])],
      { from: "2026-10-05", to: "2026-10-05" },
      resolve,
    );
    expect(r.total).toBe(1);
  });
  it("reatribuição: vale o responsável ATUAL", () => {
    const r = newTaskCounts([t("2026-10-01", ["Toni"])], w, resolve, dayOf);
    expect(r.byMember.get("v")).toBeUndefined();
    expect(r.byMember.get("t")).toBe(1);
  });
});

describe("consistência: mesma pessoa, mesma janela, mesma definição", () => {
  it("comunicação: o valor do detalhe do membro = o da tabela/Insights", () => {
    const row = {
      direct_answered: 6,
      direct_unanswered: 0,
      direct_avg_seconds: 300,
      direct_median_seconds: 240,
      mention_answered: 4,
      mention_unanswered: 1,
      mention_avg_seconds: 800,
      mention_median_seconds: 500,
      all_avg_seconds: 500,
      all_median_seconds: 300,
    };
    const detalhe = mapResponseTimeRow(row).all;
    const time = mapTeamResponseRows([
      { member_id: "vini", answered_count: 10, average_seconds: row.all_avg_seconds },
    ]).byMemberId.get("vini")!;
    expect(time.averageSeconds).toBe(detalhe.averageSeconds);
    expect(time.answered).toBe(detalhe.answered);
  });
  it("sem mensagens / poucas mensagens: sem média, sem insight de resposta", () => {
    const vazio = mapTeamResponseRows([
      { member_id: "v", answered_count: 0, average_seconds: null },
    ]);
    expect(vazio.byMemberId.get("v")!.averageSeconds).toBeNull();
    expect(mapTeamResponseRows(null).teamAverageSeconds).toBeNull();
  });
  const bundle = (o: Partial<MemberInsightBundle> = {}): MemberInsightBundle =>
    ({
      memberId: "v",
      memberName: "Vinícius",
      openTasksCount: 9,
      overdueCount: 2,
      overdueHighPriorityCount: 1,
      overdueOlderThanThresholdCount: 0,
      onTimeRateCurrent: 80,
      onTimeRatePrevious: 70,
      onTimeSampleCurrent: 10,
      onTimeSamplePrevious: 9,
      replansCurrent: 3,
      replansPrevious: 2,
      criticalReplansCurrent: 1,
      criticalReplansPrevious: 0,
      repeatedProblematicReplansCurrent: 0,
      meetingsExpected: 4,
      meetingsAttended: 3,
      ...o,
    }) as MemberInsightBundle;
  it("tarefas: os sinais usam exatamente os números do bundle (mesma fonte do detalhe)", () => {
    const s = buildMemberSignals(bundle(), {
      newTasks: 5,
      newTasksPrev: 4,
      response: { averageSeconds: 480, answered: 12 },
      responsePrev: undefined,
    });
    expect(s).toMatchObject({
      openCount: 9,
      overdueCount: 2,
      onTimeRate: 80,
      onTimeSample: 10,
      criticalReplans: 1,
      meetingsAttended: 3,
      responseAvg: 480,
      answered: 12,
      responseAvgPrev: null,
    });
  });
  it("o texto do Insight usa o total de tarefas DISTINTAS, não a soma das atribuições", () => {
    const sig = (id: string, newTasks: number) =>
      buildMemberSignals(bundle({ memberId: id, memberName: id.toUpperCase() }), {
        newTasks,
        newTasksPrev: 0,
        response: undefined,
        responsePrev: undefined,
      });
    const members = [sig("a", 12), sig("b", 3), sig("c", 3), sig("d", 2)];
    // 4 tarefas têm 2 responsáveis: soma das atribuições = 20, mas são 16 tarefas distintas.
    const out = generateTeamInsights(
      { members, edges: [], tasks: new Map(), newTasksTotal: 16 },
      null,
    );
    const d = out.find((i) => i.ruleId === "maior_volume_demandas")!;
    expect(d.evidence).toContain("12 das 16 tarefas criadas nos últimos 30 dias (75%)");
    expect(d.window).toBe("últimos 30 dias");
    expect(d.caveat).toContain("sem subtarefas");
  });
  it("dados insuficientes: sem tarefas novas, nada de demanda", () => {
    const members = ["a", "b", "c", "d"].map((id) =>
      buildMemberSignals(bundle({ memberId: id, memberName: id }), {
        newTasks: 0,
        newTasksPrev: 0,
        response: undefined,
        responsePrev: undefined,
      }),
    );
    const out = generateTeamInsights(
      { members, edges: [], tasks: new Map(), newTasksTotal: 0 },
      null,
    );
    expect(
      out.some((i) => i.ruleId.includes("demand") || i.ruleId === "maior_volume_demandas"),
    ).toBe(false);
  });
});
