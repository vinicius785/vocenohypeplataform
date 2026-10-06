import { describe, expect, it } from "vitest";
import { KANBAN_COLUMN_LIMIT, columnView } from "./kanban-limit";

const n = (k: number) => Array.from({ length: k }, (_, i) => i);

describe("columnView — expansão inline por coluna", () => {
  it("0 tarefas: nada visível, sem Ver mais nem Ver menos", () => {
    expect(columnView(n(0), KANBAN_COLUMN_LIMIT, false)).toEqual({
      visible: [],
      hiddenCount: 0,
      canCollapse: false,
    });
  });
  it("1 e 4 tarefas: tudo visível, sem controles", () => {
    for (const k of [1, 4]) {
      const v = columnView(n(k), 4, false);
      expect(v.visible).toHaveLength(k);
      expect(v.hiddenCount).toBe(0);
      expect(v.canCollapse).toBe(false);
    }
  });
  it("5 tarefas recolhida: 4 visíveis e 'Ver mais (1)', na ordem original", () => {
    const v = columnView(n(5), 4, false);
    expect(v.visible).toEqual([0, 1, 2, 3]);
    expect(v.hiddenCount).toBe(1);
    expect(v.canCollapse).toBe(false);
  });
  it("9 tarefas: Ver mais (5) → expandida mostra as 9 e oferece Ver menos", () => {
    expect(columnView(n(9), 4, false).hiddenCount).toBe(5);
    const e = columnView(n(9), 4, true);
    expect(e.visible).toEqual(n(9));
    expect(e.hiddenCount).toBe(0);
    expect(e.canCollapse).toBe(true);
  });
  it("muitas tarefas (20): Ver mais (16) → todas → Ver menos", () => {
    expect(columnView(n(20), 4, false).hiddenCount).toBe(16);
    expect(columnView(n(20), 4, true).visible).toHaveLength(20);
  });
  it("expandir uma coluna não afeta outra (estado por coluna)", () => {
    const expanded = new Set(["Aberto"]);
    const aberto = columnView(n(9), 4, expanded.has("Aberto"));
    const andamento = columnView(n(9), 4, expanded.has("Em andamento"));
    expect(aberto.visible).toHaveLength(9);
    expect(andamento.visible).toHaveLength(4);
  });
  it("expandida com poucas tarefas não mostra Ver menos", () => {
    expect(columnView(n(3), 4, true).canCollapse).toBe(false);
  });
});
