import { describe, expect, it } from "vitest";
import {
  adjacentCycle,
  cycleKey,
  formatCompetenceLabel,
  resolveActiveCycle,
} from "../lib/competencia";
import type { PublicCampaignCycle } from "@/lib/portal-types";

const cycles: PublicCampaignCycle[] = [
  { id: "c-ago", competenceYear: 2026, competenceMonth: 8, status: "closed" },
  { id: "c-set", competenceYear: 2026, competenceMonth: 9, status: "active" },
  { id: "c-out", competenceYear: 2026, competenceMonth: 10, status: "active" },
];

describe("cycleKey / formatCompetenceLabel", () => {
  it("formata a chave curta e o rótulo em português", () => {
    expect(cycleKey(cycles[1])).toBe("2026-09");
    expect(formatCompetenceLabel(cycles[1])).toBe("Setembro de 2026");
  });
});

describe("resolveActiveCycle — nunca mistura meses, nunca adivinha", () => {
  it("sem ciclos, retorna null (estado vazio)", () => {
    expect(resolveActiveCycle([], undefined)).toBeNull();
    expect(resolveActiveCycle(undefined, undefined)).toBeNull();
  });

  it("usa o parâmetro da URL quando ele existe de verdade nesta campanha", () => {
    const result = resolveActiveCycle(cycles, "2026-08", new Date("2026-09-15"));
    expect(result?.id).toBe("c-ago");
  });

  it("ignora um parâmetro de URL inválido/de outra campanha e cai no default, nunca mistura tudo", () => {
    const result = resolveActiveCycle(cycles, "2099-01", new Date("2026-09-15"));
    expect(result?.id).toBe("c-set");
  });

  it("sem parâmetro válido, usa o ciclo do mês corrente quando existe", () => {
    const result = resolveActiveCycle(cycles, undefined, new Date("2026-09-15"));
    expect(result?.id).toBe("c-set");
  });

  it("sem ciclo do mês corrente, usa o mais recente disponível", () => {
    const result = resolveActiveCycle(cycles, undefined, new Date("2027-01-01"));
    expect(result?.id).toBe("c-out");
  });
});

describe("adjacentCycle", () => {
  it("navega pro mês anterior/seguinte só entre ciclos que existem de verdade", () => {
    expect(adjacentCycle(cycles, cycles[1], -1)?.id).toBe("c-ago");
    expect(adjacentCycle(cycles, cycles[1], 1)?.id).toBe("c-out");
    expect(adjacentCycle(cycles, cycles[2], 1)).toBeNull();
    expect(adjacentCycle(cycles, cycles[0], -1)).toBeNull();
  });

  it("sem ciclo ativo, não navega", () => {
    expect(adjacentCycle(cycles, null, 1)).toBeNull();
  });
});
