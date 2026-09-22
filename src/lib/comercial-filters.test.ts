import { describe, expect, it } from "vitest";
import {
  parseLeadFiltersSafe,
  countActiveLeadFilters,
  nullsFirstForLeadSort,
  latestContactActivityIso,
  nextLastContactAt,
  listLeadsInputSchema,
  EMPTY_LEAD_FILTERS,
} from "./comercial-filters";

describe("parseLeadFiltersSafe — nunca lança erro por URL inválida/compartilhada", () => {
  it("objeto vazio vira filtros vazios", () => {
    expect(parseLeadFiltersSafe({})).toEqual(EMPTY_LEAD_FILTERS);
  });

  it("lixo completamente arbitrário cai no fallback seguro, não lança", () => {
    expect(() => parseLeadFiltersSafe({ stages: ["ETAPA_INVENTADA"], foo: "bar" })).not.toThrow();
    expect(parseLeadFiltersSafe({ stages: ["ETAPA_INVENTADA"] })).toEqual(EMPTY_LEAD_FILTERS);
  });

  it("valores válidos são preservados", () => {
    const parsed = parseLeadFiltersSafe({
      responsibles: ["Vinícius"],
      stages: ["CONTATO_FEITO"],
      minValue: 1000,
    });
    expect(parsed.responsibles).toEqual(["Vinícius"]);
    expect(parsed.stages).toEqual(["CONTATO_FEITO"]);
    expect(parsed.minValue).toBe(1000);
  });
});

describe("listLeadsInputSchema — allowlist de campo/direção de ordenação", () => {
  it("aceita um campo de ordenação válido", () => {
    const parsed = listLeadsInputSchema.parse({ sort: "value", direction: "desc" });
    expect(parsed.sort).toBe("value");
    expect(parsed.direction).toBe("desc");
  });

  it("rejeita campo de ordenação arbitrário vindo da URL (nunca SQL livre)", () => {
    expect(() =>
      listLeadsInputSchema.parse({ sort: "extra->>'anything'; DROP TABLE leads;--" }),
    ).toThrow();
  });

  it("rejeita direção arbitrária", () => {
    expect(() => listLeadsInputSchema.parse({ sort: "value", direction: "sideways" })).toThrow();
  });

  it("sem input nenhum, usa o padrão documentado (próxima ação, mais próxima primeiro)", () => {
    const parsed = listLeadsInputSchema.parse({});
    expect(parsed.sort).toBe("next_action_at");
    expect(parsed.direction).toBe("asc");
  });
});

describe("countActiveLeadFilters", () => {
  it("zero filtros aplicados = 0", () => {
    expect(countActiveLeadFilters(EMPTY_LEAD_FILTERS)).toBe(0);
  });

  it("conta cada grupo preenchido uma vez, mais um por atalho de atividade", () => {
    const count = countActiveLeadFilters({
      ...EMPTY_LEAD_FILTERS,
      responsibles: ["Ana", "Lucas"],
      stages: ["CONTATO_FEITO"],
      activity: ["nunca_contatado", "acao_vencida"],
      minValue: 100,
    });
    // responsibles(1) + stages(1) + activity(2) + minValue(1) = 5
    expect(count).toBe(5);
  });
});

describe("nullsFirstForLeadSort — regras de nulo por campo/direção", () => {
  it('"sem contato há mais tempo" (last_contact_at ASC) traz nunca-contatado PRIMEIRO', () => {
    expect(nullsFirstForLeadSort("last_contact_at", "asc")).toBe(true);
  });

  it("last_contact_at DESC não força nulos primeiro", () => {
    expect(nullsFirstForLeadSort("last_contact_at", "desc")).toBe(false);
  });

  it("próxima ação: sem ação sempre por último, nas duas direções", () => {
    expect(nullsFirstForLeadSort("next_action_at", "asc")).toBe(false);
    expect(nullsFirstForLeadSort("next_action_at", "desc")).toBe(false);
  });

  it("valor: sem valor sempre por último, nas duas direções", () => {
    expect(nullsFirstForLeadSort("value", "asc")).toBe(false);
    expect(nullsFirstForLeadSort("value", "desc")).toBe(false);
  });

  it("fechamento previsto: sem previsão sempre por último", () => {
    expect(nullsFirstForLeadSort("expected_close_at", "asc")).toBe(false);
    expect(nullsFirstForLeadSort("expected_close_at", "desc")).toBe(false);
  });
});

describe("latestContactActivityIso — só conta interação comercial real", () => {
  it("ignora nota/tarefa, considera só ligação/e-mail/reunião", () => {
    const iso = latestContactActivityIso([
      { type: "nota", createdAt: Date.now() },
      { type: "tarefa", createdAt: Date.now() },
      { type: "ligacao", createdAt: 1000 },
    ]);
    expect(iso).toBe(new Date(1000).toISOString());
  });

  it("nenhuma atividade de contato real → null", () => {
    expect(latestContactActivityIso([{ type: "nota", createdAt: Date.now() }])).toBeNull();
    expect(latestContactActivityIso([])).toBeNull();
    expect(latestContactActivityIso(undefined)).toBeNull();
  });

  it("pega a mais recente entre várias", () => {
    const iso = latestContactActivityIso([
      { type: "email", createdAt: 1000 },
      { type: "reuniao", createdAt: 5000 },
      { type: "ligacao", createdAt: 3000 },
    ]);
    expect(iso).toBe(new Date(5000).toISOString());
  });
});

describe("nextLastContactAt — GREATEST, nunca retrocede", () => {
  it("sem candidato novo, mantém o anterior", () => {
    const prev = new Date(5000).toISOString();
    expect(nextLastContactAt(prev, null)).toBe(prev);
  });

  it("sem anterior, usa o candidato", () => {
    const candidate = new Date(5000).toISOString();
    expect(nextLastContactAt(null, candidate)).toBe(candidate);
  });

  it("candidato mais antigo que o anterior não retrocede", () => {
    const prev = new Date(9000).toISOString();
    const candidate = new Date(1000).toISOString();
    expect(nextLastContactAt(prev, candidate)).toBe(prev);
  });

  it("candidato mais novo avança", () => {
    const prev = new Date(1000).toISOString();
    const candidate = new Date(9000).toISOString();
    expect(nextLastContactAt(prev, candidate)).toBe(candidate);
  });
});
