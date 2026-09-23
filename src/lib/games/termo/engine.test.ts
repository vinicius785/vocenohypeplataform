import { describe, expect, it } from "vitest";
import {
  evaluateGuess,
  isWin,
  isAcceptedGuess,
  keyboardLetterStates,
  buildShareText,
  checkDictionaryHealth,
  todayTermoAnswer,
  TERMO_WORD_LENGTH,
  TERMO_MAX_ATTEMPTS,
} from "./engine";
import { DAILY_ANSWERS, ALLOWED_GUESSES } from "./dictionary";

describe("dicionário — nunca mais uma lista mínima de demonstração", () => {
  it("tem uma quantidade real de palavras (não uma dúzia hand-picked)", () => {
    expect(DAILY_ANSWERS.length).toBeGreaterThan(500);
  });

  it("checkDictionaryHealth aprova o dicionário atual", () => {
    expect(checkDictionaryHealth()).toEqual({ ok: true, totalWords: DAILY_ANSWERS.length });
  });

  it("todas as respostas têm 5 letras após normalizar", () => {
    for (const w of DAILY_ANSWERS) {
      expect(w.normalize("NFD").replace(/[̀-ͯ]/g, "")).toHaveLength(TERMO_WORD_LENGTH);
    }
  });

  it("não há duplicadas nas respostas", () => {
    expect(new Set(DAILY_ANSWERS).size).toBe(DAILY_ANSWERS.length);
  });

  it("toda resposta está contida nas tentativas aceitas", () => {
    for (const w of DAILY_ANSWERS) expect(ALLOWED_GUESSES).toContain(w);
  });

  // Palavras explicitamente exigidas pelo pedido — casos mínimos de
  // regressão, não a extensão real do dicionário (isso é garantido pelo
  // teste de tamanho acima).
  it.each([
    "TERMO",
    "PEITO",
    "LIVRO",
    "CAMPO",
    "NOITE",
    "PRAIA",
    "TEMPO",
    "PORTA",
    "PEDRA",
    "FESTA",
  ])('aceita "%s" como tentativa válida', (word) => {
    expect(isAcceptedGuess(word)).toBe(true);
  });

  it("rejeita uma palavra claramente inventada", () => {
    expect(isAcceptedGuess("ZZQXW")).toBe(false);
    expect(isAcceptedGuess("XPTOX")).toBe(false);
  });

  it("aceita em minúsculas e com espaços (normalização na validação)", () => {
    expect(isAcceptedGuess("  termo ")).toBe(true);
    expect(isAcceptedGuess("peito")).toBe(true);
  });
});

describe("todayTermoAnswer — determinístico, nunca Math.random, sempre do dicionário", () => {
  it("mesma data sempre devolve a mesma palavra", () => {
    expect(todayTermoAnswer("2026-09-23")).toBe(todayTermoAnswer("2026-09-23"));
  });

  it("a palavra do dia sempre pertence ao dicionário de respostas", () => {
    for (const date of ["2026-01-01", "2026-06-15", "2026-12-31"]) {
      expect(DAILY_ANSWERS).toContain(todayTermoAnswer(date));
    }
  });
});

describe("evaluateGuess — duas passagens, letras repetidas corretamente", () => {
  it("acerto total", () => {
    expect(evaluateGuess("CASAS", "CASAS")).toEqual([
      "correct",
      "correct",
      "correct",
      "correct",
      "correct",
    ]);
  });

  it("letra ausente", () => {
    expect(evaluateGuess("CASAS", "XYZWQ")).toEqual([
      "absent",
      "absent",
      "absent",
      "absent",
      "absent",
    ]);
  });

  it('resposta com um só "A" — tentativa com três "A" marca só as ocorrências reais', () => {
    const result = evaluateGuess("BARCO", "AAAAA");
    const marked = result.filter((s) => s !== "absent").length;
    expect(marked).toBe(1);
    expect(result[1]).toBe("correct"); // BARCO tem A na posição 1
  });

  it("duas ocorrências na resposta, tentativa com a letra 5x — marca só 2", () => {
    const result = evaluateGuess("TERRA", "RRRRR"); // TERRA tem 2 R
    const marked = result.filter((s) => s !== "absent").length;
    expect(marked).toBe(2);
  });

  it("prioriza acertos exatos antes de distribuir os amarelos restantes", () => {
    const result = evaluateGuess("TERRA", "RATER");
    const totalRMarks = result.filter((s, i) => "RATER"[i] === "R" && s !== "absent").length;
    expect(totalRMarks).toBeLessThanOrEqual(2);
  });

  it("normaliza acentos e caixa antes de comparar", () => {
    expect(evaluateGuess("ÓRGÃO".toUpperCase(), "orgao")).toEqual([
      "correct",
      "correct",
      "correct",
      "correct",
      "correct",
    ]);
  });
});

describe("isWin", () => {
  it("só true quando todas as posições são correct", () => {
    expect(isWin(["correct", "correct", "correct", "correct", "correct"])).toBe(true);
    expect(isWin(["correct", "present", "correct", "correct", "correct"])).toBe(false);
    expect(isWin([])).toBe(false);
  });
});

describe("keyboardLetterStates — nunca rebaixa uma letra já correta", () => {
  it("mantém o melhor estado entre tentativas sucessivas", () => {
    const guesses = [
      { word: "PORTA", result: evaluateGuess("PORTA", "PORTA") },
      { word: "PRATO", result: evaluateGuess("PORTA", "PRATO") },
    ];
    const states = keyboardLetterStates(guesses);
    expect(states.P).toBe("correct");
  });
});

describe("buildShareText — nunca revela a resposta", () => {
  it("inclui tentativas e emojis, nunca a palavra", () => {
    const results = [evaluateGuess("CASAS", "CASAS")];
    const text = buildShareText(results, true, 5);
    expect(text).toContain("1/6");
    expect(text).toContain("🟩");
    expect(text).not.toMatch(/CASAS/i);
  });

  it("perdeu -> X/6", () => {
    const text = buildShareText([evaluateGuess("CASAS", "PORTA")], false, 5);
    expect(text).toContain("X/6");
  });
});

describe("TERMO_MAX_ATTEMPTS/TERMO_WORD_LENGTH — constantes do motor", () => {
  it("6 tentativas, 5 letras", () => {
    expect(TERMO_MAX_ATTEMPTS).toBe(6);
    expect(TERMO_WORD_LENGTH).toBe(5);
  });
});
