import { describe, expect, it } from "vitest";
import type { Influ, InfluencerFieldKey } from "./influencer-model";
import { availableResources, financePendencies } from "./influencer-resources";

const influ = (o: Partial<Influ> = {}): Influ =>
  ({ id: "i", nome: "Ana", status: "APROVADO", entregas: [], redes: [], ...o }) as Influ;
const ALL = () => true;
const only =
  (...keys: InfluencerFieldKey[]) =>
  (k: InfluencerFieldKey) =>
    keys.includes(k);
const pag = (aprovacao: "pendente" | "aceito" | "recusado") =>
  ({ tipos: ["Valor"], config: { Valor: { valor: "100" } }, aprovacao }) as Influ["pagamento"];

describe("pendências do financeiro", () => {
  it("tudo faltando → 3 (remuneração, dados bancários, contrato)", () => {
    expect(financePendencies(influ(), ALL)).toBe(3);
  });
  it("remuneração com aprovação pendente ou recusada conta; aceita não", () => {
    const base = {
      bank: { titular: "Ana" },
      contrato: "data:text/plain;base64,aGk=",
    } as Partial<Influ>;
    expect(financePendencies(influ({ ...base, pagamento: pag("pendente") }), ALL)).toBe(1);
    expect(financePendencies(influ({ ...base, pagamento: pag("recusado") }), ALL)).toBe(1);
    expect(financePendencies(influ({ ...base, pagamento: pag("aceito") }), ALL)).toBe(0);
  });
  it("só conta o que o usuário enxerga e só para aprovado", () => {
    expect(financePendencies(influ(), only("contrato"))).toBe(1);
    expect(financePendencies(influ(), only())).toBe(0);
    expect(financePendencies(influ({ status: "EM_CURADORIA" }), ALL)).toBe(0);
  });
});

describe("recursos disponíveis", () => {
  it("sempre tem Contexto; financeiro e perfil dependem da permissão por campo", () => {
    const keys = (i: Influ, has: (k: InfluencerFieldKey) => boolean = ALL, hasNpsLink = false) =>
      availableResources(i, { has, hasNpsLink }).map((r) => r.key);
    expect(keys(influ())).toEqual(["perfil", "financeiro", "contexto"]);
    expect(keys(influ(), only("entregas"))).toEqual(["contexto"]);
    expect(keys(influ(), only("metricas", "bancario"))).toEqual([
      "perfil",
      "financeiro",
      "contexto",
    ]);
  });
  it("inscrição só quando veio da página; NPS só com link; outros só com mídia kit", () => {
    const i = influ({
      submittedVia: "inscricao_page",
      midiaKit: [{ id: "m" } as never],
    });
    const items = availableResources(i, { has: ALL, hasNpsLink: true });
    expect(items.map((r) => r.key)).toEqual([
      "perfil",
      "financeiro",
      "contexto",
      "inscricao",
      "nps",
      "outros",
    ]);
    expect(items.find((r) => r.key === "financeiro")?.attention).toBe(true);
  });
  it("financeiro resolvido não pede atenção", () => {
    const i = influ({
      pagamento: pag("aceito"),
      bank: { titular: "Ana" },
      contrato: "data:text/plain;base64,aGk=",
    });
    expect(
      availableResources(i, { has: ALL, hasNpsLink: false }).find((r) => r.key === "financeiro")
        ?.attention,
    ).toBe(false);
  });
});
