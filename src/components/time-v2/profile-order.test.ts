import { describe, expect, it } from "vitest";
import { DEFAULT_SECTION_ORDER, orderSections } from "./profile-order";

describe("orderSections", () => {
  it("padrão mantém a ordem original", () => {
    expect(orderSections("padrao", { comunicacao: true })).toEqual(DEFAULT_SECTION_ORDER);
  });
  it("maior atenção sobe as seções com pendência, sem perder nenhuma", () => {
    const o = orderSections("atencao", { dependencias: true, atividade: true });
    expect(o.slice(0, 2)).toEqual(["atividade", "dependencias"]);
    expect(new Set(o).size).toBe(DEFAULT_SECTION_ORDER.length);
  });
  it("sem nenhuma atenção volta à ordem padrão", () => {
    expect(orderSections("atencao", {})).toEqual(DEFAULT_SECTION_ORDER);
  });
  it("escolher uma seção a coloca no topo e preserva as demais", () => {
    const o = orderSections("historico", {});
    expect(o[0]).toBe("historico");
    expect(o.slice(1)).toEqual(DEFAULT_SECTION_ORDER.filter((s) => s !== "historico"));
  });
});
