import { describe, expect, it } from "vitest";
import {
  findCampanhaByIdInRows,
  findCampanhaBySignupTokenInRows,
  findClienteRowByPublicToken,
  toClientePickerOptions,
} from "./demo-scans";

type Camp = { id: string; nome: string; signupToken?: string };
type Data = { publicToken?: string | null; demoSessionId?: string; campanhas?: Camp[] };

const real: { id: string; data: Data } = {
  id: "c-real",
  data: {
    publicToken: "TOKEN-REAL",
    campanhas: [{ id: "k-real", nome: "Real", signupToken: "SIGN-REAL" }],
  },
};
// Mesmo que uma demo ESTIVESSE com tokens iguais aos de produção, nenhum resolve para ela.
const demo: { id: string; data: Data } = {
  id: "c-demo",
  data: {
    demoSessionId: "sess",
    publicToken: "TOKEN-DEMO",
    campanhas: [{ id: "k-demo", nome: "Demo", signupToken: "SIGN-DEMO" }],
  },
};
const rows = [demo, real];

describe("findClienteRowByPublicToken", () => {
  it("acha o cliente real pelo token", () => {
    expect(findClienteRowByPublicToken(rows, "TOKEN-REAL")?.id).toBe("c-real");
  });

  it("NUNCA resolve para uma demo, mesmo com o token correto", () => {
    expect(findClienteRowByPublicToken(rows, "TOKEN-DEMO")).toBeNull();
  });

  it("token desconhecido ou vazio: nada", () => {
    expect(findClienteRowByPublicToken(rows, "nope")).toBeNull();
    expect(findClienteRowByPublicToken([{ id: "x", data: { publicToken: null } }], "")).toBeNull();
  });
});

describe("findCampanhaBySignupTokenInRows", () => {
  it("acha a campanha real e devolve cliente + campanha", () => {
    const hit = findCampanhaBySignupTokenInRows(rows, "SIGN-REAL")!;
    expect(hit.clienteId).toBe("c-real");
    expect(hit.campanha.id).toBe("k-real");
    expect(hit.cliente).toBe(real.data);
  });

  it("NUNCA resolve para campanha de demo", () => {
    expect(findCampanhaBySignupTokenInRows(rows, "SIGN-DEMO")).toBeNull();
  });
});

describe("findCampanhaByIdInRows (link público de NPS)", () => {
  it("acha campanha real por id; campanha de demo não é encontrada", () => {
    expect(findCampanhaByIdInRows(rows, "k-real")?.nome).toBe("Real");
    expect(findCampanhaByIdInRows(rows, "k-demo")).toBeNull();
    expect(findCampanhaByIdInRows(rows, "k-nao-existe")).toBeNull();
  });
});

describe("toClientePickerOptions (destinatários de e-mail)", () => {
  const rows = [
    { id: "1", data: { empresa: "Real", email: "ana@real.com.br", responsavel: "Ana" } },
    { id: "2", data: { empresa: "Sem e-mail", email: "", responsavel: "X" } },
    // Mesmo com e-mail preenchido, a demonstração NUNCA vira destinatário.
    {
      id: "3",
      data: { demoSessionId: "s", empresa: "Demo", email: "x@demo.invalid", responsavel: "D" },
    },
    { id: "4", data: { empresa: "Parcial", email: "p@x.com" } },
  ];

  it("só clientes reais com e-mail; campos ausentes viram texto vazio", () => {
    expect(toClientePickerOptions(rows)).toEqual([
      { id: "1", empresa: "Real", email: "ana@real.com.br", responsavel: "Ana" },
      { id: "4", empresa: "Parcial", email: "p@x.com", responsavel: "" },
    ]);
  });

  it("lista vazia: vazio", () => {
    expect(toClientePickerOptions([])).toEqual([]);
  });
});
