import { describe, expect, it } from "vitest";
import { compareValues, sortRows } from "./data-table-utils";

describe("compareValues", () => {
  it("ordena números ascendente e descendente", () => {
    expect(compareValues(1, 2, "asc")).toBeLessThan(0);
    expect(compareValues(1, 2, "desc")).toBeGreaterThan(0);
  });

  it("ordena strings em pt-BR, ignorando maiúsculas/acentos onde faz sentido", () => {
    expect(compareValues("Ana", "bruno", "asc")).toBeLessThan(0);
  });

  it("ordena datas pela posição temporal", () => {
    const a = new Date("2026-01-01");
    const b = new Date("2026-06-01");
    expect(compareValues(a, b, "asc")).toBeLessThan(0);
    expect(compareValues(a, b, "desc")).toBeGreaterThan(0);
  });

  it("valores ausentes (null/undefined/string vazia) sempre vão pro fim, em qualquer direção", () => {
    expect(compareValues(null, 5, "asc")).toBeGreaterThan(0);
    expect(compareValues(5, null, "asc")).toBeLessThan(0);
    expect(compareValues(null, 5, "desc")).toBeGreaterThan(0);
    expect(compareValues("", "algo", "asc")).toBeGreaterThan(0);
  });

  it("dois valores ausentes são iguais", () => {
    expect(compareValues(null, undefined, "asc")).toBe(0);
  });
});

describe("sortRows", () => {
  type Row = { name: string; value: number | null };
  const rows: Row[] = [
    { name: "C", value: 30 },
    { name: "A", value: null },
    { name: "B", value: 10 },
  ];

  it("ordena por valor numérico ascendente, ausentes no fim", () => {
    const sorted = sortRows(rows, (r) => r.value, "asc");
    expect(sorted.map((r) => r.name)).toEqual(["B", "C", "A"]);
  });

  it("não muta o array original", () => {
    const original = [...rows];
    sortRows(rows, (r) => r.value, "asc");
    expect(rows).toEqual(original);
  });
});
