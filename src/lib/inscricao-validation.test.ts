import { describe, expect, it } from "vitest";
import {
  inscricaoProgress,
  inscricaoSteps,
  joinPtBr,
  progressCopy,
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

/* ---------------- Progresso real da inscrição ---------------- */
const allRequired = (): InscricaoRules => ({
  fields: {
    nicho: { visible: true, required: false }, // opcional não bloqueia
    redes: { visible: true, required: true },
    mensagem: { visible: true, required: true },
    midiaKit: { visible: true, required: true },
  },
  customQuestions: [],
});
const empty: InscricaoValues = {
  nome: "",
  telefone: "",
  email: "",
  nicho: "",
  redesComHandle: 0,
  mensagem: "",
  temAnexo: false,
  respostas: {},
};
const dados = { nome: "Ana Lima", telefone: "(21) 99999-9999", email: "ana@email.com" };

describe("inscricaoProgress — progresso real (todas as etapas obrigatórias)", () => {
  const r = allRequired();
  it("nada preenchido: 0 de 4, 0%, faltam as 4", () => {
    const p = inscricaoProgress(empty, r);
    expect(p.doneCount).toBe(0);
    expect(p.total).toBe(4);
    expect(p.percent).toBe(0);
    expect(p.hasRequiredPending).toBe(true);
    const c = progressCopy(p);
    expect(c.headline).toBe("0 de 4 concluídas");
    expect(c.percentText).toBe("0%");
    expect(c.missingText).toBe("Faltam: Seus dados, Redes sociais, Sua proposta e Materiais");
    expect(c.readyText).toBeNull();
  });
  it("25%: só 'Seus dados' válido", () => {
    const p = inscricaoProgress({ ...empty, ...dados }, r);
    expect(p.doneCount).toBe(1);
    expect(p.percent).toBe(25);
    expect(progressCopy(p).missingText).toBe("Faltam: Redes sociais, Sua proposta e Materiais");
  });
  it("50% e 75%", () => {
    const p2 = inscricaoProgress({ ...empty, ...dados, redesComHandle: 1 }, r);
    expect([p2.doneCount, p2.percent]).toEqual([2, 50]);
    expect(progressCopy(p2).missingText).toBe("Faltam: Sua proposta e Materiais");
    const p3 = inscricaoProgress({ ...empty, ...dados, redesComHandle: 1, mensagem: "Oi" }, r);
    expect([p3.doneCount, p3.percent]).toEqual([3, 75]);
    expect(progressCopy(p3).missingText).toBe("Falta: Materiais");
  });
  it("100%: tudo pronto para enviar, sem 'Faltam'", () => {
    const p = inscricaoProgress(
      { ...empty, ...dados, redesComHandle: 1, mensagem: "Oi", temAnexo: true },
      r,
    );
    expect([p.doneCount, p.percent, p.allDone, p.hasRequiredPending]).toEqual([
      4,
      100,
      true,
      false,
    ]);
    const c = progressCopy(p);
    expect(c.headline).toBe("4 de 4 concluídas");
    expect(c.readyText).toBe("Tudo pronto para enviar");
    expect(c.missingText).toBeNull();
  });
  it("campo obrigatório inválido mantém a etapa pendente (e-mail mal formado)", () => {
    const p = inscricaoProgress({ ...empty, ...dados, email: "ana@" }, r);
    expect(p.steps.find((s) => s.id === "dados")?.done).toBe(false);
    expect(p.steps.find((s) => s.id === "dados")?.hasError).toBe(true);
    expect(p.doneCount).toBe(0);
  });
  it("corrigir o erro atualiza o progresso na hora", () => {
    const bad = inscricaoProgress({ ...empty, ...dados, email: "ana@" }, r);
    const fixed = inscricaoProgress({ ...empty, ...dados, email: "ana@email.com" }, r);
    expect(bad.percent).toBe(0);
    expect(fixed.percent).toBe(25);
  });
  it("'Revisar' aponta o primeiro pendente na ORDEM DAS ETAPAS (anexo vem depois das perguntas)", () => {
    const rq: InscricaoRules = {
      ...allRequired(),
      customQuestions: [{ id: "q1", label: "Cidade", required: true }],
    };
    const p = inscricaoProgress(
      { ...empty, ...dados, redesComHandle: 1, mensagem: "Oi", temAnexo: false, respostas: {} },
      rq,
    );
    expect(p.firstRequiredKey).toBe("q:q1");
    expect(inscricaoProgress(empty, rq).firstRequiredKey).toBe("nome");
  });
});

describe("inscricaoProgress — campos opcionais", () => {
  it("opcional vazio NÃO bloqueia o envio e a etapa só-opcional fica pendente (marcada 'opcional')", () => {
    const r = rules({
      redes: { visible: true, required: true },
      mensagem: { visible: true, required: false },
      midiaKit: { visible: true, required: false },
    });
    r.customQuestions = [];
    const p = inscricaoProgress({ ...empty, ...dados, redesComHandle: 1 }, r);
    expect(p.hasRequiredPending).toBe(false); // pode enviar
    expect(p.allDone).toBe(false);
    expect(p.doneCount).toBe(2);
    expect(progressCopy(p).missingText).toBe(
      "Faltam: Sua proposta (opcional) e Materiais (opcional)",
    );
    const filled = inscricaoProgress(
      { ...empty, ...dados, redesComHandle: 1, mensagem: "Oi", temAnexo: true },
      r,
    );
    expect(filled.allDone).toBe(true);
  });
  it("etapa com um obrigatório e outro opcional vazio fica concluída ao cumprir o obrigatório", () => {
    const r = rules({ mensagem: { visible: true, required: false } });
    r.customQuestions = [{ id: "q1", label: "Cidade", required: true }];
    const p = inscricaoProgress({ ...ok, redesComHandle: 1, respostas: { q1: "Rio" } }, r);
    expect(p.steps.find((s) => s.id === "proposta")?.done).toBe(true);
  });
  it("etapa oculta não existe nem conta", () => {
    const r = rules({
      redes: { visible: false, required: false },
      midiaKit: { visible: false, required: false },
    });
    const p = inscricaoProgress({ ...empty, ...dados, respostas: { q1: "Rio" } }, r);
    expect(p.steps.map((s) => s.id)).toEqual(["dados", "proposta"]);
    expect(p.total).toBe(2);
  });
  it("posição/scroll não entram na conta: mesma entrada, mesmo resultado", () => {
    const a = inscricaoProgress(empty, allRequired());
    const b = inscricaoProgress(empty, allRequired());
    expect(a.percent).toBe(b.percent);
  });
});

describe("joinPtBr", () => {
  it("formata a lista", () => {
    expect(joinPtBr(["A"])).toBe("A");
    expect(joinPtBr(["A", "B"])).toBe("A e B");
    expect(joinPtBr(["A", "B", "C"])).toBe("A, B e C");
  });
});
