import { describe, expect, it } from "vitest";
import { applyNumberEdit, digitsOnly, formatThousandsBR } from "./number-input";

describe("milhar pt-BR em tempo real", () => {
  it("digitação sequencial mostra o número exato", () => {
    const seq = ["2", "21", "211", "2111", "21111", "211111"].map((t) =>
      applyNumberEdit(t, t.length),
    );
    expect(seq.map((s) => s.display)).toEqual(["2", "21", "211", "2.111", "21.111", "211.111"]);
    expect(seq[5].digits).toBe("211111");
  });
  it("nunca abrevia nem arredonda", () => {
    expect(applyNumberEdit("10000", 5).display).toBe("10.000");
    expect(applyNumberEdit("1500", 4).display).toBe("1.500");
    expect(formatThousandsBR("1234567")).toBe("1.234.567");
  });
  it("colar: tira o que não é dígito", () => {
    const r = applyNumberEdit("211.111 seguidores", null);
    expect(r.digits).toBe("211111");
    expect(r.display).toBe("211.111");
  });
  it("apagar tudo volta a vazio; backspace desfaz o milhar", () => {
    expect(applyNumberEdit("", 0)).toEqual({ digits: "", display: "", caret: 0 });
    expect(applyNumberEdit("2.11", 4).display).toBe("211");
  });
  it("caret no meio: digitar 9 entre '21' e '1.111' mantém o cursor depois do 9", () => {
    // exibido "21.111", cursor após "21" (pos 2), digita 9 -> "219.111"
    const r = applyNumberEdit("219.111", 3);
    expect(r.display).toBe("219.111");
    expect(r.caret).toBe(3);
  });
  it("caret atravessa o ponto: digitar logo antes de um separador", () => {
    // "2.111" cursor pos 1 (após o 2), digita 5 -> "25.111"
    const r = applyNumberEdit("25.111", 2);
    expect(r.display).toBe("25.111");
    expect(r.caret).toBe(2);
  });
  it("zeros à esquerda e limite de dígitos", () => {
    expect(digitsOnly("000123")).toBe("123");
    expect(applyNumberEdit("1".repeat(20), 20).digits).toHaveLength(12);
  });
});
