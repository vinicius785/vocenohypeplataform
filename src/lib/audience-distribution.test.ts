import { describe, expect, it } from "vitest";
import { barWidth, formatShare, hasAudienceData, toDistribution } from "./audience-distribution";

describe("toDistribution", () => {
  it("ordena do maior para o menor, mantém a ordem original no empate e descarta inválidos", () => {
    const r = toDistribution([
      { label: "35–44", percentual: 28.9 },
      { label: "25–34", percentual: 41.7 },
      { label: "  ", percentual: 50 },
      { label: "Zero", percentual: 0 },
      { label: "NaN", percentual: Number.NaN },
      { label: "45–54", percentual: 14.4 },
      { label: "18–24", percentual: 14.4 },
    ]);
    expect(r.items.map((i) => i.label)).toEqual(["25–34", "35–44", "45–54", "18–24"]);
    expect(r.hidden).toBe(0);
  });
  it("limita e informa quantos ficaram de fora (muitos dados)", () => {
    const entries = Array.from({ length: 12 }, (_, i) => ({ label: `C${i}`, percentual: 12 - i }));
    const r = toDistribution(entries, 5);
    expect(r.items).toHaveLength(5);
    expect(r.hidden).toBe(7);
    expect(r.items[0].label).toBe("C0");
  });
  it("sem dados / poucos dados", () => {
    expect(toDistribution(undefined)).toEqual({ items: [], hidden: 0 });
    expect(toDistribution(null)).toEqual({ items: [], hidden: 0 });
    expect(toDistribution([{ label: "Brasil", percentual: 96 }]).items).toEqual([
      { label: "Brasil", percent: 96 },
    ]);
  });
});

describe("formatShare", () => {
  it("pt-BR com até 1 casa e sem ',0'", () => {
    expect(formatShare(79.6)).toBe("79,6%");
    expect(formatShare(96)).toBe("96%");
    expect(formatShare(0.7)).toBe("0,7%");
    expect(formatShare(41.70001)).toBe("41,7%");
    expect(formatShare(20.04)).toBe("20%");
  });
});

describe("barWidth", () => {
  it("share: o percentual é a largura; relative: proporcional ao maior", () => {
    expect(barWidth(41.7, 41.7, "share")).toBe(41.7);
    expect(barWidth(50, 100, "relative")).toBe(50);
    expect(barWidth(8.1, 8.1, "relative")).toBe(100);
    expect(barWidth(6.5, 8.1, "relative")).toBeCloseTo(80.25, 1);
  });
  it("mínimo visível, teto 100 e zero fica zero", () => {
    expect(barWidth(0.1, 100, "share")).toBe(2);
    expect(barWidth(150, 100, "share")).toBe(100);
    expect(barWidth(0, 10, "relative")).toBe(0);
  });
});

describe("hasAudienceData", () => {
  it("só conta entradas válidas", () => {
    expect(hasAudienceData(undefined)).toBe(false);
    expect(hasAudienceData({ genero: [{ label: "", percentual: 10 }] })).toBe(false);
    expect(hasAudienceData({ cidades: [{ label: "São Paulo", percentual: 8.1 }] })).toBe(true);
  });
});
