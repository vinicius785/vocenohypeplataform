/**
 * Tipos do ZIP — compartilhados entre `challenge.ts` (geração/validação
 * do desafio) e `engine.ts` (validação de cada jogada). Sem React, sem
 * Supabase.
 */

export type Cell = { row: number; column: number };

export type WallSide = "top" | "right" | "bottom" | "left";
export type Wall = { row: number; column: number; side: WallSide };

export type ZipChallenge = {
  id: string;
  version: number;
  rows: number;
  columns: number;
  /** Células numeradas, na ordem 1..N que precisam ser visitadas. */
  numberedCells: { value: number; cell: Cell }[];
  walls: Wall[];
  /** Caminho completo e válido (todas as células), prova de solubilidade
   * do desafio — nunca exposto ao cliente antes da conclusão. */
  solution: Cell[];
};

export type ZipStatus = "not_started" | "in_progress" | "won";

export type ZipState = {
  path: Cell[];
  /** Próximo número que precisa ser visitado (1 quando `path` está
   * vazio) — nunca recalculado ad-hoc em vários lugares; é campo do
   * próprio estado, atualizado só por `applyZipMove`. */
  expectedNumber: number;
  status: ZipStatus;
};

export const ZIP_INITIAL_STATE: ZipState = {
  path: [],
  expectedNumber: 1,
  status: "not_started",
};

export function cellsEqual(a: Cell, b: Cell): boolean {
  return a.row === b.row && a.column === b.column;
}

export function cellKey(cell: Cell): string {
  return `${cell.row},${cell.column}`;
}

function oppositeSide(side: WallSide): WallSide {
  return side === "top" ? "bottom" : side === "bottom" ? "top" : side === "left" ? "right" : "left";
}

/** Reconhece uma parede independente de qual dos dois lados foi gravado
 * ("parede direita de A" == "parede esquerda de B") — única função usada
 * tanto pela validação de movimento quanto pela validação de solução e
 * pela renderização, nunca uma regra visual e outra lógica divergentes. */
export function hasWallBetween(walls: readonly Wall[], a: Cell, b: Cell): boolean {
  let sideFromA: WallSide | null = null;
  if (a.row === b.row && b.column === a.column + 1) sideFromA = "right";
  else if (a.row === b.row && b.column === a.column - 1) sideFromA = "left";
  else if (a.column === b.column && b.row === a.row + 1) sideFromA = "bottom";
  else if (a.column === b.column && b.row === a.row - 1) sideFromA = "top";
  if (!sideFromA) return false; // não adjacentes — não faz sentido "ter parede"
  const sideFromB = oppositeSide(sideFromA);
  return walls.some(
    (w) =>
      (w.row === a.row && w.column === a.column && w.side === sideFromA) ||
      (w.row === b.row && w.column === b.column && w.side === sideFromB),
  );
}

export function isAdjacent(a: Cell, b: Cell): boolean {
  return Math.abs(a.row - b.row) + Math.abs(a.column - b.column) === 1;
}
