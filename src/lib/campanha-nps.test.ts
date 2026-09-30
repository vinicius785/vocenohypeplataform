import { describe, expect, it } from "vitest";
import type { Campaign } from "@/components/VincularCampanhaDialog";
import {
  campanhasComNpsPendente,
  currentReferenceMonth,
  isCampanhaElegivelParaNps,
  mapCampanhaNpsRow,
  referenceMonthOf,
  type CampanhaNpsRow,
} from "./campanha-nps";

function baseCampanha(overrides: Partial<Campaign> = {}): Campaign {
  return {
    id: "camp1",
    nome: "Campanha Nike",
    briefing: "",
    prazo: "2026-12-31",
    linhas: [],
    valorCliente: "",
    orcamento: "",
    pagTipos: [],
    pagConfig: {
      Valor: {},
      "Por Hora": {},
      Comissão: {},
      Permuta: {},
      Outro: {},
    } as Campaign["pagConfig"],
    prazoPag: "",
    status: "active",
    dataInicio: "2026-01-01",
    ...overrides,
  };
}

function baseRow(overrides: Partial<CampanhaNpsRow> = {}): CampanhaNpsRow {
  return {
    id: "n1",
    cliente_id: "cl1",
    campanha_id: "camp1",
    reference_month: "2026-10",
    score: 9,
    comment: null,
    answered_by: "user1",
    answered_at: "2026-10-01T00:00:00Z",
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-01T00:00:00Z",
    ...overrides,
  };
}

describe("referenceMonthOf / currentReferenceMonth", () => {
  it("formata YYYY-MM com mês em 2 dígitos", () => {
    expect(referenceMonthOf(new Date("2026-01-15T12:00:00Z"))).toBe("2026-01");
    expect(referenceMonthOf(new Date("2026-10-31T23:00:00Z"))).toBe("2026-10");
  });

  it("currentReferenceMonth usa a data corrente por padrão", () => {
    expect(currentReferenceMonth(new Date("2026-11-05T00:00:00Z"))).toBe("2026-11");
  });
});

describe("mapCampanhaNpsRow", () => {
  it("mapeia snake_case para camelCase preservando null", () => {
    const n = mapCampanhaNpsRow(baseRow({ comment: null, answered_by: null }));
    expect(n.comment).toBeNull();
    expect(n.answeredBy).toBeNull();
    expect(n.campanhaId).toBe("camp1");
    expect(n.referenceMonth).toBe("2026-10");
  });
});

describe("isCampanhaElegivelParaNps", () => {
  const now = new Date("2026-10-15T12:00:00Z");

  it("elegível quando ativa e já iniciada", () => {
    expect(isCampanhaElegivelParaNps(baseCampanha(), now)).toBe(true);
  });

  it("não elegível quando ainda não começou (dataInicio no futuro)", () => {
    expect(isCampanhaElegivelParaNps(baseCampanha({ dataInicio: "2026-11-01" }), now)).toBe(false);
  });

  it("não elegível sem dataInicio", () => {
    expect(isCampanhaElegivelParaNps(baseCampanha({ dataInicio: undefined }), now)).toBe(false);
  });

  it("não elegível fora do status ativo (planning/completed/archived)", () => {
    expect(isCampanhaElegivelParaNps(baseCampanha({ status: "planning" }), now)).toBe(false);
    expect(isCampanhaElegivelParaNps(baseCampanha({ status: "completed" }), now)).toBe(false);
    expect(isCampanhaElegivelParaNps(baseCampanha({ status: "archived" }), now)).toBe(false);
  });

  it("elegível quando dataInicio é hoje mesmo", () => {
    expect(isCampanhaElegivelParaNps(baseCampanha({ dataInicio: "2026-10-15" }), now)).toBe(true);
  });
});

describe("campanhasComNpsPendente", () => {
  const now = new Date("2026-10-15T12:00:00Z");

  it("retorna campanhas elegíveis sem resposta no mês corrente", () => {
    const campanhas = [baseCampanha({ id: "camp1" }), baseCampanha({ id: "camp2" })];
    const pendentes = campanhasComNpsPendente(campanhas, [], "2026-10", now);
    expect(pendentes.map((c) => c.id)).toEqual(["camp1", "camp2"]);
  });

  it("exclui campanha já respondida no mês corrente — por campanha, nunca por usuário", () => {
    const campanhas = [baseCampanha({ id: "camp1" }), baseCampanha({ id: "camp2" })];
    const respondidas = [mapCampanhaNpsRow(baseRow({ campanha_id: "camp1", answered_by: "joao" }))];
    const pendentes = campanhasComNpsPendente(campanhas, respondidas, "2026-10", now);
    // Não importa quem respondeu (joao) — a campanha inteira conta como
    // resolvida pra qualquer usuário do cliente.
    expect(pendentes.map((c) => c.id)).toEqual(["camp2"]);
  });

  it("resposta de um mês anterior não cobre o mês corrente (nunca reaproveita)", () => {
    const campanhas = [baseCampanha({ id: "camp1" })];
    const respondidas = [
      mapCampanhaNpsRow(baseRow({ campanha_id: "camp1", reference_month: "2026-09" })),
    ];
    const pendentes = campanhasComNpsPendente(campanhas, respondidas, "2026-10", now);
    expect(pendentes.map((c) => c.id)).toEqual(["camp1"]);
  });

  it("campanha não elegível nunca aparece como pendente", () => {
    const campanhas = [baseCampanha({ id: "camp1", status: "planning" })];
    const pendentes = campanhasComNpsPendente(campanhas, [], "2026-10", now);
    expect(pendentes).toEqual([]);
  });
});
