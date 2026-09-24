import type { ZipChallenge } from "./types";

/**
 * Fixture fixo 3×3 — nunca gerado, nunca aleatório. Serve pra provar o
 * motor/componente/persistência ANTES de confiar no desafio 6×6 do dia
 * (seção 9 do pedido). Layout:
 *
 * ```
 * 1 | . .
 * . . .
 * . . 3
 * ```
 * (2 fica no meio) com uma parede entre (0,0) e (0,1) — não bloqueia a
 * serpentina abaixo (que nunca usa essa aresta), só impede um atalho
 * direto pela linha de cima. Solução única verificada por
 * `validateZipChallenge` no teste do fixture, não só afirmada aqui.
 */
export const ZIP_FIXTURE_3X3: ZipChallenge = {
  id: "fixture-3x3",
  version: 2,
  rows: 3,
  columns: 3,
  numberedCells: [
    { value: 1, cell: { row: 0, column: 0 } },
    { value: 2, cell: { row: 1, column: 1 } },
    { value: 3, cell: { row: 2, column: 2 } },
  ],
  walls: [{ row: 0, column: 0, side: "right" }],
  solution: [
    { row: 0, column: 0 },
    { row: 1, column: 0 },
    { row: 2, column: 0 },
    { row: 2, column: 1 },
    { row: 1, column: 1 },
    { row: 0, column: 1 },
    { row: 0, column: 2 },
    { row: 1, column: 2 },
    { row: 2, column: 2 },
  ],
};
