import { describe, expect, it } from "vitest";
import { getDailyZipChallenge } from "./challenge";
import { applyZipMove, undoZipMove, nextHintCell } from "./engine";
import { ZIP_INITIAL_STATE, type Cell, type ZipState } from "./types";

const challenge = getDailyZipChallenge("2026-09-23");
const cellOf = (value: number): Cell =>
  challenge.numberedCells.find((n) => n.value === value)!.cell;

describe("applyZipMove — primeiro movimento", () => {
  it("aceita começar exatamente no número 1", () => {
    const result = applyZipMove(challenge, ZIP_INITIAL_STATE, cellOf(1));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state.path).toEqual([cellOf(1)]);
      expect(result.state.status).toBe("in_progress");
      expect(result.state.expectedNumber).toBe(2);
    }
  });

  it("rejeita começar em qualquer número diferente de 1 (ex.: 4)", () => {
    const result = applyZipMove(challenge, ZIP_INITIAL_STATE, cellOf(4));
    expect(result).toEqual({ ok: false, error: "must_start_at_one" });
  });

  it("rejeita começar numa célula qualquer não numerada", () => {
    const random: Cell = { row: 3, column: 3 };
    const isNumbered = challenge.numberedCells.some((n) => n.cell.row === 3 && n.cell.column === 3);
    if (!isNumbered) {
      const result = applyZipMove(challenge, ZIP_INITIAL_STATE, random);
      expect(result).toEqual({ ok: false, error: "must_start_at_one" });
    }
  });

  it("abrir/fechar sem jogar nunca sai de not_started (estado inicial nunca muda sozinho)", () => {
    expect(ZIP_INITIAL_STATE.status).toBe("not_started");
    expect(ZIP_INITIAL_STATE.path).toEqual([]);
  });
});

describe("applyZipMove — movimentos seguintes", () => {
  function afterStart(): ZipState {
    const r = applyZipMove(challenge, ZIP_INITIAL_STATE, cellOf(1));
    if (!r.ok) throw new Error("setup falhou");
    return r.state;
  }

  it("rejeita movimento diagonal", () => {
    const state = afterStart();
    const start = cellOf(1);
    const diagonal: Cell = { row: start.row + 1, column: start.column + 1 };
    const result = applyZipMove(challenge, state, diagonal);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(["not_adjacent", "outside_grid"]).toContain(result.error);
  });

  it("rejeita revisitar a célula inicial", () => {
    const state = afterStart();
    const result = applyZipMove(challenge, state, cellOf(1));
    expect(result).toEqual({ ok: false, error: "already_visited" });
  });

  it("rejeita destino fora da grade", () => {
    const state = afterStart();
    const result = applyZipMove(challenge, state, { row: -1, column: 0 });
    expect(result).toEqual({ ok: false, error: "outside_grid" });
  });

  it("segue os passos reais da solução com sucesso até o número 2", () => {
    let state = afterStart();
    const idxOf1 = challenge.solution.findIndex(
      (c) => c.row === cellOf(1).row && c.column === cellOf(1).column,
    );
    const idxOf2 = challenge.solution.findIndex(
      (c) => c.row === cellOf(2).row && c.column === cellOf(2).column,
    );
    for (let i = idxOf1 + 1; i <= idxOf2; i++) {
      const result = applyZipMove(challenge, state, challenge.solution[i]);
      expect(result.ok).toBe(true);
      if (result.ok) state = result.state;
    }
    expect(state.expectedNumber).toBe(3);
  });

  it("rejeita pular direto pro número 2 sem número errado no meio dando errado (wrong_number) quando encontra outro número fora de ordem", () => {
    // Se o número 2 for adjacente diretamente ao 1 no grid (raro, mas
    // possível topologicamente não ser o próximo passo da solução),
    // simulamos tentar visitar um número > expectedNumber diretamente.
    const state = afterStart();
    const cell3 = cellOf(3);
    const cell1 = cellOf(1);
    const adjacentToCell3 =
      Math.abs(cell1.row - cell3.row) + Math.abs(cell1.column - cell3.column) === 1;
    if (adjacentToCell3) {
      const result = applyZipMove(challenge, state, cell3);
      expect(result).toEqual({ ok: false, error: "wrong_number" });
    }
  });

  it("wall_blocked: rejeita atravessar uma parede real do desafio", () => {
    const state = afterStart();
    // Acha uma parede que parte da célula inicial, se existir.
    const start = cellOf(1);
    const wallFromStart = challenge.walls.find(
      (w) => w.row === start.row && w.column === start.column,
    );
    if (wallFromStart) {
      const target: Cell =
        wallFromStart.side === "right"
          ? { row: start.row, column: start.column + 1 }
          : wallFromStart.side === "bottom"
            ? { row: start.row + 1, column: start.column }
            : wallFromStart.side === "left"
              ? { row: start.row, column: start.column - 1 }
              : { row: start.row - 1, column: start.column };
      const result = applyZipMove(challenge, state, target);
      expect(result).toEqual({ ok: false, error: "wall_blocked" });
    }
  });

  it("um movimento inválido nunca destrói o caminho existente", () => {
    const state = afterStart();
    const before = state.path;
    const result = applyZipMove(challenge, state, { row: -5, column: -5 });
    expect(result.ok).toBe(false);
    expect(state.path).toBe(before); // o `state` original não foi mutado
  });
});

describe("applyZipMove — conclusão exige todas as células e terminar no último número", () => {
  it("percorrer a solução inteira termina como won", () => {
    let state: ZipState = ZIP_INITIAL_STATE;
    for (const cell of challenge.solution) {
      const result = applyZipMove(challenge, state, cell);
      expect(result.ok).toBe(true);
      if (result.ok) state = result.state;
    }
    expect(state.status).toBe("won");
    expect(state.path).toHaveLength(challenge.rows * challenge.columns);
  });
});

describe("undoZipMove", () => {
  it("remove a última célula e recalcula expectedNumber", () => {
    const afterStart = applyZipMove(challenge, ZIP_INITIAL_STATE, cellOf(1));
    if (!afterStart.ok) throw new Error("setup");
    const undone = undoZipMove(challenge, afterStart.state);
    expect(undone.path).toEqual([]);
    expect(undone.status).toBe("not_started");
    expect(undone.expectedNumber).toBe(1);
  });

  it("desfazer em caminho vazio não faz nada", () => {
    expect(undoZipMove(challenge, ZIP_INITIAL_STATE)).toEqual(ZIP_INITIAL_STATE);
  });

  it("nunca mexe no cronômetro (não existe campo de tempo no ZipState)", () => {
    const afterStart = applyZipMove(challenge, ZIP_INITIAL_STATE, cellOf(1));
    if (!afterStart.ok) throw new Error("setup");
    const undone = undoZipMove(challenge, afterStart.state);
    expect(Object.keys(undone).sort()).toEqual(["expectedNumber", "path", "status"]);
  });
});

describe("nextHintCell — revela só um movimento, nunca resolve tudo", () => {
  it("caminho vazio sugere a célula do número 1", () => {
    expect(nextHintCell(challenge, ZIP_INITIAL_STATE)).toEqual(cellOf(1));
  });

  it("a dica sempre é um movimento que applyZipMove aceita", () => {
    const afterStart = applyZipMove(challenge, ZIP_INITIAL_STATE, cellOf(1));
    if (!afterStart.ok) throw new Error("setup");
    const hint = nextHintCell(challenge, afterStart.state);
    expect(hint).not.toBeNull();
    if (hint) {
      const result = applyZipMove(challenge, afterStart.state, hint);
      expect(result.ok).toBe(true);
    }
  });
});
