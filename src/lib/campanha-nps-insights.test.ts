import { describe, expect, it } from "vitest";
import {
  buildCampanhaNpsMonths,
  canReadCampanhaNpsInterno,
  classifyNpsScore,
  formatNpsIndex,
  formatOutOfFive,
  formatReferenceMonth,
  npsDistribution,
  npsIndex,
  ratingToScore,
  type CampanhaNpsEntry,
} from "./campanha-nps-insights";

const entry = (referenceMonth: string, score: number, extra: Partial<CampanhaNpsEntry> = {}) =>
  ({
    id: referenceMonth,
    referenceMonth,
    score,
    satisfactionScore: 4,
    deliveryQuality: "boa",
    communicationRating: "excelente",
    comment: null,
    answeredBy: null,
    answeredByName: null,
    answeredAt: `${referenceMonth}-01T12:00:00Z`,
    ...extra,
  }) satisfies CampanhaNpsEntry;

describe("classifyNpsScore", () => {
  it("usa as faixas 0-6 / 7-8 / 9-10", () => {
    expect([0, 6, 7, 8, 9, 10].map(classifyNpsScore)).toEqual([
      "detrator",
      "detrator",
      "neutro",
      "neutro",
      "promotor",
      "promotor",
    ]);
  });
});

describe("npsIndex", () => {
  it("é %promotores − %detratores", () => {
    expect(npsIndex([10, 9, 8, 3])).toBe(25);
    expect(npsIndex([10, 10, 10, 0])).toBe(50);
    expect(npsIndex([1, 2])).toBe(-100);
  });
  it("devolve null (nunca 0) sem amostra suficiente", () => {
    expect(npsIndex([])).toBeNull();
    expect(npsIndex([10])).toBeNull();
    expect(npsIndex([10], 1)).toBe(100);
  });
  it("neutros puros dão 0 real (com amostra), diferente de ausência", () => {
    expect(npsIndex([7, 8])).toBe(0);
  });
});

describe("npsDistribution", () => {
  it("conta cada categoria", () => {
    expect(npsDistribution([10, 7, 2, 9])).toEqual({
      promotores: 2,
      neutros: 1,
      detratores: 1,
      total: 4,
    });
  });
});

describe("buildCampanhaNpsMonths", () => {
  it("ordena por mês e acumula só até o mês corrente", () => {
    const months = buildCampanhaNpsMonths([
      entry("2026-10", 3),
      entry("2026-08", 10),
      entry("2026-09", 9),
    ]);
    expect(months.map((m) => m.referenceMonth)).toEqual(["2026-08", "2026-09", "2026-10"]);
    expect(months[0].cumulative.nps).toBeNull();
    expect(months[1].cumulative.nps).toBe(100);
    expect(months[2].cumulative.nps).toBe(33);
    expect(months[2].cumulative.distribution).toEqual({
      promotores: 2,
      neutros: 0,
      detratores: 1,
      total: 3,
    });
    expect(months[2].category).toBe("detrator");
    expect(months[2].cumulative.fromMonth).toBe("2026-08");
  });
  it("nunca soma duas respostas do mesmo mês", () => {
    const months = buildCampanhaNpsMonths([entry("2026-09", 10), entry("2026-09", 0)]);
    expect(months).toHaveLength(1);
  });
  it("lista vazia não inventa meses", () => {
    expect(buildCampanhaNpsMonths([])).toEqual([]);
  });
  it("mapeia avaliações textuais para 1-5", () => {
    const [m] = buildCampanhaNpsMonths([entry("2026-09", 8)]);
    expect(m.deliveryScore).toBe(4);
    expect(m.communicationScore).toBe(5);
    expect(ratingToScore("muito_ruim")).toBe(1);
    expect(ratingToScore("??")).toBeNull();
  });
});

describe("formatação", () => {
  it("formata sem nunca transformar ausência em zero", () => {
    expect(formatNpsIndex(null)).toBe("—");
    expect(formatNpsIndex(72)).toBe("+72");
    expect(formatNpsIndex(0)).toBe("0");
    expect(formatNpsIndex(-20)).toBe("-20");
    expect(formatOutOfFive(null)).toBe("—");
    expect(formatOutOfFive(4.5)).toBe("4,5/5");
    expect(formatReferenceMonth("2026-10")).toBe("Outubro 2026");
    expect(formatReferenceMonth("2026-10", true)).toBe("Out/26");
  });
});

describe("canReadCampanhaNpsInterno", () => {
  const base = { isAdmin: false, isInternalMember: false, hasCampanhas: false, hasClientes: false };
  it("admin sempre pode", () => {
    expect(canReadCampanhaNpsInterno({ ...base, isAdmin: true })).toBe(true);
  });
  it("membro interno com campanhas/clientes pode", () => {
    expect(canReadCampanhaNpsInterno({ ...base, isInternalMember: true, hasCampanhas: true })).toBe(
      true,
    );
    expect(canReadCampanhaNpsInterno({ ...base, isInternalMember: true, hasClientes: true })).toBe(
      true,
    );
  });
  it("membro interno sem permissão não pode", () => {
    expect(canReadCampanhaNpsInterno({ ...base, isInternalMember: true })).toBe(false);
  });
  it("usuário do Portal do Cliente (não interno) nunca pode, mesmo com permissão no perfil", () => {
    expect(canReadCampanhaNpsInterno({ ...base, hasCampanhas: true, hasClientes: true })).toBe(
      false,
    );
  });
});
