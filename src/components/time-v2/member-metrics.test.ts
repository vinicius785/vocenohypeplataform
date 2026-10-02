import { describe, expect, it } from "vitest";
import type { DashTask } from "@/lib/task-aggregation";
import {
  assessLoad,
  cycleTimeStats,
  dependencyBreakdownText,
  dependencySummary,
  formatDays,
  formatRelativeChange,
  formatSeries,
  memberProfileInsights,
  relativeChangePct,
  teamAverageOpen,
  type MemberInsightInput,
} from "./member-metrics";
import { memberTaskStats } from "./time-v2-utils";

const task = (over: Partial<DashTask>): DashTask =>
  ({
    id: Math.random().toString(36).slice(2),
    projectId: "p",
    projectName: "Projeto",
    title: "Tarefa",
    bucket: "outro",
    due: "",
    status: "Aberto",
    ...over,
  }) as DashTask;

describe("dependencySummary", () => {
  it("agrupa bloqueios ativos pelas categorias; legado sem categoria vira 'outros'", () => {
    const s = dependencySummary([
      task({ blockCategory: "aguardando_cliente", blockedSince: "2026-09-02T10:00:00Z" }),
      task({ blockCategory: "aguardando_aprovacao", blockedSince: "2026-09-01T10:00:00Z" }),
      task({ blockCategory: "aguardando_time" }),
      task({ status: "Bloqueada" }),
      task({ blockCategory: "aguardando_cliente", status: "Concluído" }), // fechada não conta
      task({}),
    ]);
    expect(s.total).toBe(4);
    expect(s.byGroup).toEqual({ cliente: 1, aprovacao: 1, externa: 0, interna: 1, outro: 1 });
    expect(dependencyBreakdownText(s.byGroup)).toBe(
      "1 aguardando cliente · 1 aguardando aprovação · 1 dependência interna · 1 outros impedimentos",
    );
  });
});

describe("assessLoad", () => {
  it("normal sem atraso, com motivo explícito", () => {
    const r = assessLoad(memberTaskStats([task({}), task({})]), 2);
    expect(r.level).toBe("normal");
    expect(r.reasons).toEqual(["Sem atrasos nem picos de prazo"]);
  });
  it("atraso bloqueado não pesa na classificação, mas aparece como motivo", () => {
    const r = assessLoad(
      memberTaskStats([task({ bucket: "atrasada", blockCategory: "aguardando_cliente" })]),
      null,
    );
    expect(r.level).toBe("normal");
    expect(r.reasons[0]).toContain("bloqueada");
  });
  it("3+ atrasadas = alta; 1 = atenção", () => {
    const many = [1, 2, 3].map(() => task({ bucket: "atrasada" }));
    expect(assessLoad(memberTaskStats(many), null).level).toBe("alta");
    expect(assessLoad(memberTaskStats([task({ bucket: "atrasada" })]), null).level).toBe("atencao");
  });
  it("acima da média do time só com volume mínimo", () => {
    const four = [1, 2, 3, 4].map(() => task({}));
    expect(assessLoad(memberTaskStats(four), 1).level).toBe("normal");
    const ten = Array.from({ length: 10 }, () => task({}));
    const r = assessLoad(memberTaskStats(ten), 4);
    expect(r.level).toBe("atencao");
    expect(r.reasons[0]).toContain("média do time");
  });
  it("média do time ignora quem não tem tarefa", () => {
    expect(teamAverageOpen([memberTaskStats([]), memberTaskStats([task({}), task({})])])).toBe(2);
    expect(teamAverageOpen([memberTaskStats([])])).toBeNull();
  });
});

describe("cycleTimeStats", () => {
  const range = { from: "2026-09-01", to: "2026-09-30" };
  it("ciclo = em andamento → conclusão; fora do período e sem início ficam fora", () => {
    const s = cycleTimeStats(
      [
        task({
          status: "Concluído",
          createdAt: "2026-09-01T12:00:00Z",
          startedAt: "2026-09-02T12:00:00Z",
          completedAt: "2026-09-04T12:00:00Z",
        }),
        task({
          status: "Concluído",
          createdAt: "2026-09-10T12:00:00Z",
          completedAt: "2026-09-11T12:00:00Z",
        }),
        task({
          status: "Concluído",
          startedAt: "2026-08-01T12:00:00Z",
          completedAt: "2026-08-03T12:00:00Z",
        }),
        task({ status: "Em andamento", startedAt: "2026-09-02T12:00:00Z" }),
      ],
      range,
    );
    expect(s.completedInRange).toBe(2);
    expect(s.cycleSample).toBe(1);
    expect(s.cycleDays).toBeCloseTo(2);
    expect(s.leadSample).toBe(2);
    expect(s.leadDays).toBeCloseTo(2);
  });
  it("sem conclusões devolve null, nunca 0", () => {
    const s = cycleTimeStats([], range);
    expect(s.cycleDays).toBeNull();
    expect(formatDays(s.cycleDays)).toBe("—");
  });
  it("formatação", () => {
    expect(formatDays(2.4)).toBe("2,4 dias");
    expect(formatDays(0.25)).toBe("6 h");
  });
});

describe("tendência", () => {
  it("variação relativa e rótulo", () => {
    expect(relativeChangePct(18, 20)).toBeCloseTo(-10);
    expect(relativeChangePct(10, null)).toBeNull();
    expect(relativeChangePct(10, 0)).toBeNull();
    expect(formatRelativeChange(-12.3)).toBe("↓ 12% vs período anterior");
    expect(formatRelativeChange(8)).toBe("↑ 8% vs período anterior");
    expect(formatRelativeChange(null)).toBeNull();
  });
  it("série mostra lacunas como travessão", () => {
    expect(formatSeries([78, null, 90], (v) => `${v}%`)).toBe("78% → — → 90%");
  });
});

describe("memberProfileInsights", () => {
  const base: MemberInsightInput = {
    overdueUnblocked: 0,
    dueToday: 0,
    onTimePct: null,
    onTimeSample: 0,
    onTimePctPrevious: null,
    onTimeSamplePrevious: 0,
    responseAvgSeconds: null,
    responseAvgSecondsPrevious: null,
    replans: 0,
    replansPrevious: 0,
    dependencies: { cliente: 0, aprovacao: 0, externa: 0, interna: 0, outro: 0 },
  };
  it("sem dados = nenhum insight (nunca texto genérico)", () => {
    expect(memberProfileInsights(base)).toEqual([]);
  });
  it("frases objetivas a partir de dados reais", () => {
    const r = memberProfileInsights({
      ...base,
      overdueUnblocked: 3,
      onTimePct: 92,
      onTimeSample: 12,
      responseAvgSeconds: 18 * 60,
      responseAvgSecondsPrevious: 31 * 60,
      dependencies: { ...base.dependencies, cliente: 1, aprovacao: 1 },
    });
    expect(r.map((i) => i.text)).toEqual([
      "3 tarefas estão atrasadas.",
      "92% das tarefas foram concluídas no prazo.",
      "Tempo médio de resposta caiu de 31 min para 18 min.",
      "2 tarefas aguardam terceiros (cliente, aprovação ou parceiro).",
    ]);
  });
  it("amostra pequena não gera insight de prazo", () => {
    const r = memberProfileInsights({ ...base, onTimePct: 100, onTimeSample: 1 });
    expect(r).toEqual([]);
  });
  it("tendência de prazo só com amostra nos dois períodos", () => {
    const r = memberProfileInsights({
      ...base,
      onTimePct: 90,
      onTimeSample: 10,
      onTimePctPrevious: 70,
      onTimeSamplePrevious: 10,
    });
    expect(r[0]).toEqual({ kind: "tendencia", text: "Conclusão no prazo subiu de 70% para 90%." });
  });
});
