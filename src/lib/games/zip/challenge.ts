import { todayIsoInBrasilia } from "@/lib/timezone";
import {
  hasWallBetween,
  isAdjacent,
  cellKey,
  type Cell,
  type Wall,
  type ZipChallenge,
} from "./types";

/**
 * Geração e validação do desafio diário do ZIP. Determinístico (mesma
 * data → mesmo desafio pra todo mundo, fuso `America/Sao_Paulo`, nunca
 * `Math.random()`). A solução é construída ANTES das paredes — paredes só
 * podem existir em arestas que a solução não usa, então a solução
 * permanece válida por construção (nunca é preciso "torcer" pra achar
 * uma solução depois de colocar paredes).
 */

export const ZIP_GRID_SIZE = 6;
export const ZIP_CHECKPOINT_COUNT = 6;
export const WALL_DENSITY = 0.35;
/** Sobe quando o FORMATO/geração do desafio muda de um jeito que uma
 * sessão salva sob a versão anterior deixa de fazer sentido (ex.: esta
 * rodada, adicionar paredes) — nunca por causa de troca de dificuldade
 * dentro do mesmo formato. */
export const ZIP_CHALLENGE_VERSION = 2;

function mulberry32(seed: number) {
  let a = seed;
  return function rand() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashStringToSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function shuffle<T>(arr: T[], rand: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function neighbors(cell: Cell, rows: number, columns: number): Cell[] {
  const out: Cell[] = [];
  if (cell.row > 0) out.push({ row: cell.row - 1, column: cell.column });
  if (cell.row < rows - 1) out.push({ row: cell.row + 1, column: cell.column });
  if (cell.column > 0) out.push({ row: cell.row, column: cell.column - 1 });
  if (cell.column < columns - 1) out.push({ row: cell.row, column: cell.column + 1 });
  return out;
}

function generateHamiltonianPath(rows: number, columns: number, rand: () => number): Cell[] {
  const total = rows * columns;
  const visited = new Set<string>();
  const path: Cell[] = [];

  function dfs(cell: Cell): boolean {
    visited.add(cellKey(cell));
    path.push(cell);
    if (path.length === total) return true;
    const opts = shuffle(neighbors(cell, rows, columns), rand).filter(
      (n) => !visited.has(cellKey(n)),
    );
    for (const next of opts) {
      if (dfs(next)) return true;
    }
    visited.delete(cellKey(cell));
    path.pop();
    return false;
  }

  const start = { row: Math.floor(rand() * rows), column: Math.floor(rand() * columns) };
  dfs(start);
  return path;
}

function allGridEdges(rows: number, columns: number): { a: Cell; b: Cell }[] {
  const edges: { a: Cell; b: Cell }[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < columns; c++) {
      if (c < columns - 1) edges.push({ a: { row: r, column: c }, b: { row: r, column: c + 1 } });
      if (r < rows - 1) edges.push({ a: { row: r, column: c }, b: { row: r + 1, column: c } });
    }
  }
  return edges;
}

function generateWalls(
  rows: number,
  columns: number,
  solution: Cell[],
  rand: () => number,
): Wall[] {
  const usedEdges = new Set<string>();
  for (let i = 1; i < solution.length; i++) {
    usedEdges.add(`${cellKey(solution[i - 1])}|${cellKey(solution[i])}`);
    usedEdges.add(`${cellKey(solution[i])}|${cellKey(solution[i - 1])}`);
  }
  const walls: Wall[] = [];
  for (const { a, b } of allGridEdges(rows, columns)) {
    if (usedEdges.has(`${cellKey(a)}|${cellKey(b)}`)) continue;
    if (rand() < WALL_DENSITY) {
      // Canônico: sempre gravado como "right"/"bottom" a partir da célula
      // de menor linha/coluna — `hasWallBetween` reconhece os dois lados
      // de qualquer forma, mas ter uma única convenção de escrita evita
      // duplicar a mesma parede em duas representações diferentes.
      const side = a.row === b.row ? "right" : "bottom";
      walls.push({ row: a.row, column: a.column, side });
    }
  }
  return walls;
}

export function getDailyZipChallenge(dateKey: string = todayIsoInBrasilia()): ZipChallenge {
  const rand = mulberry32(hashStringToSeed(`zip:${dateKey}`));
  const solution = generateHamiltonianPath(ZIP_GRID_SIZE, ZIP_GRID_SIZE, rand);
  const n = ZIP_CHECKPOINT_COUNT;
  const numberedCells: { value: number; cell: Cell }[] = [];
  for (let i = 0; i < n; i++) {
    const idx = Math.round((i * (solution.length - 1)) / (n - 1));
    numberedCells.push({ value: i + 1, cell: solution[idx] });
  }
  const walls = generateWalls(ZIP_GRID_SIZE, ZIP_GRID_SIZE, solution, rand);
  return {
    id: dateKey,
    version: ZIP_CHALLENGE_VERSION,
    rows: ZIP_GRID_SIZE,
    columns: ZIP_GRID_SIZE,
    numberedCells,
    walls,
    solution,
  };
}

export type ValidationResult = { valid: true } | { valid: false; errors: string[] };

/**
 * Validação exaustiva do desafio ANTES de exibir — nenhum desafio
 * publicado pode chegar ao jogador sem passar por aqui (seção 14 do
 * pedido). Cobre dimensões, numeração, paredes e a solução ponta a
 * ponta.
 */
export function validateZipChallenge(challenge: ZipChallenge): ValidationResult {
  const errors: string[] = [];
  const { rows, columns, numberedCells, walls, solution } = challenge;

  if (rows <= 0 || columns <= 0) errors.push("dimensões inválidas");

  const values = numberedCells.map((n) => n.value).sort((a, b) => a - b);
  const expectedValues = Array.from({ length: numberedCells.length }, (_, i) => i + 1);
  if (JSON.stringify(values) !== JSON.stringify(expectedValues)) {
    errors.push("números não formam uma sequência 1..N sem lacunas/duplicatas");
  }
  for (const { cell } of numberedCells) {
    if (cell.row < 0 || cell.row >= rows || cell.column < 0 || cell.column >= columns) {
      errors.push(`número fora da grade: ${cellKey(cell)}`);
    }
  }

  for (const w of walls) {
    if (w.row < 0 || w.row >= rows || w.column < 0 || w.column >= columns) {
      errors.push(`parede fora da grade: ${w.row},${w.column},${w.side}`);
    }
  }

  if (solution.length !== rows * columns) {
    errors.push(`solução não cobre todas as células (${solution.length}/${rows * columns})`);
  }
  const seen = new Set<string>();
  for (let i = 0; i < solution.length; i++) {
    const cell = solution[i];
    if (cell.row < 0 || cell.row >= rows || cell.column < 0 || cell.column >= columns) {
      errors.push(`célula da solução fora da grade: ${cellKey(cell)}`);
      continue;
    }
    const k = cellKey(cell);
    if (seen.has(k)) {
      errors.push(`solução repete célula: ${k}`);
      continue;
    }
    seen.add(k);
    if (i > 0) {
      if (!isAdjacent(solution[i - 1], cell)) {
        errors.push(`solução tem passo não-adjacente em ${i}`);
      } else if (hasWallBetween(walls, solution[i - 1], cell)) {
        errors.push(`solução atravessa parede em ${i}`);
      }
    }
  }

  if (numberedCells.length > 0 && solution.length > 0) {
    const sorted = [...numberedCells].sort((a, b) => a.value - b.value);
    if (cellKey(solution[0]) !== cellKey(sorted[0].cell)) {
      errors.push("solução não começa na célula do número 1");
    }
    if (cellKey(solution[solution.length - 1]) !== cellKey(sorted[sorted.length - 1].cell)) {
      errors.push("solução não termina na célula do último número");
    }
    let checkpointIdx = 0;
    for (const cell of solution) {
      if (checkpointIdx < sorted.length && cellKey(cell) === cellKey(sorted[checkpointIdx].cell)) {
        checkpointIdx++;
      }
    }
    if (checkpointIdx !== sorted.length) {
      errors.push("solução não visita os números na ordem correta");
    }
  }

  return errors.length === 0 ? { valid: true } : { valid: false, errors };
}
