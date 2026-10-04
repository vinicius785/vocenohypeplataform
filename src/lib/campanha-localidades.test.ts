import { describe, expect, it } from "vitest";
import { isLocationText, parseRegioes, resolveLocalizacao, toItems } from "./campanha-localidades";

describe("parseRegioes", () => {
  it("campanha em um estado: destaca só o estado, sem localidades", () => {
    const r = parseRegioes("Rio de Janeiro");
    expect(r.states).toEqual(["RJ"]);
    expect(r.headline).toEqual(["Rio de Janeiro"]);
    expect(r.localidades).toEqual([]);
  });
  it("vários estados (vírgula e ' e ')", () => {
    expect(parseRegioes("São Paulo, Minas Gerais").states).toEqual(["MG", "SP"]);
    expect(parseRegioes("Rio de Janeiro e São Paulo").states).toEqual(["RJ", "SP"]);
  });
  it("macrorregião e Brasil inteiro", () => {
    expect(parseRegioes("Sudeste").states).toEqual(["ES", "MG", "RJ", "SP"]);
    expect(parseRegioes("Todo o Brasil").states).toHaveLength(27);
    expect(parseRegioes("Todo o Brasil").headline).toEqual(["Brasil inteiro"]);
  });
  it("municípios com UF destacam o estado; sem UF ficam só na lista (sem inventar estado)", () => {
    const r = parseRegioes(
      "São João de Meriti - RJ, Duque de Caxias - RJ, Bangu, Rio de Janeiro - RJ.",
    );
    expect(r.states).toEqual(["RJ"]);
    expect(r.localidades.map((l) => l.nome)).toEqual([
      "São João de Meriti",
      "Duque de Caxias",
      "Bangu",
      "Rio de Janeiro",
    ]);
    expect(r.headline).toEqual(["Rio de Janeiro"]);
    expect(parseRegioes("Bangu").states).toEqual([]);
  });
  it("aceita sigla após barra/parênteses e acentos/caixa diferentes", () => {
    expect(parseRegioes("Niterói/RJ; Santos (SP)").states).toEqual(["RJ", "SP"]);
    expect(parseRegioes("sao paulo").states).toEqual(["SP"]);
  });
  it("vazio não gera nada", () => {
    expect(parseRegioes("  ")).toMatchObject({ states: [], localidades: [], headline: [] });
    expect(parseRegioes(undefined).states).toEqual([]);
  });
});

describe("Público desejado x localização", () => {
  it("'Rio de Janeiro' como público é localização: some do público e soma ao mapa", () => {
    const regioes = parseRegioes("Bangu - RJ");
    expect(isLocationText("Rio de Janeiro", regioes)).toBe(true);
    const r = resolveLocalizacao({ regioes: "Bangu - RJ", publicoDesejado: "Rio de Janeiro" });
    expect(r.publico).toBeUndefined();
    expect(r.states).toEqual(["RJ"]);
  });
  it("público real (texto de audiência) é mantido", () => {
    const r = resolveLocalizacao({
      regioes: "São Paulo",
      publicoDesejado: "Mulheres de 25 a 40 anos, interessadas em finanças",
    });
    expect(r.publico).toBe("Mulheres de 25 a 40 anos, interessadas em finanças");
  });
  it("sem público: não inventa", () => {
    expect(resolveLocalizacao({ regioes: "Sul" }).publico).toBeUndefined();
  });
});

describe("toItems", () => {
  it("quebra linhas/; em itens e remove marcadores", () => {
    expect(toItems("- Visita à unidade\n• Aprovação prévia; Nota fiscal")).toEqual([
      "Visita à unidade",
      "Aprovação prévia",
      "Nota fiscal",
    ]);
    expect(toItems(undefined)).toEqual([]);
  });
});
