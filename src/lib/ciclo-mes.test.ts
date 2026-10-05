import { describe, expect, it } from "vitest";
import { cicloMesLabel, parseCicloMes, participationMonth } from "./ciclo-mes";

describe("ciclo-mes", () => {
  it("rótulo em português", () => {
    expect(cicloMesLabel("2026-10")).toBe("Outubro de 2026");
    expect(cicloMesLabel("2026-03")).toBe("Março de 2026");
    expect(cicloMesLabel("2026-13")).toBeNull();
    expect(cicloMesLabel("2026-1")).toBeNull();
    expect(cicloMesLabel(undefined)).toBeNull();
  });
  it("parse", () => {
    expect(parseCicloMes("2026-12")).toEqual({ year: 2026, month: 12 });
    expect(parseCicloMes("abc")).toBeNull();
  });
  it("mês da participação: cicloMes válido vence; sem ele cai no mês de criação", () => {
    expect(participationMonth({ cicloMes: "2026-10", createdAt: "2026-11-02T10:00:00Z" })).toBe(
      "2026-10",
    );
    expect(participationMonth({ createdAt: "2026-11-02T10:00:00Z" })).toBe("2026-11");
    expect(participationMonth({ cicloMes: "lixo", createdAt: "2026-09-30T00:00:00Z" })).toBe(
      "2026-09",
    );
    expect(participationMonth({})).toBeNull();
  });
});
