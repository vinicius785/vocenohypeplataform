import { describe, expect, it } from "vitest";
import type { Lead } from "./comercial";
import { OPPORTUNITY_KANBAN_ORDER } from "./comercial-engine";
import {
  computeComercialKpis,
  groupPipelineByStage,
  groupByResponsible,
  groupByOrigin,
  lossReasonBreakdown,
  leadsNeedingActionToday,
  leadsAtRisk,
  leadsClosestToClosing,
  bucketActivities,
  rangeForComercialPeriod,
  computeComercialPriorities,
  type DateRange,
} from "./comercial-metrics";

const DAY = 24 * 60 * 60 * 1000;

function lead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: overrides.id ?? Math.random().toString(36).slice(2),
    name: "Oportunidade",
    value: 1000,
    stage: "LEAD_RECEBIDO",
    tags: [],
    activities: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

const fullRange: DateRange = { from: "1970-01-01T00:00:00.000Z", to: "9999-01-01T00:00:00.000Z" };

describe("computeComercialKpis — nunca inventa dado que não existe", () => {
  it("pipelineTotal soma só oportunidades ABERTAS (exclui ganho/perdido), forecastPonderado é sempre null", () => {
    const leads = [
      lead({ value: 100 }),
      lead({ value: 200 }),
      lead({ stage: "GANHO", value: 9999 }),
      lead({ stage: "PERDIDO", value: 9999 }),
    ];
    const kpis = computeComercialKpis(leads, fullRange);
    expect(kpis.pipelineTotal).toBe(300);
    expect(kpis.forecastPonderado).toBeNull();
  });

  it("valorGanhoNoPeriodo só soma leads GANHO com wonAt dentro do range", () => {
    const dentro = lead({ stage: "GANHO", value: 500, wonAt: new Date().toISOString() });
    const foraDoPeriodo = lead({
      stage: "GANHO",
      value: 999,
      wonAt: new Date(Date.now() - 400 * DAY).toISOString(),
    });
    const semWonAt = lead({ stage: "GANHO", value: 777 });
    const range = rangeForComercialPeriod("mes");
    const kpis = computeComercialKpis([dentro, foraDoPeriodo, semWonAt], range);
    expect(kpis.valorGanhoNoPeriodo).toBe(500);
    expect(kpis.negociosGanhosNoPeriodo).toBe(1);
    expect(kpis.ganhosSemDataRegistrada).toBe(1);
  });

  it("oportunidadesSemProximaAcao conta PROPOSTA_ENVIADA sem reunião futura, mas não quando há reunião futura agendada", () => {
    const leads = [
      lead({ id: "sem-acao", stage: "PROPOSTA_ENVIADA" }),
      lead({ stage: "LEAD_RECEBIDO" }),
      lead({ stage: "NEGOCIACAO" }),
      lead({
        id: "com-reuniao-futura",
        stage: "PROPOSTA_ENVIADA",
        nextMeeting: new Date(Date.now() + DAY).toISOString(),
      }),
    ];
    expect(computeComercialKpis(leads, fullRange).oportunidadesSemProximaAcao).toBe(1);
  });

  it("atividadesVencidas conta só nextMeeting já passado em oportunidades ainda abertas", () => {
    const vencida = lead({ nextMeeting: new Date(Date.now() - DAY).toISOString() });
    const futura = lead({ nextMeeting: new Date(Date.now() + DAY).toISOString() });
    const semReuniao = lead({});
    const ganhaComReuniaoVencida = lead({
      stage: "GANHO",
      nextMeeting: new Date(Date.now() - DAY).toISOString(),
    });
    const kpis = computeComercialKpis(
      [vencida, futura, semReuniao, ganhaComReuniaoVencida],
      fullRange,
    );
    expect(kpis.atividadesVencidas).toBe(1);
  });

  it("oportunidadesAbertas exclui GANHO e PERDIDO", () => {
    const leads = [
      lead({ stage: "GANHO" }),
      lead({ stage: "PERDIDO" }),
      lead({ stage: "NEGOCIACAO" }),
    ];
    expect(computeComercialKpis(leads, fullRange).oportunidadesAbertas).toBe(1);
  });
});

describe("groupPipelineByStage", () => {
  it("cobre todas as etapas do kanban, mesmo as sem lead nenhum (count 0, não ausente)", () => {
    const buckets = groupPipelineByStage(
      [lead({ stage: "LEAD_RECEBIDO" })],
      OPPORTUNITY_KANBAN_ORDER,
    );
    expect(buckets).toHaveLength(OPPORTUNITY_KANBAN_ORDER.length);
    const vazio = buckets.find((b) => b.stage === "NEGOCIACAO");
    expect(vazio?.count).toBe(0);
  });
});

describe("groupByResponsible / groupByOrigin — ausência vira bucket explícito", () => {
  it('leads sem responsible caem em "(sem responsável)", nunca descartados', () => {
    const leads = [lead({ responsible: "Ana", value: 100 }), lead({ value: 50 })];
    const buckets = groupByResponsible(leads);
    const total = buckets.reduce((s, b) => s + b.count, 0);
    expect(total).toBe(2);
    expect(buckets.some((b) => b.name === "(sem responsável)")).toBe(true);
  });

  it("mesma regra para origem", () => {
    const buckets = groupByOrigin([lead({ source: "Indicação" }), lead({})]);
    expect(buckets.some((b) => b.name === "(sem origem)")).toBe(true);
  });
});

describe("lossReasonBreakdown", () => {
  it("agrupa só leads PERDIDO, por texto exato do motivo", () => {
    const leads = [
      lead({ stage: "PERDIDO", lossReason: "Sem orçamento" }),
      lead({ stage: "PERDIDO", lossReason: "Sem orçamento" }),
      lead({ stage: "PERDIDO" }),
      lead({ stage: "GANHO", lossReason: "não deveria contar" }),
    ];
    const buckets = lossReasonBreakdown(leads);
    expect(buckets.find((b) => b.reason === "Sem orçamento")?.count).toBe(2);
    expect(buckets.find((b) => b.reason === "(sem motivo registrado)")?.count).toBe(1);
    expect(buckets.reduce((s, b) => s + b.count, 0)).toBe(3);
  });
});

describe("leadsNeedingActionToday / leadsAtRisk / leadsClosestToClosing", () => {
  it("leadsNeedingActionToday só traz leads com ator HYPE, mais parados primeiro", () => {
    const antigo = lead({
      id: "antigo",
      stage: "LEAD_RECEBIDO",
      history: [{ id: "h", type: "stage", text: "x", createdAt: Date.now() - 20 * DAY }],
    });
    const recente = lead({
      id: "recente",
      stage: "LEAD_RECEBIDO",
      history: [{ id: "h", type: "stage", text: "x", createdAt: Date.now() - 1 * DAY }],
    });
    const aguardandoCliente = lead({ id: "cliente", stage: "PROPOSTA_ENVIADA" });
    const result = leadsNeedingActionToday([recente, aguardandoCliente, antigo]);
    expect(result.map((l) => l.id)).toEqual(["antigo", "recente"]);
  });

  it("leadsAtRisk inclui parados e reuniões vencidas, exclui terminais", () => {
    const parado = lead({
      id: "parado",
      stage: "CONTATO_FEITO",
      history: [{ id: "h", type: "stage", text: "x", createdAt: Date.now() - 10 * DAY }],
    });
    const reuniaoVencida = lead({
      id: "reuniao",
      stage: "REUNIAO_AGENDADA",
      nextMeeting: new Date(Date.now() - DAY).toISOString(),
    });
    const ganhoAntigo = lead({
      id: "ganho",
      stage: "GANHO",
      history: [{ id: "h", type: "stage", text: "x", createdAt: Date.now() - 90 * DAY }],
    });
    const ok = lead({ id: "ok", stage: "LEAD_RECEBIDO" });
    const result = leadsAtRisk([parado, reuniaoVencida, ganhoAntigo, ok]);
    const ids = result.map((l) => l.id);
    expect(ids).toContain("parado");
    expect(ids).toContain("reuniao");
    expect(ids).not.toContain("ganho");
    expect(ids).not.toContain("ok");
  });

  it("leadsClosestToClosing só NEGOCIACAO/PROPOSTA_ENVIADA, maior valor primeiro", () => {
    const a = lead({ id: "a", stage: "NEGOCIACAO", value: 500 });
    const b = lead({ id: "b", stage: "PROPOSTA_ENVIADA", value: 5000 });
    const c = lead({ id: "c", stage: "LEAD_RECEBIDO", value: 9999 });
    const result = leadsClosestToClosing([a, b, c]);
    expect(result.map((l) => l.id)).toEqual(["b", "a"]);
  });
});

describe("computeComercialPriorities — lista única, sem duplicar oportunidade, ordenada por gravidade", () => {
  it("classifica cada motivo de gravidade corretamente", () => {
    const vencida = lead({
      id: "vencida",
      stage: "REUNIAO_AGENDADA",
      nextMeeting: new Date(Date.now() - 3 * DAY).toISOString(),
    });
    const semAcao = lead({ id: "sem-acao", stage: "PROPOSTA_ENVIADA" });
    const parada = lead({
      id: "parada",
      stage: "CONTATO_FEITO",
      history: [{ id: "h", type: "stage", text: "x", createdAt: Date.now() - 8 * DAY }],
    });
    const hoje = lead({
      id: "hoje",
      stage: "REUNIAO_AGENDADA",
      nextMeeting: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    });
    const proximos = lead({
      id: "proximos",
      stage: "REUNIAO_AGENDADA",
      nextMeeting: new Date(Date.now() + 3 * DAY).toISOString(),
    });
    const semProblema = lead({ id: "ok", stage: "LEAD_RECEBIDO" });
    const ganho = lead({ id: "ganho", stage: "GANHO" });

    const items = computeComercialPriorities([
      vencida,
      semAcao,
      parada,
      hoje,
      proximos,
      semProblema,
      ganho,
    ]);
    const byId = new Map(items.map((i) => [i.lead.id, i.reason]));
    expect(byId.get("vencida")).toBe("acao_vencida");
    expect(byId.get("sem-acao")).toBe("sem_proxima_acao");
    expect(byId.get("parada")).toBe("parada");
    expect(byId.get("hoje")).toBe("hoje");
    expect(byId.get("proximos")).toBe("proximos_dias");
    expect(byId.has("ok")).toBe(false);
    expect(byId.has("ganho")).toBe(false);
  });

  it("nunca lista a mesma oportunidade duas vezes, mesmo com vários problemas simultâneos", () => {
    // Vencida (nextMeeting no passado) E, se não fosse a reunião, também
    // seria "parada" (sem mudar de etapa há muitos dias) — deve aparecer
    // só uma vez, com o motivo de maior gravidade (ação vencida).
    const multiProblema = lead({
      id: "multi",
      stage: "REUNIAO_AGENDADA",
      nextMeeting: new Date(Date.now() - 10 * DAY).toISOString(),
      history: [{ id: "h", type: "stage", text: "x", createdAt: Date.now() - 30 * DAY }],
    });
    const items = computeComercialPriorities([multiProblema]);
    expect(items).toHaveLength(1);
    expect(items[0].reason).toBe("acao_vencida");
  });

  it("ordena primeiro por gravidade, depois pelo maior atraso/inatividade dentro do mesmo motivo", () => {
    const vencidaPouco = lead({
      id: "vencida-pouco",
      stage: "REUNIAO_AGENDADA",
      nextMeeting: new Date(Date.now() - 1 * DAY).toISOString(),
    });
    const vencidaMuito = lead({
      id: "vencida-muito",
      stage: "REUNIAO_AGENDADA",
      nextMeeting: new Date(Date.now() - 9 * DAY).toISOString(),
    });
    const parada = lead({
      id: "parada",
      stage: "CONTATO_FEITO",
      history: [{ id: "h", type: "stage", text: "x", createdAt: Date.now() - 8 * DAY }],
    });
    const items = computeComercialPriorities([parada, vencidaPouco, vencidaMuito]);
    expect(items.map((i) => i.lead.id)).toEqual(["vencida-muito", "vencida-pouco", "parada"]);
  });

  it("estado vazio: nenhuma prioridade quando não há oportunidade com problema", () => {
    const ok1 = lead({ id: "ok1", stage: "LEAD_RECEBIDO" });
    const ok2 = lead({ id: "ok2", stage: "NEGOCIACAO" });
    expect(computeComercialPriorities([ok1, ok2])).toEqual([]);
  });
});

describe("bucketActivities", () => {
  it("classifica por data da próxima reunião (atrasada/hoje/próxima) e desfechos em concluídas", () => {
    const now = new Date("2026-06-15T12:00:00.000Z");
    const atrasada = lead({ id: "atrasada", nextMeeting: "2026-06-10T10:00:00.000Z" });
    const hoje = lead({ id: "hoje", nextMeeting: "2026-06-15T18:00:00.000Z" });
    const proxima = lead({ id: "proxima", nextMeeting: "2026-06-20T10:00:00.000Z" });
    const ganha = lead({ id: "ganha", stage: "GANHO" });
    const semReuniaoComAcao = lead({ id: "com-acao", stage: "LEAD_RECEBIDO" });
    const semReuniaoAguardandoCliente = lead({ id: "aguardando", stage: "PROPOSTA_ENVIADA" });

    const buckets = bucketActivities(
      [atrasada, hoje, proxima, ganha, semReuniaoComAcao, semReuniaoAguardandoCliente],
      now,
    );
    expect(buckets.atrasadas.map((l) => l.id)).toEqual(["atrasada"]);
    expect(buckets.hoje.map((l) => l.id)).toEqual(["hoje"]);
    expect(buckets.proximas.map((l) => l.id)).toEqual(
      expect.arrayContaining(["proxima", "com-acao"]),
    );
    expect(buckets.concluidas.map((l) => l.id)).toEqual(["ganha"]);
    expect(buckets.proximas.map((l) => l.id)).not.toContain("aguardando");
  });
});
