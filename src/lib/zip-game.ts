/**
 * Geração e validação do puzzle diário "Zip" (mesmo conceito do jogo do
 * LinkedIn): conectar os pontos numerados em ordem crescente, passando por
 * todas as células do grid exatamente uma vez, só em movimentos ortogonais,
 * sem cruzar o próprio caminho.
 *
 * O puzzle do dia é determinístico — gerado a partir da data (YYYY-MM-DD),
 * então todo mundo no workspace joga exatamente o mesmo grid no mesmo dia,
 * sem precisar guardar o puzzle em lugar nenhum.
 */

export type ZipCell = { r: number; c: number };
export type ZipPuzzle = {
  dateKey: string;
  size: number;
  /** Células numeradas (índice 0 = ponto "1", último = ponto final), na ordem que devem ser visitadas. */
  checkpoints: ZipCell[];
};

export const ZIP_GRID_SIZE = 6;
export const ZIP_CHECKPOINT_COUNT = 6;

/** PRNG determinístico simples (mulberry32) — mesma seed sempre gera a mesma sequência. */
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

const key = (cell: ZipCell) => `${cell.r},${cell.c}`;

function neighbors(cell: ZipCell, size: number): ZipCell[] {
  const out: ZipCell[] = [];
  if (cell.r > 0) out.push({ r: cell.r - 1, c: cell.c });
  if (cell.r < size - 1) out.push({ r: cell.r + 1, c: cell.c });
  if (cell.c > 0) out.push({ r: cell.r, c: cell.c - 1 });
  if (cell.c < size - 1) out.push({ r: cell.r, c: cell.c + 1 });
  return out;
}

/** Caminho hamiltoniano (visita cada célula do grid exatamente uma vez) via
 * DFS randomizado com backtracking — em grids pequenos (6x6) sempre acha um
 * caminho rapidamente. */
function generateHamiltonianPath(size: number, rand: () => number): ZipCell[] {
  const total = size * size;
  const visited = new Set<string>();
  const path: ZipCell[] = [];

  function dfs(cell: ZipCell): boolean {
    visited.add(key(cell));
    path.push(cell);
    if (path.length === total) return true;
    const opts = shuffle(neighbors(cell, size), rand).filter((n) => !visited.has(key(n)));
    for (const next of opts) {
      if (dfs(next)) return true;
    }
    visited.delete(key(cell));
    path.pop();
    return false;
  }

  const start = { r: Math.floor(rand() * size), c: Math.floor(rand() * size) };
  dfs(start);
  return path;
}

/** Puzzle determinístico do dia — mesma data sempre gera o mesmo grid. */
export function getDailyPuzzle(dateKey: string): ZipPuzzle {
  const rand = mulberry32(hashStringToSeed(`zip:${dateKey}`));
  const path = generateHamiltonianPath(ZIP_GRID_SIZE, rand);
  const n = ZIP_CHECKPOINT_COUNT;
  const checkpoints: ZipCell[] = [];
  for (let i = 0; i < n; i++) {
    const idx = Math.round((i * (path.length - 1)) / (n - 1));
    checkpoints.push(path[idx]);
  }
  return { dateKey, size: ZIP_GRID_SIZE, checkpoints };
}

function adjacent(a: ZipCell, b: ZipCell): boolean {
  return Math.abs(a.r - b.r) + Math.abs(a.c - b.c) === 1;
}

/** Valida um caminho desenhado pelo jogador contra o puzzle: precisa passar
 * por toda célula do grid exatamente uma vez, só em passos ortogonais
 * adjacentes, e visitar os checkpoints numerados em ordem crescente
 * (o primeiro checkpoint precisa ser o início do caminho, o último o fim). */
export function validateZipPath(puzzle: ZipPuzzle, path: ZipCell[]): boolean {
  const total = puzzle.size * puzzle.size;
  if (path.length !== total) return false;

  const seen = new Set<string>();
  for (let i = 0; i < path.length; i++) {
    const cell = path[i];
    if (cell.r < 0 || cell.r >= puzzle.size || cell.c < 0 || cell.c >= puzzle.size) return false;
    const k = key(cell);
    if (seen.has(k)) return false;
    seen.add(k);
    if (i > 0 && !adjacent(path[i - 1], cell)) return false;
  }

  let checkpointIdx = 0;
  for (const cell of path) {
    if (
      checkpointIdx < puzzle.checkpoints.length &&
      key(cell) === key(puzzle.checkpoints[checkpointIdx])
    ) {
      checkpointIdx++;
    }
  }
  if (checkpointIdx !== puzzle.checkpoints.length) return false;
  if (key(path[0]) !== key(puzzle.checkpoints[0])) return false;
  if (key(path[path.length - 1]) !== key(puzzle.checkpoints[puzzle.checkpoints.length - 1]))
    return false;

  return true;
}

/** Data de hoje no fuso local (não UTC) — `toISOString()` usa UTC e vira o
 * dia cedo demais pra quem está num fuso atrás (ex: Brasil), fazendo o
 * puzzle "do dia seguinte" aparecer horas antes da meia-noite local. */
export function todayZipKey(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
