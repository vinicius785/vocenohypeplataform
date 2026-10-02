import { describe, expect, it } from "vitest";
import { DEFAULT_SECTION_ORDER, orderSections } from "./profile-order";

describe("orderSections", () => {
  it("padrão mantém a ordem original", () => {
    expect(orderSections("padrao", { comunicacao: true })).toEqual(DEFAULT_SECTION_ORDER);
  });
  it("maior atenção sobe as seções com pendência, sem perder nenhuma", () => {
    const o = orderSections("atencao", { comunicacao: true, atividade: true });
    expect(o).toEqual(["atividade", "comunicacao", "jornada", "desempenho", "historico"]);
    expect(new Set(o).size).toBe(5);
  });
  it("sem nenhuma atenção volta à ordem padrão", () => {
    expect(orderSections("atencao", {})).toEqual(DEFAULT_SECTION_ORDER);
  });
  it("escolher uma seção a coloca no topo e preserva as demais", () => {
    expect(orderSections("desempenho", {})).toEqual([
      "desempenho",
      "atividade",
      "jornada",
      "comunicacao",
      "historico",
    ]);
    expect(orderSections("historico", {})[0]).toBe("historico");
  });
});
