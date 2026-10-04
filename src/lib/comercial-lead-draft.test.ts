import { describe, expect, it } from "vitest";
import type { Lead } from "@/lib/comercial";
import { draftToLead, leadToDraft, parseMoney } from "./comercial-lead-draft";

const saved: Lead = {
  id: "11111111-1111-1111-1111-111111111111",
  name: "Website Acme",
  company: "Acme",
  contact: "Ana",
  email: "ana@acme.com",
  phone: "(11) 99999-0000",
  value: 45000,
  stage: "PROPOSTA_ENVIADA",
  tags: ["quente"],
  source: "Indicação",
  responsible: "Rodrigo",
  notes: "Quer fechar em outubro",
  activities: [{ id: "a1", type: "nota", text: "x", createdAt: 1 }],
  history: [{ id: "h1", type: "stage", text: "Etapa", createdAt: 2, kind: "stage_change" }],
  createdAt: 100,
  updatedAt: 200,
  stageEnteredAt: 150,
  lastContactAt: 180,
  nextActionAt: 500,
  nextActionDescription: "Ligar",
  expectedCloseAt: "2026-10-30",
  probability: 60,
  clienteId: "c1",
  projectId: "p1",
  wonAt: "2026-10-01T00:00:00Z",
  // Extras que o formulário NÃO edita, mas que o servidor devolve:
  propostaPublicToken: "tok123",
  lossReason: "Sem orçamento",
  giftType: "kit",
  language: "pt",
  aiSummary: "resumo",
  contactCompany: "Acme SA",
  contactPhone: "11 3333-0000",
  contactEmail: "fin@acme.com",
  contactRole: "Financeiro",
  score: 4,
};

describe("draftToLead — salvamento de campo (lead existente)", () => {
  it("preserva tudo que o formulário não edita (o autosave grava `extra` inteiro)", () => {
    const draft = { ...leadToDraft(saved), notes: "  Nova observação  " };
    const out = draftToLead(draft, saved, () => "novo", 999);
    expect(out.notes).toBe("Nova observação");
    // regressão: antes isto era descartado em qualquer autosave
    expect(out.propostaPublicToken).toBe("tok123");
    expect(out.lossReason).toBe("Sem orçamento");
    expect(out.giftType).toBe("kit");
    expect(out.language).toBe("pt");
    expect(out.aiSummary).toBe("resumo");
    expect(out.contactCompany).toBe("Acme SA");
    expect(out.contactPhone).toBe("11 3333-0000");
    expect(out.contactEmail).toBe("fin@acme.com");
    expect(out.contactRole).toBe("Financeiro");
    expect(out.nextActionDescription).toBe("Ligar");
    // campos do servidor/motor intactos
    expect(out).toMatchObject({
      id: saved.id,
      stage: "PROPOSTA_ENVIADA",
      tags: ["quente"],
      activities: saved.activities,
      history: saved.history,
      createdAt: 100,
      stageEnteredAt: 150,
      lastContactAt: 180,
      nextActionAt: 500,
      expectedCloseAt: "2026-10-30",
      probability: 60,
      clienteId: "c1",
      projectId: "p1",
      wonAt: "2026-10-01T00:00:00Z",
    });
    expect(out.updatedAt).toBe(999);
  });

  it("a etapa nunca vem do formulário quando o lead já existe", () => {
    const draft = { ...leadToDraft(saved), stage: "GANHO" as const };
    expect(draftToLead(draft, saved, () => "x").stage).toBe("PROPOSTA_ENVIADA");
  });

  it("campos limpos viram `undefined` e o valor é lido do texto", () => {
    const draft = { ...leadToDraft(saved), company: "  ", value: "1500,5", budget: "" };
    const out = draftToLead(draft, saved, () => "x");
    expect(out.company).toBeUndefined();
    expect(out.budget).toBeUndefined();
    expect(out.value).toBe(1500.5);
  });
});

describe("draftToLead — criação", () => {
  it("usa a etapa do rascunho, gera id e carimbos", () => {
    const draft = { ...leadToDraft(null, "CONTATO_FEITO"), name: " Novo ", value: "3000" };
    const out = draftToLead(draft, null, () => "abc12345", 777);
    expect(out).toMatchObject({
      id: "abc12345",
      name: "Novo",
      stage: "CONTATO_FEITO",
      value: 3000,
      tags: [],
      activities: [],
      createdAt: 777,
      updatedAt: 777,
      stageEnteredAt: 777,
    });
  });
});

describe("parseMoney", () => {
  it("segue a regra existente (texto limpo → Number, vazio/inválido → 0)", () => {
    expect(parseMoney("")).toBe(0);
    expect(parseMoney("abc")).toBe(0);
    expect(parseMoney("1500")).toBe(1500);
    expect(parseMoney("1500,5")).toBe(1500.5);
    expect(parseMoney("R$ 2000")).toBe(2000);
    // Comportamento EXISTENTE (documentado, não alterado): com separador de
    // milhar em pt-BR o texto limpo vira "1.500.50" → NaN → 0.
    expect(parseMoney("1.500,50")).toBe(0);
  });
});

describe("leadToDraft", () => {
  it("espelha o lead; etapa legada é traduzida", () => {
    const d = leadToDraft({ ...saved, stage: "contato" });
    expect(d.stage).toBe("CONTATO_FEITO");
    expect(d.value).toBe("45000");
    expect(d.proposta).toBeUndefined();
  });
});
