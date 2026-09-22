import { describe, expect, it } from "vitest";
import type { Lead } from "./comercial";
import {
  OPPORTUNITY_STAGES,
  OPPORTUNITY_STAGE_LABEL,
  OPPORTUNITY_KANBAN_ORDER,
  legacyStage,
  deriveOpportunityNextStep,
  applyOpportunityAction,
  daysSinceLastStageChange,
  isOpportunityStale,
  OPPORTUNITY_STALE_DAYS,
} from "./comercial-engine";

function baseLead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: "l1",
    name: "Site institucional",
    value: 1000,
    stage: "LEAD_RECEBIDO",
    tags: [],
    activities: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    stageEnteredAt: Date.now(),
    ...overrides,
  };
}

describe("OPPORTUNITY_STAGES", () => {
  it("tem 9 etapas, PERDIDO fora da ordem principal do kanban", () => {
    expect(OPPORTUNITY_STAGES).toHaveLength(9);
    expect(OPPORTUNITY_KANBAN_ORDER).not.toContain("PERDIDO");
    expect(OPPORTUNITY_KANBAN_ORDER).toHaveLength(8);
  });

  it("toda etapa tem um label", () => {
    for (const s of OPPORTUNITY_STAGES) {
      expect(OPPORTUNITY_STAGE_LABEL[s]).toBeTruthy();
    }
  });
});

describe("legacyStage", () => {
  it("traduz os 6 valores antigos pro enum novo", () => {
    expect(legacyStage("lead")).toBe("LEAD_RECEBIDO");
    expect(legacyStage("contato")).toBe("CONTATO_FEITO");
    expect(legacyStage("proposta")).toBe("PROPOSTA_PREPARO");
    expect(legacyStage("negociacao")).toBe("NEGOCIACAO");
    expect(legacyStage("ganho")).toBe("GANHO");
    expect(legacyStage("perdido")).toBe("PERDIDO");
  });

  it("mantém um valor já novo sem alteração", () => {
    expect(legacyStage("REUNIAO_AGENDADA")).toBe("REUNIAO_AGENDADA");
  });

  it("cai em LEAD_RECEBIDO para valor desconhecido ou ausente", () => {
    expect(legacyStage("xyz")).toBe("LEAD_RECEBIDO");
    expect(legacyStage(undefined)).toBe("LEAD_RECEBIDO");
  });
});

describe("deriveOpportunityNextStep", () => {
  it("mapeia cada etapa aberta para a ação certa, com o ator certo", () => {
    expect(deriveOpportunityNextStep({ stage: "LEAD_RECEBIDO" })).toMatchObject({
      action: "registrar_contato",
      actor: "HYPE",
    });
    expect(deriveOpportunityNextStep({ stage: "CONTATO_FEITO" })).toMatchObject({
      action: "agendar_reuniao",
      actor: "HYPE",
    });
    expect(deriveOpportunityNextStep({ stage: "REUNIAO_AGENDADA" })).toMatchObject({
      action: "registrar_reuniao",
      actor: "HYPE",
    });
    expect(deriveOpportunityNextStep({ stage: "REUNIAO_REALIZADA" })).toMatchObject({
      action: "criar_proposta",
      actor: "HYPE",
    });
    expect(deriveOpportunityNextStep({ stage: "PROPOSTA_PREPARO" })).toMatchObject({
      action: "enviar_proposta",
      actor: "HYPE",
    });
    expect(deriveOpportunityNextStep({ stage: "NEGOCIACAO" })).toMatchObject({
      action: "registrar_negociacao",
      actor: "HYPE",
    });
  });

  it("PROPOSTA_ENVIADA aguarda o cliente — sem ação, sem ator HYPE", () => {
    const step = deriveOpportunityNextStep({ stage: "PROPOSTA_ENVIADA" });
    expect(step.action).toBeNull();
    expect(step.actor).toBe("CLIENTE");
  });

  it("GANHO e PERDIDO são terminais — sem ação, sem ator", () => {
    expect(deriveOpportunityNextStep({ stage: "GANHO" }).actor).toBeNull();
    expect(deriveOpportunityNextStep({ stage: "PERDIDO" }).actor).toBeNull();
  });
});

describe("applyOpportunityAction", () => {
  it("registrar_contato avança a etapa e grava histórico estruturado", () => {
    const lead = baseLead();
    const { patch, historyEntries } = applyOpportunityAction(lead, "registrar_contato", "Ana");
    expect(patch.stage).toBe("CONTATO_FEITO");
    expect(historyEntries).toHaveLength(1);
    expect(historyEntries[0]).toMatchObject({
      kind: "stage_change",
      fromStage: "LEAD_RECEBIDO",
      toStage: "CONTATO_FEITO",
    });
    expect(historyEntries[0].text).toContain("Ana");
  });

  it("criar_proposta sincroniza value com proposta.precoFinal", () => {
    const lead = baseLead({ stage: "REUNIAO_REALIZADA" });
    const proposta = {
      linhas: [],
      percentuais: { imposto: 0, comissao: 0, bonificacao: 0, margem: 0 },
      custoTotal: 100,
      precoFinal: 5000,
      calculadoEm: Date.now(),
    };
    const { patch } = applyOpportunityAction(lead, "criar_proposta", "Ana", { proposta });
    expect(patch.value).toBe(5000);
    expect(patch.stage).toBe("PROPOSTA_PREPARO");
    expect(patch.proposta).toBe(proposta);
  });

  it("criar_proposta com ajuste manual gera uma segunda entrada de histórico", () => {
    const lead = baseLead({ stage: "REUNIAO_REALIZADA" });
    const proposta = {
      linhas: [],
      percentuais: { imposto: 0, comissao: 0, bonificacao: 0, margem: 0 },
      custoTotal: 100,
      precoFinal: 6000,
      precoCalculado: 5000,
      ajustadoManualmente: true,
      calculadoEm: Date.now(),
    };
    const { historyEntries } = applyOpportunityAction(lead, "criar_proposta", "Ana", { proposta });
    expect(historyEntries).toHaveLength(2);
    expect(historyEntries[1].kind).toBe("value_change");
  });

  it("marcar_ganho grava value final e wonAt (nunca inventa se já não havia valor)", () => {
    const lead = baseLead({ stage: "NEGOCIACAO", value: 1000 });
    const before = Date.now();
    const { patch, historyEntries } = applyOpportunityAction(lead, "marcar_ganho", "Ana", {
      valorFinal: 1200,
    });
    expect(patch.stage).toBe("GANHO");
    expect(patch.value).toBe(1200);
    expect(patch.wonAt).toBeTruthy();
    expect(new Date(patch.wonAt!).getTime()).toBeGreaterThanOrEqual(before);
    expect(historyEntries[0].kind).toBe("won");
  });

  it("marcar_perdido grava lostAt e o motivo (sem motivo, ainda assim registra)", () => {
    const lead = baseLead({ stage: "NEGOCIACAO" });
    const { patch, historyEntries } = applyOpportunityAction(lead, "marcar_perdido", "Ana", {
      motivo: "Sem orçamento",
    });
    expect(patch.stage).toBe("PERDIDO");
    expect(patch.lossReason).toBe("Sem orçamento");
    expect(patch.lostAt).toBeTruthy();
    expect(historyEntries[0].kind).toBe("lost");

    const semMotivo = applyOpportunityAction(lead, "marcar_perdido", "Ana");
    expect(semMotivo.patch.lostAt).toBeTruthy();
    expect(semMotivo.historyEntries[0].text).not.toContain("motivo:");
  });

  it("alterar_etapa_manual registra de/para na mesma entrada de histórico", () => {
    const lead = baseLead({ stage: "PROPOSTA_ENVIADA" });
    const { patch, historyEntries } = applyOpportunityAction(lead, "alterar_etapa_manual", "Ana", {
      toStage: "NEGOCIACAO",
    });
    expect(patch.stage).toBe("NEGOCIACAO");
    expect(historyEntries[0]).toMatchObject({
      fromStage: "PROPOSTA_ENVIADA",
      toStage: "NEGOCIACAO",
    });
  });

  it("registrar_negociacao só atualiza value quando o novo valor difere do atual", () => {
    const lead = baseLead({ value: 1000, stage: "PROPOSTA_ENVIADA" });
    const semMudarValor = applyOpportunityAction(lead, "registrar_negociacao", "Ana", {
      novoValor: 1000,
    });
    expect(semMudarValor.patch.value).toBeUndefined();
    expect(semMudarValor.historyEntries).toHaveLength(1);

    const mudandoValor = applyOpportunityAction(lead, "registrar_negociacao", "Ana", {
      novoValor: 1500,
    });
    expect(mudandoValor.patch.value).toBe(1500);
    expect(mudandoValor.historyEntries).toHaveLength(2);
  });
});

describe('daysSinceLastStageChange / isOpportunityStale — definição única de "parado"', () => {
  const DAY = 24 * 60 * 60 * 1000;

  it("usa stageEnteredAt, não updatedAt cru", () => {
    const lead = baseLead({
      updatedAt: Date.now(), // editado agora (ex: só uma nota)...
      stageEnteredAt: Date.now() - 10 * DAY, // ...mas a etapa não muda há 10 dias
    });
    expect(daysSinceLastStageChange(lead)).toBeGreaterThanOrEqual(10);
  });

  it("objeto parcial sem stageEnteredAt (ex.: rascunho local) cai para updatedAt/history", () => {
    const lead = { updatedAt: Date.now() - 3 * DAY, history: [] } as unknown as Parameters<
      typeof daysSinceLastStageChange
    >[0];
    expect(daysSinceLastStageChange(lead)).toBeGreaterThanOrEqual(3);
  });

  it(`isOpportunityStale é true a partir de ${OPPORTUNITY_STALE_DAYS} dias sem mudar de etapa`, () => {
    const parado = baseLead({
      stage: "CONTATO_FEITO",
      stageEnteredAt: Date.now() - OPPORTUNITY_STALE_DAYS * DAY - 1000,
    });
    expect(isOpportunityStale(parado)).toBe(true);

    const recente = baseLead({
      stage: "CONTATO_FEITO",
      stageEnteredAt: Date.now() - 1 * DAY,
    });
    expect(isOpportunityStale(recente)).toBe(false);
  });

  it('nunca é "parado" em etapa terminal (GANHO/PERDIDO), mesmo há muito tempo sem mudar', () => {
    const ganhoAntigo = baseLead({
      stage: "GANHO",
      stageEnteredAt: Date.now() - 90 * DAY,
    });
    expect(isOpportunityStale(ganhoAntigo)).toBe(false);
  });
});
