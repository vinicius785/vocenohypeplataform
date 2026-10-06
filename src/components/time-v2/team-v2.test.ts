import { describe, expect, it } from "vitest";
import type { Insight } from "@/lib/insights-engine";
import type { DashTask } from "@/lib/task-aggregation";
import {
  curateInsights,
  insightTargetView,
  last30Range,
  teamPerformance,
  trendPP,
} from "./team-v2";

const ins = (memberId: string, ruleId: string, priority: number): Insight => ({
  ruleId,
  memberId,
  memberName: memberId,
  nature: "atencao",
  category: "risco",
  text: `${memberId} ${ruleId}`,
  priority,
});

describe("curateInsights", () => {
  it("corta abaixo de 55, 1 por pessoa (o de maior prioridade) e no máximo 4", () => {
    const out = curateInsights([
      ins("a", "r1", 80),
      ins("a", "r2", 100),
      ins("b", "r3", 54),
      ins("c", "r4", 70),
      ins("d", "r5", 60),
      ins("e", "r6", 58),
      ins("f", "r7", 57),
    ]);
    expect(out.map((i) => i.ruleId)).toEqual(["r2", "r4", "r5", "r6"]);
  });
  it("não preenche artificialmente: poucos relevantes → poucos", () => {
    expect(curateInsights([ins("a", "x", 90), ins("b", "y", 20)])).toHaveLength(1);
    expect(curateInsights([])).toEqual([]);
  });
});

describe("insightTargetView", () => {
  it("leva ao contexto certo do detalhe", () => {
    expect(insightTargetView("atrasadas_prioridade_alta")).toBe("tarefas");
    expect(insightTargetView("volume_acima_media")).toBe("tarefas");
    expect(insightTargetView("pontualidade_queda")).toBe("desempenho");
    expect(insightTargetView("inicio_dia_frequencia")).toBe("jornada");
  });
});

describe("teamPerformance", () => {
  const b = (rc: number | null, sc: number, rp: number | null, sp: number, pc = 0, pp = 0) => ({
    onTimeRateCurrent: rc,
    onTimeSampleCurrent: sc,
    onTimeRatePrevious: rp,
    onTimeSamplePrevious: sp,
    replansCurrent: pc,
    replansPrevious: pp,
  });
  it("no prazo é ponderado pela amostra; replanejamentos somam; sem amostra → null", () => {
    const r = teamPerformance(
      [b(100, 10, 50, 10, 2, 1), b(0, 10, null, 0, 3, 4), b(null, 0, null, 0)],
      [],
      "2026-10-06",
    );
    expect(r.onTime.value).toBe(50);
    expect(r.onTime.previous).toBe(50);
    expect(r.onTime.sample).toBe(20);
    expect(r.replans).toEqual({ value: 5, previous: 5 });
    expect(r.cycle.days).toBeNull();
    expect(teamPerformance([], [], "2026-10-06").onTime.value).toBeNull();
  });
  it("tempo de ciclo vem das tarefas concluídas na janela de 30 dias", () => {
    const t = (completedAt: string, startedAt: string) =>
      ({ id: completedAt, status: "Concluído", completedAt, startedAt }) as unknown as DashTask;
    const r = teamPerformance(
      [],
      [
        t("2026-10-05T12:00:00-03:00", "2026-10-03T12:00:00-03:00"),
        t("2026-09-01T12:00:00-03:00", "2026-08-30T12:00:00-03:00"),
      ],
      "2026-10-06",
    );
    expect(r.cycle.days).toBeCloseTo(2, 5);
    expect(r.cycle.previousDays).toBeCloseTo(2, 5);
  });
  it("a janela é o mês corrente até hoje", () => {
    expect(last30Range("2026-10-06")).toEqual({ from: "2026-10-01", to: "2026-10-06" });
  });
});

describe("trendPP", () => {
  it("setas, estável e sem base", () => {
    expect(trendPP(13, 41)).toBe("↓ 28 pp");
    expect(trendPP(50, 42)).toBe("↑ 8 pp");
    expect(trendPP(50, 50.4)).toBe("estável");
    expect(trendPP(null, 40)).toBeNull();
  });
});
