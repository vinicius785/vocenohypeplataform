import { describe, expect, it } from "vitest";
import { normalizePortugueseWord } from "./normalize";

describe("normalizePortugueseWord — única função de normalização do Termo", () => {
  it("minúsculas viram maiúsculas", () => {
    expect(normalizePortugueseWord("peito")).toBe("PEITO");
  });

  it("já maiúscula permanece igual", () => {
    expect(normalizePortugueseWord("TERMO")).toBe("TERMO");
  });

  it("remove cedilha e til (ç, ã)", () => {
    expect(normalizePortugueseWord("órgão")).toBe("ORGAO");
  });

  it("remove acento agudo", () => {
    expect(normalizePortugueseWord("avó")).toBe("AVO");
  });

  it("remove espaços internos e das bordas", () => {
    expect(normalizePortugueseWord("  ter mo ")).toBe("TERMO");
  });

  it("descarta caracteres que não são letras", () => {
    expect(normalizePortugueseWord("te2rm-o!")).toBe("TERMO");
  });

  it("é idempotente (normalizar duas vezes dá o mesmo resultado)", () => {
    const once = normalizePortugueseWord("Fácil");
    expect(normalizePortugueseWord(once)).toBe(once);
  });
});
