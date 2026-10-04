import { describe, expect, it } from "vitest";
import {
  inscricaoSteps,
  validateAnexoFile,
  validateInscricao,
  type InscricaoRules,
  type InscricaoValues,
} from "./inscricao-validation";

const rules = (over: Partial<InscricaoRules["fields"]> = {}): InscricaoRules => ({
  fields: {
    nicho: { visible: true, required: false },
    redes: { visible: true, required: true },
    mensagem: { visible: true, required: false },
    midiaKit: { visible: true, required: false },
    ...over,
  },
  customQuestions: [{ id: "q1", label: "Cidade onde mora", required: true }],
});
const ok: InscricaoValues = {
  nome: "Ana Lima",
  telefone: "(21) 99999-9999",
  email: "ana@email.com",
  nicho: "",
  redesComHandle: 1,
  mensagem: "",
  temAnexo: false,
  respostas: { q1: "Rio" },
};

describe("validateInscricao", () => {
  it("válido: sem erros", () => {
    expect(validateInscricao(ok, rules())).toEqual({});
  });
  it("campos sempre obrigatórios têm mensagem específica", () => {
    const e = validateInscricao({ ...ok, nome: " ", telefone: "", email: "" }, rules());
    expect(e.nome).toMatch(/nome completo/);
    expect(e.telefone).toMatch(/DDD/);
    expect(e.email).toBe("Informe seu e-mail.");
  });
  it("e-mail mal formado e telefone curto", () => {
    const e = validateInscricao({ ...ok, email: "ana@", telefone: "123" }, rules());
    expect(e.email).toMatch(/não parece válido/);
    expect(e.telefone).toMatch(/Confira o telefone/);
  });
  it("respeita a configuração da página (redes, mensagem, mídia kit, nicho, perguntas)", () => {
    const r = rules({
      nicho: { visible: true, required: true },
      mensagem: { visible: true, required: true },
      midiaKit: { visible: true, required: true },
    });
    const e = validateInscricao({ ...ok, redesComHandle: 0, respostas: {} }, r);
    expect(Object.keys(e).sort()).toEqual(["anexo", "mensagem", "nicho", "q:q1", "redes"]);
    expect(e["q:q1"]).toContain("Cidade onde mora");
  });
  it("campo oculto nunca é exigido", () => {
    const r = rules({ redes: { visible: false, required: true } });
    expect(validateInscricao({ ...ok, redesComHandle: 0 }, r).redes).toBeUndefined();
  });
});

describe("inscricaoSteps", () => {
  it("lista só as etapas visíveis e marca as completas", () => {
    const steps = inscricaoSteps({ ...ok, redesComHandle: 0 }, rules());
    expect(steps.map((s) => s.id)).toEqual(["dados", "redes", "proposta", "materiais"]);
    expect(steps.find((s) => s.id === "redes")?.done).toBe(false);
    expect(steps.find((s) => s.id === "dados")?.done).toBe(true);
  });
  it("sem redes/mídia kit visíveis, só dados e proposta", () => {
    const r = rules({
      redes: { visible: false, required: false },
      midiaKit: { visible: false, required: false },
    });
    expect(inscricaoSteps(ok, r).map((s) => s.id)).toEqual(["dados", "proposta"]);
  });
});

describe("validateAnexoFile", () => {
  it("aceita PDF/imagem até 5 MB e recusa o resto com motivo", () => {
    expect(validateAnexoFile({ type: "application/pdf", size: 1_000_000 })).toBeNull();
    expect(validateAnexoFile({ type: "application/zip", size: 10 })).toMatch(/Formato não aceito/);
    expect(validateAnexoFile({ type: "image/png", size: 6 * 1024 * 1024 })).toMatch(
      /limite é 5 MB/,
    );
  });
});
