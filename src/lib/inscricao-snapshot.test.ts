import { describe, expect, it } from "vitest";
import { describeInscricaoSnapshot } from "./inscricao-snapshot";

describe("describeInscricaoSnapshot", () => {
  const snap = {
    token: "segredo",
    nome: " Ana Lima ",
    telefone: "(21) 99999-9999",
    email: "ana@x.com",
    nicho: "",
    redes: [
      { plataforma: "Instagram", handle: "ana", seguidores: "12k" },
      { plataforma: "", handle: "x" },
    ],
    mensagem: "Topo!",
    respostas: [
      { questionId: "q1", label: "Disponibilidade", value: "Semana toda" },
      {
        questionId: "q2",
        label: "Formatos",
        value: ["Reels", "Stories"],
        fieldType: "selecao_multipla",
      },
      { questionId: "q3", label: "Vazia", value: "" },
      { questionId: "q4", label: "Lista vazia", value: [] },
    ],
  };
  it("monta contato, redes, mensagem e respostas em formato humano", () => {
    const v = describeInscricaoSnapshot(snap);
    expect(v.contato).toEqual([
      { label: "Nome", value: "Ana Lima" },
      { label: "Telefone", value: "(21) 99999-9999" },
      { label: "E-mail", value: "ana@x.com" },
    ]);
    expect(v.redes).toEqual([{ plataforma: "Instagram", handle: "ana", seguidores: "12k" }]);
    expect(v.mensagem).toBe("Topo!");
    expect(v.respostas.map((r) => r.label)).toEqual(["Disponibilidade", "Formatos"]);
  });
  it("não vaza campos técnicos (token) e aguenta snapshot vazio", () => {
    expect(JSON.stringify(describeInscricaoSnapshot(snap))).not.toContain("segredo");
    expect(describeInscricaoSnapshot({})).toEqual({
      contato: [],
      redes: [],
      mensagem: undefined,
      respostas: [],
    });
  });
});
