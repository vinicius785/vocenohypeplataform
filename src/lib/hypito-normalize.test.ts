import { describe, expect, it } from "vitest";
import {
  normalizeForMatch,
  normalizeCompact,
  tokenize,
  stripStopwords,
  levenshtein,
  isCloseTo,
  hasCloseToken,
  scoreMatch,
} from "@/lib/hypito-normalize";

describe("normalizeForMatch", () => {
  it("remove acentos, baixa caixa e colapsa espaços/pontuação", () => {
    expect(normalizeForMatch("  Poupatempo   RJ! ")).toBe("poupatempo rj");
    expect(normalizeForMatch("Coração, Amazônia?")).toBe("coracao amazonia");
  });

  it("nunca altera o texto original armazenado — é só pra comparação", () => {
    const original = "Poupatempo RJ";
    normalizeForMatch(original);
    expect(original).toBe("Poupatempo RJ");
  });
});

describe("normalizeCompact", () => {
  it("equivale nomes com e sem espaço/hífen", () => {
    expect(normalizeCompact("PoupatempoRJ")).toBe(normalizeCompact("Poupatempo RJ"));
    expect(normalizeCompact("poupatempo-rj")).toBe(normalizeCompact("Poupatempo RJ"));
  });
});

describe("tokenize / stripStopwords", () => {
  it("separa palavras concatenadas por espaço/hífen em tokens", () => {
    expect(tokenize("Poupatempo-RJ")).toEqual(["poupatempo", "rj"]);
  });

  it("remove stopwords só do texto de busca, preservando o nome real", () => {
    expect(stripStopwords("campanha do Poupatempo")).toBe("poupatempo");
    expect(stripStopwords("a campanha da Jackery")).toBe("jackery");
  });

  it("nunca esvazia completamente uma frase feita só de stopwords", () => {
    expect(stripStopwords("a de para")).not.toBe("");
  });
});

describe("levenshtein / isCloseTo", () => {
  it("distância zero pra strings iguais", () => {
    expect(levenshtein("tarefa", "tarefa")).toBe(0);
  });

  it("tolera 1 erro de digitação em palavra curta (tarefs ~ tarefas)", () => {
    expect(isCloseTo("tarefs", "tarefas")).toBe(true);
  });

  it("não aproxima palavras totalmente diferentes", () => {
    expect(isCloseTo("campanha", "reuniao")).toBe(false);
  });

  it("não aproxima palavras muito curtas mesmo com 1 diferença", () => {
    expect(isCloseTo("oi", "de")).toBe(false);
  });

  it("hasCloseToken encontra token tolerante dentro de uma lista", () => {
    expect(hasCloseToken(["criar", "tarefs"], "tarefa", "tarefas")).toBe(true);
    expect(hasCloseToken(["reuniao"], "tarefa", "tarefas")).toBe(false);
  });
});

describe("scoreMatch", () => {
  it("nome original exatamente igual pontua o máximo", () => {
    expect(scoreMatch("Poupatempo RJ", "Poupatempo RJ").score).toBe(1);
  });

  it("nome normalizado igual (case/acento) pontua muito alto", () => {
    expect(scoreMatch("poupatempo rj", "Poupatempo RJ").score).toBeGreaterThanOrEqual(0.98);
  });

  it("forma compacta (sem espaço) reconhece 'PoupatempoRJ' vs 'Poupatempo RJ'", () => {
    expect(scoreMatch("PoupatempoRJ", "Poupatempo RJ").score).toBeGreaterThanOrEqual(0.95);
  });

  it("busca de um único token dentro de um nome composto pontua alto", () => {
    const s = scoreMatch("poupatempo", "Poupatempo RJ");
    expect(s.score).toBeGreaterThanOrEqual(0.9);
  });

  it("string completamente diferente pontua zero", () => {
    expect(scoreMatch("reuniao de pauta", "Poupatempo RJ").score).toBe(0);
  });

  it("query vazia pontua zero", () => {
    expect(scoreMatch("", "Poupatempo RJ").score).toBe(0);
  });
});
