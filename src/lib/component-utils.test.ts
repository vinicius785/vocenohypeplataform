import { describe, expect, it } from "vitest";
import { formatMetricDelta, resolveSegmentedValue } from "./component-utils";

describe("formatMetricDelta", () => {
  it("retorna null quando não há delta (nunca inventa 0%)", () => {
    expect(formatMetricDelta(null)).toBeNull();
    expect(formatMetricDelta(undefined)).toBeNull();
  });

  it("formata variação positiva com sinal e direção up", () => {
    expect(formatMetricDelta({ value: 12 })).toEqual({ text: "+12%", direction: "up" });
  });

  it("formata variação negativa com direção down", () => {
    expect(formatMetricDelta({ value: -8 })).toEqual({ text: "-8%", direction: "down" });
  });

  it("variação zero é direção flat, sem sinal", () => {
    expect(formatMetricDelta({ value: 0 })).toEqual({ text: "0%", direction: "flat" });
  });

  it("inclui o label quando informado", () => {
    expect(formatMetricDelta({ value: 5, label: "vs. mês anterior" })).toEqual({
      text: "+5% vs. mês anterior",
      direction: "up",
    });
  });
});

describe("resolveSegmentedValue", () => {
  const options = ["lista", "grade"] as const;

  it("mantém o valor quando ele é uma opção válida", () => {
    expect(resolveSegmentedValue("grade", options)).toBe("grade");
  });

  it("cai pro primeiro valor válido quando o valor não existe nas opções", () => {
    expect(resolveSegmentedValue("mapa" as never, options)).toBe("lista");
  });
});
