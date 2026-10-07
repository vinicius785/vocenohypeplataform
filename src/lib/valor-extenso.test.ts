import { describe, expect, it } from "vitest";
import {
  formatCents,
  formatReaisCompact,
  numeroPorExtenso,
  parseMoneyCents,
  valorPorExtenso,
} from "./valor-extenso";

describe("parseMoneyCents", () => {
  it("formatos brasileiros e simples", () => {
    expect(parseMoneyCents("R$ 1.234,56")).toBe(123456);
    expect(parseMoneyCents("1234,56")).toBe(123456);
    expect(parseMoneyCents("1.234,5")).toBe(123450);
    expect(parseMoneyCents("1234.56")).toBe(123456);
    expect(parseMoneyCents("1234.5")).toBe(123450);
    expect(parseMoneyCents("1.234")).toBe(123400);
    expect(parseMoneyCents("3500")).toBe(350000);
    expect(parseMoneyCents("0,00")).toBe(0);
  });
  it("vazio ou inválido é null, nunca 0", () => {
    for (const bad of [
      "",
      "   ",
      "abc",
      "1,234,5",
      "1.2.3",
      "12,345",
      "-5",
      "1,2,3",
      "R$",
      undefined,
      null,
    ]) {
      expect(parseMoneyCents(bad as string | undefined)).toBeNull();
    }
  });
});

describe("formatCents", () => {
  it("milhar com ponto e vírgula nos centavos", () => {
    expect(formatCents(123456)).toBe("1.234,56");
    expect(formatCents(5)).toBe("0,05");
    expect(formatCents(100000000)).toBe("1.000.000,00");
  });
});

describe("numeroPorExtenso", () => {
  it("casos de conectivo 'e'", () => {
    expect(numeroPorExtenso(0)).toBe("zero");
    expect(numeroPorExtenso(21)).toBe("vinte e um");
    expect(numeroPorExtenso(100)).toBe("cem");
    expect(numeroPorExtenso(101)).toBe("cento e um");
    expect(numeroPorExtenso(1000)).toBe("mil");
    expect(numeroPorExtenso(1100)).toBe("mil e cem");
    expect(numeroPorExtenso(1234)).toBe("mil duzentos e trinta e quatro");
    expect(numeroPorExtenso(2500)).toBe("dois mil e quinhentos");
    expect(numeroPorExtenso(1_000_001)).toBe("um milhão e um");
    expect(numeroPorExtenso(2_500_000)).toBe("dois milhões e quinhentos mil");
  });
  it("recusa fora do intervalo", () => {
    expect(() => numeroPorExtenso(-1)).toThrow();
    expect(() => numeroPorExtenso(1.5)).toThrow();
  });
});

describe("valorPorExtenso", () => {
  it("reais e centavos, singular e plural", () => {
    expect(valorPorExtenso(123456)).toBe(
      "mil duzentos e trinta e quatro reais e cinquenta e seis centavos",
    );
    expect(valorPorExtenso(100)).toBe("um real");
    expect(valorPorExtenso(1)).toBe("um centavo");
    expect(valorPorExtenso(101)).toBe("um real e um centavo");
    expect(valorPorExtenso(350000)).toBe("três mil e quinhentos reais");
    expect(valorPorExtenso(0)).toBe("zero reais");
  });
  it("milhões redondos levam 'de reais'", () => {
    expect(valorPorExtenso(100_000_000)).toBe("um milhão de reais");
    expect(valorPorExtenso(200_000_050)).toBe("dois milhões de reais e cinquenta centavos");
  });
});

describe("formatReaisCompact", () => {
  it("valor redondo sem ',00' (como o template escreve R$ 100.000); com centavos mantém", () => {
    expect(formatReaisCompact(10_000_000)).toBe("100.000");
    expect(formatReaisCompact(350_000)).toBe("3.500");
    expect(formatReaisCompact(123_456)).toBe("1.234,56");
    expect(formatReaisCompact(100_050)).toBe("1.000,50");
    expect(formatReaisCompact(5)).toBe("0,05");
    expect(formatReaisCompact(0)).toBe("0");
  });
});
