import { todayIsoInBrasilia } from "@/lib/timezone";

/**
 * ZIP — puzzle de caminho numerado em grade (recuperado da implementação
 * anterior da plataforma, `git show 12870de:src/lib/zip-game.ts`, removida
 * no commit `000d60d` junto da migração de design system; a tabela
 * `zip_daily_results` nunca foi apagada). Geração/validação puras
 * reaproveitadas quase verbatim — só a data do desafio passou a usar
 * `todayIsoInBrasilia()` (fuso consistente da organização) em vez do fuso
 * local do navegador da versão antiga. O leaderboard/"Líder do mês" da
 * versão antiga NÃO foi reaproveitado — o pedido atual proíbe ranking
 * público e exposição de quem jogou.
 *
 * Mecânica: conectar os números em ordem crescente, só em movimentos
 * ortogonais, passando por TODA célula da grade exatamente uma vez,
 * terminando no último número.
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
 * caminho rapidamente, então todo puzzle gerado é garantidamente
 * resolvível (a própria construção do puzzle É a prova de solubilidade —
 * os checkpoints são amostrados de um caminho válido conhecido). */
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

/** Puzzle determinístico do dia — mesma data sempre gera o mesmo grid pra
 * todo mundo (não precisa ser guardado em lugar nenhum, é recomputável a
 * qualquer momento a partir só da data). */
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

/** Valida um caminho desenhado pelo jogador contra o puzzle — única fonte
 * de verdade de "resolvido", usada tanto no cliente (feedback instantâneo)
 * quanto no servidor (`zip.functions.ts`, nunca confia só na validação do
 * cliente antes de marcar como concluído). */
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

/** Próximo movimento válido esperado — usado pela dica ("revelar somente
 * um movimento") e pela validação incremental do cliente enquanto o
 * jogador desenha o caminho. `null` quando o caminho atual já não pode ser
 * estendido (todas as células livres do fim do caminho estão presas) —
 * usado pra avisar "esse caminho criou uma região impossível" sem
 * resolver o resto. */
export function nextExpectedCell(puzzle: ZipPuzzle, path: ZipCell[]): ZipCell | null {
  if (path.length === 0) return puzzle.checkpoints[0];
  const last = path[path.length - 1];
  const visited = new Set(path.map(key));
  const free = neighbors(last, puzzle.size).filter((n) => !visited.has(key(n)));
  if (free.length === 0) return null;
  // Prioriza o próximo checkpoint em ordem, se for adjacente agora.
  const nextCheckpointIdx = puzzle.checkpoints.findIndex(
    (cp) => !visited.has(key(cp)) || key(cp) === key(last),
  );
  const nextCheckpoint = puzzle.checkpoints.find((cp) => !visited.has(key(cp)));
  if (nextCheckpoint && free.some((f) => key(f) === key(nextCheckpoint))) return nextCheckpoint;
  void nextCheckpointIdx;
  return free[0];
}

/** Data de hoje no fuso da organização (`America/Sao_Paulo`) — nunca UTC
 * cru nem o fuso do navegador, pra todo mundo receber o mesmo desafio no
 * mesmo dia independente de onde estiver. */
export function todayZipKey(): string {
  return todayIsoInBrasilia();
}
