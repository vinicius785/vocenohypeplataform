import { describe, expect, it } from "vitest";
import { formatMetricValue, NOT_INFORMED } from "../lib/metric-format";

describe("formatMetricValue — nunca finge um zero real (teste obrigatório #9)", () => {
  it("undefined vira 'Não informado', nunca 0", () => {
    expect(formatMetricValue(undefined)).toBe(NOT_INFORMED);
  });

  it("null vira 'Não informado'", () => {
    expect(formatMetricValue(null)).toBe(NOT_INFORMED);
  });

  it("0 real é mostrado como 0, não como 'Não informado' (0 é um dado, não ausência dele)", () => {
    expect(formatMetricValue(0)).toBe("0");
  });

  it("formata com separador de milhar em pt-BR", () => {
    expect(formatMetricValue(12345)).toBe("12.345");
  });

  it("aceita um sufixo (ex.: percentual)", () => {
    expect(formatMetricValue(5.2, "%")).toBe("5,2%");
  });
});
