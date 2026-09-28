import { describe, expect, it } from "vitest";
import { applyZipMove, applyZipMoveSequence, checkZipStateInvariants, undoZipMove } from "./engine";
import { ZIP_INITIAL_STATE, type ZipState } from "./types";
import { validateZipChallenge } from "./challenge";
import { ZIP_FIXTURE_3X3 } from "./fixture";

describe("fixture 3×3 — usado antes de confiar no desafio 6×6 do dia", () => {
  it("passa em validateZipChallenge (mesma validação exaustiva do desafio real)", () => {
    expect(validateZipChallenge(ZIP_FIXTURE_3X3)).toEqual({ valid: true });
  });

  it("a solução do fixture é alcançável passo a passo pelo motor real", () => {
    const result = applyZipMoveSequence(
      ZIP_FIXTURE_3X3,
      ZIP_INITIAL_STATE,
      ZIP_FIXTURE_3X3.solution,
    );
    expect(result.error).toBeUndefined();
    expect(result.appliedCount).toBe(9);
    expect(result.state.status).toBe("won");
  });
});

describe("applyZipMove — nunca começa fora do número 1", () => {
  it("tentar começar em outra célula falha com must_start_at_one, nunca move o caminho", () => {
    const result = applyZipMove(ZIP_FIXTURE_3X3, ZIP_INITIAL_STATE, { row: 1, column: 0 });
    expect(result).toEqual({ ok: false, error: "must_start_at_one" });
  });

  it("tocar o número 1 entra no caminho e nunca mais deveria mostrar 'comece pelo 1'", () => {
    const result = applyZipMove(ZIP_FIXTURE_3X3, ZIP_INITIAL_STATE, { row: 0, column: 0 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state.path).toEqual([{ row: 0, column: 0 }]);
      expect(result.state.status).toBe("in_progress");
    }
  });

  it("respeita a parede do fixture: (0,0)->(0,1) é bloqueado embora sejam adjacentes", () => {
    const afterStart = applyZipMove(ZIP_FIXTURE_3X3, ZIP_INITIAL_STATE, { row: 0, column: 0 });
    if (!afterStart.ok) throw new Error("setup falhou");
    const blocked = applyZipMove(ZIP_FIXTURE_3X3, afterStart.state, { row: 0, column: 1 });
    expect(blocked).toEqual({ ok: false, error: "wall_blocked" });
  });
});

describe("applyZipMoveSequence — aplica o gesto inteiro de uma vez, pra de primeira em alvo inválido", () => {
  it("para no primeiro alvo ruim e devolve quantos passos realmente entraram", () => {
    const targets = [
      { row: 0, column: 0 }, // válido — número 1
      { row: 5, column: 5 }, // fora da grade — inválido
    ];
    const result = applyZipMoveSequence(ZIP_FIXTURE_3X3, ZIP_INITIAL_STATE, targets);
    expect(result.appliedCount).toBe(1);
    expect(result.error).toBe("outside_grid");
    expect(result.state.path).toEqual([{ row: 0, column: 0 }]);
  });

  it("sequência vazia não muda o estado", () => {
    const result = applyZipMoveSequence(ZIP_FIXTURE_3X3, ZIP_INITIAL_STATE, []);
    expect(result.state).toEqual(ZIP_INITIAL_STATE);
    expect(result.appliedCount).toBe(0);
  });
});

describe("undoZipMove", () => {
  it("desfazer o único passo volta pro estado inicial not_started", () => {
    const afterStart = applyZipMove(ZIP_FIXTURE_3X3, ZIP_INITIAL_STATE, { row: 0, column: 0 });
    if (!afterStart.ok) throw new Error("setup falhou");
    expect(undoZipMove(ZIP_FIXTURE_3X3, afterStart.state)).toEqual(ZIP_INITIAL_STATE);
  });
});

describe("checkZipStateInvariants", () => {
  it("aprova o estado inicial e qualquer prefixo válido da solução", () => {
    expect(checkZipStateInvariants(ZIP_FIXTURE_3X3, ZIP_INITIAL_STATE)).toEqual({ ok: true });
    const result = applyZipMoveSequence(
      ZIP_FIXTURE_3X3,
      ZIP_INITIAL_STATE,
      ZIP_FIXTURE_3X3.solution.slice(0, 4),
    );
    expect(checkZipStateInvariants(ZIP_FIXTURE_3X3, result.state)).toEqual({ ok: true });
  });

  it("detecta um caminho que não começa no número 1", () => {
    const badState: ZipState = {
      path: [{ row: 1, column: 0 }],
      expectedNumber: 1,
      status: "in_progress",
    };
    const check = checkZipStateInvariants(ZIP_FIXTURE_3X3, badState);
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.violations).toContain("caminho não começa no número 1");
  });

  it("detecta expectedNumber divergente do caminho real", () => {
    const badState: ZipState = {
      path: [{ row: 0, column: 0 }],
      expectedNumber: 5,
      status: "in_progress",
    };
    const check = checkZipStateInvariants(ZIP_FIXTURE_3X3, badState);
    expect(check.ok).toBe(false);
  });

  it("detecta célula repetida no caminho", () => {
    const badState: ZipState = {
      path: [
        { row: 0, column: 0 },
        { row: 1, column: 0 },
        { row: 0, column: 0 },
      ],
      expectedNumber: 2,
      status: "in_progress",
    };
    const check = checkZipStateInvariants(ZIP_FIXTURE_3X3, badState);
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.violations.some((v) => v.includes("repetida"))).toBe(true);
  });
});
