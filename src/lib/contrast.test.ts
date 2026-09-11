import { describe, expect, it } from "vitest";
import { contrastRatio, meetsAA } from "./contrast";

describe("contrastRatio", () => {
  it("preto sobre branco é o contraste máximo (21:1)", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 0);
  });

  it("uma cor contra ela mesma é 1:1", () => {
    expect(contrastRatio("#6F95FF", "#6F95FF")).toBeCloseTo(1, 2);
  });

  it("é simétrico — ordem dos argumentos não muda o resultado", () => {
    expect(contrastRatio("#111318", "#F3F4F6")).toBeCloseTo(contrastRatio("#F3F4F6", "#111318"), 5);
  });
});

describe("meetsAA — pares reais do design system", () => {
  it("botão primário corrigido (#0B1020 sobre a marca #6F95FF) passa AA de texto normal", () => {
    expect(meetsAA("#0B1020", "#6F95FF")).toBe(true);
    expect(contrastRatio("#0B1020", "#6F95FF")).toBeGreaterThanOrEqual(4.5);
  });

  it("a versão anterior (branco sobre a marca) falhava AA — por isso foi corrigida", () => {
    expect(meetsAA("#FFFFFF", "#6F95FF")).toBe(false);
  });

  it("texto secundário novo (#4B5563) passa AA sobre o fundo real da página (#F3F4F6)", () => {
    expect(meetsAA("#4B5563", "#F3F4F6")).toBe(true);
  });

  it("o --muted-foreground global antigo (#62748E) NÃO passava AA sobre o fundo real — por isso não foi reutilizado", () => {
    expect(meetsAA("#62748E", "#F3F4F6")).toBe(false);
  });

  it("texto principal claro e escuro passam AA com folga", () => {
    expect(meetsAA("#111318", "#F3F4F6")).toBe(true);
    expect(meetsAA("#F7F8FA", "#090B0F")).toBe(true);
  });

  it("texto secundário escuro (#9CA3AF) passa AA sobre o fundo escuro real", () => {
    expect(meetsAA("#9CA3AF", "#090B0F")).toBe(true);
  });
});
