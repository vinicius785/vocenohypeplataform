import { cellsEqual, cellKey, hasWallBetween, isAdjacent } from "./types";
import type { Cell, ZipChallenge, ZipState } from "./types";

/**
 * Motor puro do ZIP — sem React, sem Supabase. `applyZipMove` é o ÚNICO
 * caminho pelo qual uma célula entra no caminho; nenhum evento de
 * ponteiro/teclado insere célula diretamente (correção explícita desta
 * rodada: a versão anterior validava dentro do próprio handler de
 * ponteiro do componente).
 */

export const ZIP_ENGINE_VERSION = 2;

export type ZipMoveError =
  | "must_start_at_one"
  | "not_adjacent"
  | "wall_blocked"
  | "already_visited"
  | "wrong_number"
  | "outside_grid"
  | "invalid_state";

export type ZipMoveResult = { ok: true; state: ZipState } | { ok: false; error: ZipMoveError };

function isValidState(state: ZipState): boolean {
  return (
    !!state &&
    Array.isArray(state.path) &&
    typeof state.expectedNumber === "number" &&
    (state.status === "not_started" || state.status === "in_progress" || state.status === "won")
  );
}

function numberedValueAt(challenge: ZipChallenge, cell: Cell): number | null {
  const found = challenge.numberedCells.find((n) => cellsEqual(n.cell, cell));
  return found ? found.value : null;
}

/**
 * Aplica UM movimento (o jogador tentando estender o caminho até
 * `target`) e devolve o novo estado ou um erro explícito — nunca lança,
 * nunca destrói o caminho existente num movimento inválido (o estado só
 * muda no branch `ok: true`).
 */
export function applyZipMove(
  challenge: ZipChallenge,
  state: ZipState,
  target: Cell,
): ZipMoveResult {
  if (!isValidState(state)) return { ok: false, error: "invalid_state" };
  if (
    target.row < 0 ||
    target.row >= challenge.rows ||
    target.column < 0 ||
    target.column >= challenge.columns
  ) {
    return { ok: false, error: "outside_grid" };
  }
  if (state.status === "won") return { ok: false, error: "invalid_state" };

  const maxNumber = challenge.numberedCells.length;

  if (state.path.length === 0) {
    const first = challenge.numberedCells.find((n) => n.value === 1);
    if (!first || !cellsEqual(target, first.cell)) {
      return { ok: false, error: "must_start_at_one" };
    }
    return {
      ok: true,
      state: { path: [target], expectedNumber: 2, status: "in_progress" },
    };
  }

  const last = state.path[state.path.length - 1];
  if (state.path.some((c) => cellsEqual(c, target))) {
    return { ok: false, error: "already_visited" };
  }
  if (!isAdjacent(last, target)) {
    return { ok: false, error: "not_adjacent" };
  }
  if (hasWallBetween(challenge.walls, last, target)) {
    return { ok: false, error: "wall_blocked" };
  }
  const value = numberedValueAt(challenge, target);
  let nextExpected = state.expectedNumber;
  if (value !== null) {
    if (value !== state.expectedNumber) {
      return { ok: false, error: "wrong_number" };
    }
    nextExpected = value + 1;
  }

  const nextPath = [...state.path, target];
  const total = challenge.rows * challenge.columns;
  const won = nextPath.length === total && nextExpected > maxNumber;

  return {
    ok: true,
    state: { path: nextPath, expectedNumber: nextExpected, status: won ? "won" : "in_progress" },
  };
}

/**
 * Desfazer — remove o último trecho do caminho e recalcula
 * `expectedNumber` a partir do que restou (nunca decrementa "no chute";
 * relê o número da nova última célula, ou volta pra 1 se o caminho
 * ficou vazio). Nunca mexe no cronômetro (isso é responsabilidade de
 * quem persiste a sessão, não do motor de movimento).
 */
export function undoZipMove(challenge: ZipChallenge, state: ZipState): ZipState {
  if (state.path.length === 0) return state;
  const nextPath = state.path.slice(0, -1);
  if (nextPath.length === 0) {
    return { path: [], expectedNumber: 1, status: "not_started" };
  }
  const lastValue = numberedValueAt(challenge, nextPath[nextPath.length - 1]);
  // `expectedNumber` é sempre "o próximo número que falta visitar" — se a
  // nova última célula é numerada, o próximo é ela+1; caso contrário,
  // continua sendo o mesmo que já estava esperando (desfazer uma célula
  // sem número não muda qual número falta).
  const expectedNumber = lastValue !== null ? lastValue + 1 : state.expectedNumber;
  return { path: nextPath, expectedNumber, status: "in_progress" };
}

/** Próxima célula esperada, pra dica — sempre via `applyZipMove`
 * simulado contra cada vizinho livre, nunca uma segunda lógica de
 * adjacência/parede escrita à parte (evita a dica divergir da regra
 * real de movimento). `null` quando nenhum vizinho livre estende o
 * caminho (região sem saída — avisa "desfaça um trecho", não resolve
 * nada). */
export function nextHintCell(challenge: ZipChallenge, state: ZipState): Cell | null {
  if (state.path.length === 0) {
    const first = challenge.numberedCells.find((n) => n.value === 1);
    return first ? first.cell : null;
  }
  const last = state.path[state.path.length - 1];
  const candidates: Cell[] = [
    { row: last.row - 1, column: last.column },
    { row: last.row + 1, column: last.column },
    { row: last.row, column: last.column - 1 },
    { row: last.row, column: last.column + 1 },
  ];
  // Prioriza o próximo número esperado se ele for alcançável agora.
  const nextNumbered = challenge.numberedCells.find((n) => n.value === state.expectedNumber);
  if (nextNumbered) {
    const result = applyZipMove(challenge, state, nextNumbered.cell);
    if (result.ok) return nextNumbered.cell;
  }
  for (const c of candidates) {
    const result = applyZipMove(challenge, state, c);
    if (result.ok) return c;
  }
  return null;
}

export { cellKey, cellsEqual };
