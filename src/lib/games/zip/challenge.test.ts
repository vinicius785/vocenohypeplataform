import { describe, expect, it } from "vitest";
import { getDailyZipChallenge, validateZipChallenge, ZIP_CHALLENGE_VERSION } from "./challenge";
import { hasWallBetween } from "./types";

describe("getDailyZipChallenge — determinístico e sempre solucionável", () => {
  it("mesma data sempre gera o mesmo desafio", () => {
    expect(getDailyZipChallenge("2026-01-01")).toEqual(getDailyZipChallenge("2026-01-01"));
  });

  it("datas diferentes geram desafios diferentes", () => {
    const a = getDailyZipChallenge("2026-01-01");
    const b = getDailyZipChallenge("2026-01-02");
    expect(a.numberedCells).not.toEqual(b.numberedCells);
  });

  it("tem a versão de desafio atual marcada", () => {
    expect(getDailyZipChallenge("2026-01-01").version).toBe(ZIP_CHALLENGE_VERSION);
  });

  it("tem paredes reais (a mecânica não fica vazia)", () => {
    expect(getDailyZipChallenge("2026-09-23").walls.length).toBeGreaterThan(0);
  });
});

describe("validateZipChallenge — todo desafio publicado precisa passar aqui", () => {
  it("aprova o desafio gerado normalmente, em várias datas", () => {
    for (const date of ["2026-01-01", "2026-05-01", "2026-09-23", "2027-12-31"]) {
      const challenge = getDailyZipChallenge(date);
      const result = validateZipChallenge(challenge);
      expect(result.valid).toBe(true);
    }
  });

  it("nenhuma parede bloqueia a solução real (senão a validação reprovaria)", () => {
    const challenge = getDailyZipChallenge("2026-09-23");
    for (let i = 1; i < challenge.solution.length; i++) {
      expect(
        hasWallBetween(challenge.walls, challenge.solution[i - 1], challenge.solution[i]),
      ).toBe(false);
    }
  });

  it("rejeita solução incompleta (não cobre todas as células)", () => {
    const challenge = getDailyZipChallenge("2026-09-23");
    const broken = { ...challenge, solution: challenge.solution.slice(0, 10) };
    const result = validateZipChallenge(broken);
    expect(result.valid).toBe(false);
  });

  it("rejeita solução com célula repetida", () => {
    const challenge = getDailyZipChallenge("2026-09-23");
    const solution = [...challenge.solution];
    solution[5] = solution[0];
    const result = validateZipChallenge({ ...challenge, solution });
    expect(result.valid).toBe(false);
  });

  it("rejeita solução que não começa no número 1", () => {
    const challenge = getDailyZipChallenge("2026-09-23");
    const reversed = [...challenge.solution].reverse();
    const result = validateZipChallenge({ ...challenge, solution: reversed });
    // Só reprova se a solução de fato não bate mais com o início/fim —
    // como é uma reversão, o teste garante que checamos início E fim.
    expect(result.valid).toBe(false);
  });

  it("rejeita numeração com lacuna/duplicata", () => {
    const challenge = getDailyZipChallenge("2026-09-23");
    const numberedCells = challenge.numberedCells.map((n, i) => (i === 0 ? { ...n, value: 9 } : n));
    const result = validateZipChallenge({ ...challenge, numberedCells });
    expect(result.valid).toBe(false);
  });

  it("rejeita parede fora da grade", () => {
    const challenge = getDailyZipChallenge("2026-09-23");
    const walls = [...challenge.walls, { row: 99, column: 99, side: "right" as const }];
    const result = validateZipChallenge({ ...challenge, walls });
    expect(result.valid).toBe(false);
  });
});
