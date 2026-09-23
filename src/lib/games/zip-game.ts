import { todayIsoInBrasilia } from "@/lib/timezone";

/**
 * ZIP — puzzle de caminho numerado em grade, com paredes. Geração/validação
 * do caminho hamiltoniano recuperadas da implementação anterior da
 * plataforma (`git show 12870de:src/lib/zip-game.ts`); paredes são novas
 * nesta correção (a versão anterior — antiga e a restaurada por mim antes
 * — nunca teve paredes, apesar de a mecânica de referência sempre ter
 * previsto isso).
 *
 * Mecânica: conectar os números em ordem crescente, só em movimentos
 * ortogonais, nunca atravessando uma parede, passando por TODA célula da
 * grade exatamente uma vez, terminando no último número.
 *
 * Garantia de solubilidade: as paredes só podem ser colocadas em arestas
 * que o caminho hamiltoniano gerado NÃO usa — o próprio caminho gerado é,
 * por construção, sempre uma solução válida do puzzle publicado, então
 * bloquear arestas fora dele nunca pode quebrar essa solução. Nunca é
 * gerado (nem publicado) um puzzle sem solução.
 */

export type ZipCell = { r: number; c: number };
export type ZipPuzzle = {
  dateKey: string;
  size: number;
  /** Células numeradas (índice 0 = ponto "1", último = ponto final), na ordem que devem ser visitadas. */
  checkpoints: ZipCell[];
  /** Arestas bloqueadas entre células adjacentes — chave canônica via `edgeKey`. */
  walls: string[];
};

export const ZIP_GRID_SIZE = 6;
export const ZIP_CHECKPOINT_COUNT = 6;
/** Fração das arestas fora do caminho-solução que viram parede — mantém
 * o tabuleiro desafiador sem travar visualmente (grade 6x6 tem bastante
 * aresta sobrando fora dos 35 passos do caminho hamiltoniano). */
const WALL_DENSITY = 0.35;

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

const cellKey = (cell: ZipCell) => `${cell.r},${cell.c}`;

/** Chave canônica de uma aresta entre duas células adjacentes — sempre a
 * mesma independente da ordem dos argumentos, pra nunca duplicar/errar a
 * checagem por causa de direção. */
export function edgeKey(a: ZipCell, b: ZipCell): string {
  const ka = cellKey(a);
  const kb = cellKey(b);
  return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
}

export function isWallBetween(puzzle: Pick<ZipPuzzle, "walls">, a: ZipCell, b: ZipCell): boolean {
  return puzzle.walls.includes(edgeKey(a, b));
}

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
 * caminho rapidamente, e esse caminho É a prova de solubilidade do puzzle
 * publicado (ver comentário de topo). */
function generateHamiltonianPath(size: number, rand: () => number): ZipCell[] {
  const total = size * size;
  const visited = new Set<string>();
  const path: ZipCell[] = [];

  function dfs(cell: ZipCell): boolean {
    visited.add(cellKey(cell));
    path.push(cell);
    if (path.length === total) return true;
    const opts = shuffle(neighbors(cell, size), rand).filter((n) => !visited.has(cellKey(n)));
    for (const next of opts) {
      if (dfs(next)) return true;
    }
    visited.delete(cellKey(cell));
    path.pop();
    return false;
  }

  const start = { r: Math.floor(rand() * size), c: Math.floor(rand() * size) };
  dfs(start);
  return path;
}

/** Todas as arestas do grid (pares de células ortogonalmente adjacentes),
 * cada uma listada uma única vez. */
function allGridEdges(size: number): { a: ZipCell; b: ZipCell }[] {
  const edges: { a: ZipCell; b: ZipCell }[] = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (c < size - 1) edges.push({ a: { r, c }, b: { r, c: c + 1 } });
      if (r < size - 1) edges.push({ a: { r, c }, b: { r: r + 1, c } });
    }
  }
  return edges;
}

/** Gera as paredes: escolhe (deterministicamente, mesma seed do puzzle)
 * uma fração das arestas que o caminho-solução NÃO usa. Nunca bloqueia
 * uma aresta usada pelo caminho — garantia de solubilidade por
 * construção, não por checagem posterior. */
function generateWalls(size: number, solutionPath: ZipCell[], rand: () => number): string[] {
  const usedEdges = new Set<string>();
  for (let i = 1; i < solutionPath.length; i++) {
    usedEdges.add(edgeKey(solutionPath[i - 1], solutionPath[i]));
  }
  const candidates = allGridEdges(size)
    .map(({ a, b }) => edgeKey(a, b))
    .filter((k) => !usedEdges.has(k));
  const walls: string[] = [];
  for (const k of candidates) {
    if (rand() < WALL_DENSITY) walls.push(k);
  }
  return walls;
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
  const walls = generateWalls(ZIP_GRID_SIZE, path, rand);
  return { dateKey, size: ZIP_GRID_SIZE, checkpoints, walls };
}

/** Reconstrói o caminho-solução completo do dia (todas as 36 células, não
 * só os checkpoints) — usado por testes (garantir que a solução real
 * nunca é bloqueada por uma parede) e pela validação de publicação de
 * desafios. Mesma seed de `getDailyPuzzle`, então é sempre exatamente o
 * caminho usado pra gerar aquele puzzle. */
export function getDailyPuzzleSolution(dateKey: string): ZipCell[] {
  const rand = mulberry32(hashStringToSeed(`zip:${dateKey}`));
  return generateHamiltonianPath(ZIP_GRID_SIZE, rand);
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
    const k = cellKey(cell);
    if (seen.has(k)) return false;
    seen.add(k);
    if (i > 0) {
      if (!adjacent(path[i - 1], cell)) return false;
      if (isWallBetween(puzzle, path[i - 1], cell)) return false;
    }
  }

  let checkpointIdx = 0;
  for (const cell of path) {
    if (
      checkpointIdx < puzzle.checkpoints.length &&
      cellKey(cell) === cellKey(puzzle.checkpoints[checkpointIdx])
    ) {
      checkpointIdx++;
    }
  }
  if (checkpointIdx !== puzzle.checkpoints.length) return false;
  if (cellKey(path[0]) !== cellKey(puzzle.checkpoints[0])) return false;
  if (cellKey(path[path.length - 1]) !== cellKey(puzzle.checkpoints[puzzle.checkpoints.length - 1]))
    return false;

  return true;
}

/** Valida um caminho PARCIAL (ainda em progresso, não precisa preencher a
 * grade nem terminar no último checkpoint) — mesmas regras geométricas/de
 * parede/ordem de `validateZipPath`, só sem as duas exigências finais.
 * Usada pelo servidor (`saveZipProgress`) pra nunca aceitar cegamente um
 * `path` arbitrário mandado pelo cliente — defesa em profundidade, além
 * da validação completa em `submitZipCompletion`. */
export function validateZipPartialPath(puzzle: ZipPuzzle, path: ZipCell[]): boolean {
  if (path.length === 0) return true;
  const seen = new Set<string>();
  for (let i = 0; i < path.length; i++) {
    const cell = path[i];
    if (cell.r < 0 || cell.r >= puzzle.size || cell.c < 0 || cell.c >= puzzle.size) return false;
    const k = cellKey(cell);
    if (seen.has(k)) return false;
    seen.add(k);
    if (i > 0) {
      if (!adjacent(path[i - 1], cell)) return false;
      if (isWallBetween(puzzle, path[i - 1], cell)) return false;
    }
  }
  if (cellKey(path[0]) !== cellKey(puzzle.checkpoints[0])) return false;

  let checkpointIdx = 0;
  for (const cell of path) {
    const cpIdx = puzzle.checkpoints.findIndex((cp) => cellKey(cp) === cellKey(cell));
    if (cpIdx !== -1) {
      // Só pode visitar um checkpoint numerado se for exatamente o
      // próximo esperado — pular número é inválido mesmo num caminho
      // parcial.
      if (cpIdx !== checkpointIdx) return false;
      checkpointIdx++;
    }
  }
  return true;
}

/** Um único passo é válido? — usado pelo cliente pra decidir, jogada a
 * jogada, se aceita ou rejeita (feedback imediato), sem esperar a
 * validação completa do caminho inteiro. Não decide "próximo número
 * esperado" sozinho — só geometria/parede/repetição; a ordem dos
 * checkpoints é responsabilidade de quem chama (`tryExtend`). */
export function isValidStep(
  puzzle: ZipPuzzle,
  from: ZipCell,
  to: ZipCell,
  visited: Set<string>,
): boolean {
  if (to.r < 0 || to.r >= puzzle.size || to.c < 0 || to.c >= puzzle.size) return false;
  if (visited.has(cellKey(to))) return false;
  if (!adjacent(from, to)) return false;
  if (isWallBetween(puzzle, from, to)) return false;
  return true;
}

/** Próximo movimento válido esperado — usado pela dica ("revelar somente
 * um movimento") e pela validação incremental do cliente enquanto o
 * jogador desenha o caminho. `null` quando o caminho atual já não pode ser
 * estendido (todas as células livres do fim do caminho estão presas ou
 * atrás de parede) — usado pra avisar "esse caminho criou uma região
 * impossível" sem resolver o resto. */
export function nextExpectedCell(puzzle: ZipPuzzle, path: ZipCell[]): ZipCell | null {
  if (path.length === 0) return puzzle.checkpoints[0];
  const last = path[path.length - 1];
  const visited = new Set(path.map(cellKey));
  const free = neighbors(last, puzzle.size).filter(
    (n) => !visited.has(cellKey(n)) && !isWallBetween(puzzle, last, n),
  );
  if (free.length === 0) return null;
  const nextCheckpoint = puzzle.checkpoints.find((cp) => !visited.has(cellKey(cp)));
  if (nextCheckpoint && free.some((f) => cellKey(f) === cellKey(nextCheckpoint)))
    return nextCheckpoint;
  return free[0];
}

/** Data de hoje no fuso da organização (`America/Sao_Paulo`) — nunca UTC
 * cru nem o fuso do navegador, pra todo mundo receber o mesmo desafio no
 * mesmo dia independente de onde estiver. */
export function todayZipKey(): string {
  return todayIsoInBrasilia();
}
