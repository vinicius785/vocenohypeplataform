/**
 * Geração e validação do mini sudoku diário — grid 6x6 (caixas 2x3),
 * dígitos 1-6. Mesmo espírito do Zip do dia: puzzle determinístico a
 * partir da data, mesmo grid pra todo mundo no workspace, sem precisar
 * guardar nada em banco além do resultado de cada jogador.
 */

export const SUDOKU_SIZE = 6;
const BOX_ROWS = 2;
const BOX_COLS = 3;
/** Quantas células ficam em branco (as demais vêm preenchidas como dica). */
const BLANKS = 21;

export type SudokuPuzzle = {
  dateKey: string;
  size: number;
  /** `null` = célula em branco que o jogador precisa preencher. */
  clues: (number | null)[][];
  solution: number[][];
};

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

function boxIndex(r: number, c: number): number {
  return Math.floor(r / BOX_ROWS) * (SUDOKU_SIZE / BOX_COLS) + Math.floor(c / BOX_COLS);
}

function isSafe(grid: number[][], r: number, c: number, val: number): boolean {
  for (let i = 0; i < SUDOKU_SIZE; i++) {
    if (grid[r][i] === val || grid[i][c] === val) return false;
  }
  const boxR = Math.floor(r / BOX_ROWS) * BOX_ROWS;
  const boxC = Math.floor(c / BOX_COLS) * BOX_COLS;
  for (let i = 0; i < BOX_ROWS; i++) {
    for (let j = 0; j < BOX_COLS; j++) {
      if (grid[boxR + i][boxC + j] === val) return false;
    }
  }
  return true;
}

function generateSolution(rand: () => number): number[][] {
  const grid: number[][] = Array.from({ length: SUDOKU_SIZE }, () => Array(SUDOKU_SIZE).fill(0));
  const digits = [1, 2, 3, 4, 5, 6];

  function fill(pos: number): boolean {
    if (pos === SUDOKU_SIZE * SUDOKU_SIZE) return true;
    const r = Math.floor(pos / SUDOKU_SIZE);
    const c = pos % SUDOKU_SIZE;
    for (const val of shuffle(digits, rand)) {
      if (isSafe(grid, r, c, val)) {
        grid[r][c] = val;
        if (fill(pos + 1)) return true;
        grid[r][c] = 0;
      }
    }
    return false;
  }

  fill(0);
  return grid;
}

export function getDailySudoku(dateKey: string): SudokuPuzzle {
  const rand = mulberry32(hashStringToSeed(`sudoku:${dateKey}`));
  const solution = generateSolution(rand);
  const positions = shuffle(
    Array.from({ length: SUDOKU_SIZE * SUDOKU_SIZE }, (_, i) => i),
    rand,
  ).slice(0, BLANKS);
  const blank = new Set(positions);
  const clues: (number | null)[][] = solution.map((row, r) =>
    row.map((val, c) => (blank.has(r * SUDOKU_SIZE + c) ? null : val)),
  );
  return { dateKey, size: SUDOKU_SIZE, clues, solution };
}

export function boxOf(r: number, c: number): number {
  return boxIndex(r, c);
}

/** Confere se o grid preenchido pelo jogador bate com a solução do dia. */
export function validateSudoku(puzzle: SudokuPuzzle, grid: (number | null)[][]): boolean {
  for (let r = 0; r < puzzle.size; r++) {
    for (let c = 0; c < puzzle.size; c++) {
      if (grid[r][c] !== puzzle.solution[r][c]) return false;
    }
  }
  return true;
}

export function todaySudokuKey(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
