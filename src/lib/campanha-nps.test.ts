import { describe, expect, it } from "vitest";
import type { Campaign } from "@/components/VincularCampanhaDialog";
import {
  campanhasAtivasSemDataInicio,
  campanhasComNpsPendente,
  isUuid,
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

describe("fuso de Brasília (reference_month / dataInicio)", () => {
  it("referenceMonthOf usa Brasília, não UTC (virada do mês)", () => {
    // 01/11 01:00 UTC = 31/10 22:00 em Brasília → ainda outubro
    expect(referenceMonthOf(new Date("2026-11-01T01:00:00Z"))).toBe("2026-10");
    // 01/11 03:30 UTC = 01/11 00:30 em Brasília → novembro
    expect(referenceMonthOf(new Date("2026-11-01T03:30:00Z"))).toBe("2026-11");
  });

  it("dataInicio = hoje em Brasília é elegível mesmo se em UTC já for amanhã", () => {
    const now = new Date("2026-10-16T01:00:00Z"); // 15/10 22:00 BRT
    expect(isCampanhaElegivelParaNps(baseCampanha({ dataInicio: "2026-10-15" }), now)).toBe(true);
    expect(isCampanhaElegivelParaNps(baseCampanha({ dataInicio: "2026-10-16" }), now)).toBe(false);
  });
});

describe("campanhasAtivasSemDataInicio / isUuid", () => {
  it("lista só campanhas ativas sem dataInicio válida", () => {
    const list = campanhasAtivasSemDataInicio([
      baseCampanha({ id: "a", dataInicio: undefined }),
      baseCampanha({ id: "b", dataInicio: "lixo" }),
      baseCampanha({ id: "c" }),
      baseCampanha({ id: "d", dataInicio: undefined, status: "planning" }),
    ]);
    expect(list.map((c) => c.id)).toEqual(["a", "b"]);
  });

  it("isUuid valida formato", () => {
    expect(isUuid("c7b5f3bf-5692-4c31-b691-99e4ced39c52")).toBe(true);
    expect(isUuid("camp1")).toBe(false);
  });
});
