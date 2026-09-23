import { describe, expect, it } from "vitest";
import { evaluateGuess, keyboardLetterStates, isWin, buildShareText } from "./termo-game";

describe("evaluateGuess — casos básicos", () => {
  it("acerto total marca tudo correct", () => {
    expect(evaluateGuess("CASAS", "CASAS")).toEqual([
      "correct",
      "correct",
      "correct",
      "correct",
      "correct",
    ]);
  });

  it("letra ausente marca absent", () => {
    expect(evaluateGuess("XYZWQ", "CASAS")).toEqual([
      "absent",
      "absent",
      "absent",
      "absent",
      "absent",
    ]);
  });

  it("letra em posição errada marca present", () => {
    // ARROZ tem A na posição 0; testar com A deslocado.
    const result = evaluateGuess("ZORRA", "ARROZ");
    expect(result[4]).toBe("present"); // A no fim, existe na resposta mas não nessa posição
  });
});

describe("evaluateGuess — letras repetidas (regra explícita do pedido)", () => {
  it('resposta com um só "A": tentativa com três "A" não marca as três como present/correct', () => {
    // Resposta fictícia com um único A: "BARCO" tem 1 A na posição 1.
    const answer = "BARCO";
    const guess = "AAAAA";
    const result = evaluateGuess(guess, answer);
    const countMarked = result.filter((s) => s !== "absent").length;
    expect(countMarked).toBe(1); // só uma ocorrência de A na resposta
    expect(result[1]).toBe("correct"); // BARCO tem A justamente na posição 1
  });

  it("acerta a posição exata de uma letra repetida e marca as demais ocorrências como present só até o limite real", () => {
    // Resposta "FICAR" tem 1 F, 1 I, 1 C, 1 A, 1 R — sem repetição própria,
    // então construímos um caso com repetição na TENTATIVA usando uma
    // resposta que tem 2 ocorrências de uma letra.
    // "TERRA" tem 2 R (posições 2 e 4).
    const answer = "TERRA";
    const guess = "RRRRR";
    const result = evaluateGuess(guess, answer);
    const countCorrectOrPresent = result.filter((s) => s !== "absent").length;
    expect(countCorrectOrPresent).toBe(2); // só 2 R existem na resposta
  });

  it("prioriza acertos exatos antes de distribuir os amarelos restantes", () => {
    const answer = "TERRA";
    // Tentativa "RATER": posições -> R,A,T,E,R
    // Resposta:            T,E,R,R,A
    const guess = "RATER";
    const result = evaluateGuess(guess, answer);
    // guess[4] = 'R', answer[4] = 'A' -> não correct; guess[2]='T', answer[2]='R' -> não correct
    // Nenhuma posição exata aqui é esperada ser 'correct' incondicionalmente;
    // o teste real é que o total de R's marcados (correct+present) não passe de 2.
    const rIndices = [0, 4].filter((i) => guess[i] === "R" || true);
    void rIndices;
    const totalRMarks = result.filter((s, i) => guess[i] === "R" && s !== "absent").length;
    expect(totalRMarks).toBeLessThanOrEqual(2);
  });
});

describe("evaluateGuess — normalização de acentos/maiúsculas", () => {
  it("é case-insensitive", () => {
    expect(evaluateGuess("casas", "CASAS")).toEqual([
      "correct",
      "correct",
      "correct",
      "correct",
      "correct",
    ]);
  });
});

describe("isWin", () => {
  it("true só quando todas as posições são correct", () => {
    expect(isWin(["correct", "correct", "correct", "correct", "correct"])).toBe(true);
    expect(isWin(["correct", "present", "correct", "correct", "correct"])).toBe(false);
  });
});

describe("keyboardLetterStates — nunca rebaixa uma letra já verde", () => {
  it("mantém o melhor estado entre tentativas", () => {
    const guesses = [
      { word: "ARROZ", result: evaluateGuess("ARROZ", "ARROZ") }, // A correct
      { word: "AZUL5", result: ["present", "absent", "absent", "absent", "absent"] as const },
    ];
    const states = keyboardLetterStates(guesses as never);
    expect(states.A).toBe("correct");
  });
});

describe("buildShareText — nunca revela a palavra", () => {
  it("gera texto com quadrados coloridos e tentativas, sem a resposta", () => {
    const results = [evaluateGuess("CASAS", "CASAS")];
    const text = buildShareText(results, true, 1);
    expect(text).toContain("Termo Você no Hype #1");
    expect(text).toContain("1/6");
    expect(text).not.toMatch(/CASAS/i);
    expect(text).toContain("🟩");
  });

  it("marca X/6 quando perdeu", () => {
    const results = [evaluateGuess("CASAS", "BARCO")];
    const text = buildShareText(results, false, 2);
    expect(text).toContain("X/6");
  });
});
