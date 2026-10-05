import { describe, expect, it } from "vitest";
import {
  clienteStatus,
  CLIENTE_STATUS_TRANSITIONS,
  buildClienteStatusChangePatch,
  defaultClienteStatusForOrigin,
  suggestClienteStatusFromLeadStage,
  activeCampaignsBlockingClienteStatus,
  clienteRestoreTarget,
  DEFAULT_CLIENTE_FILTERS,
  filterClientes,
  matchesClienteStatusFilter,
  countClientesByStatusFilter,
  countActiveClienteFilters,
  lastClienteActivityAt,
  campanhaCreatedActivityEntry,
  findPossibleDuplicateCliente,
} from "./cliente-ui";
import type { Cliente } from "@/lib/clientes-store";

/**
 * Fase 2 da reconstrução do modelo de status de cliente: máquina de
 * transições e patch de auditoria, análogos aos de campanha
 * (`campanha-ui.test.ts`), mas sem `actionLabel`/`confirmMessage` (isso só
 * existe pra campanha hoje — dialog de mudança de status de cliente com
 * essas ações de UI é Fase 3).
 */

function baseCliente(overrides: Partial<Cliente> = {}): Cliente {
  return {
    id: "cl1",
    empresa: "Empresa Teste",
    responsavel: "",
    responsavelInterno: "",
    email: "",
    whatsapp: "",
    clienteDesde: "2026-01-01",
    ...overrides,
  };
}

describe("clienteStatus", () => {
  it("lê o campo status persistido diretamente", () => {
    expect(clienteStatus(baseCliente({ status: "capture" }))).toBe("capture");
  });

  it("cai pra 'active' quando não há status (cliente antigo sem backfill)", () => {
    expect(clienteStatus(baseCliente({ status: undefined }))).toBe("active");
  });
});

describe("CLIENTE_STATUS_TRANSITIONS", () => {
  it("capture pode ir para active ou archived, nunca direto para closed", () => {
    expect(CLIENTE_STATUS_TRANSITIONS.capture).toEqual(["active", "archived"]);
    expect(CLIENTE_STATUS_TRANSITIONS.capture).not.toContain("closed");
  });

  it("active só pode encerrar (nunca arquivar direto nem voltar pra capture)", () => {
    expect(CLIENTE_STATUS_TRANSITIONS.active).toEqual(["closed"]);
  });

  it("closed pode reabrir (active) ou arquivar", () => {
    expect(CLIENTE_STATUS_TRANSITIONS.closed).toEqual(["active", "archived"]);
  });

  it("archived pode voltar pra captação ou ser ativado direto", () => {
    expect(CLIENTE_STATUS_TRANSITIONS.archived).toEqual(["capture", "active"]);
  });
});

describe("buildClienteStatusChangePatch", () => {
  it("grava status + statusChangedAt/By ao mudar de capture para active", () => {
    const cliente = baseCliente({ status: "capture" });
    const patch = buildClienteStatusChangePatch(cliente, "active");
    expect(patch.status).toBe("active");
    expect(typeof patch.statusChangedAt).toBe("string");
    expect(typeof patch.statusChangedBy).toBe("string");
    expect(patch.archivedAt).toBeUndefined();
  });

  it("ao arquivar, grava archivedAt/By e statusBeforeArchive com o status anterior", () => {
    const cliente = baseCliente({ status: "active" });
    const patch = buildClienteStatusChangePatch(cliente, "archived");
    expect(patch.status).toBe("archived");
    expect(patch.statusBeforeArchive).toBe("active");
    expect(typeof patch.archivedAt).toBe("string");
    expect(typeof patch.archivedBy).toBe("string");
  });

  it("ao restaurar de archived, limpa statusBeforeArchive", () => {
    const cliente = baseCliente({ status: "archived", statusBeforeArchive: "active" });
    const patch = buildClienteStatusChangePatch(cliente, "active");
    expect(patch.status).toBe("active");
    expect(patch.statusBeforeArchive).toBeUndefined();
  });
});

describe("defaultClienteStatusForOrigin", () => {
  it("criar do zero => default 'active'", () => {
    expect(defaultClienteStatusForOrigin("scratch")).toBe("active");
  });

  it("importar do Comercial, lead não-ganho => default 'capture'", () => {
    expect(defaultClienteStatusForOrigin("crm-import", "NEGOCIACAO")).toBe("capture");
    expect(defaultClienteStatusForOrigin("crm-import", undefined)).toBe("capture");
  });

  it("importar do Comercial, lead já ganho (stage GANHO) => default 'active'", () => {
    expect(defaultClienteStatusForOrigin("crm-import", "GANHO")).toBe("active");
  });
});

describe("suggestClienteStatusFromLeadStage (Fase 5)", () => {
  it.each([
    ["CONTATO_FEITO", "capture"],
    ["REUNIAO_AGENDADA", "capture"],
    ["PROPOSTA_PREPARO", "capture"],
    ["PROPOSTA_ENVIADA", "capture"],
    ["NEGOCIACAO", "capture"],
    ["GANHO", "active"],
    ["PERDIDO", "not-recommended"],
  ])("%s => %s", (stage, expected) => {
    expect(suggestClienteStatusFromLeadStage(stage)).toBe(expected);
  });

  it("valores legados e etapas fora da tabela", () => {
    expect(suggestClienteStatusFromLeadStage("ganho")).toBe("active");
    expect(suggestClienteStatusFromLeadStage("perdido")).toBe("not-recommended");
    expect(suggestClienteStatusFromLeadStage("REUNIAO_REALIZADA")).toBe("capture");
    expect(suggestClienteStatusFromLeadStage(undefined)).toBe("capture");
  });

  it("wizard: lead perdido pré-seleciona 'closed'", () => {
    expect(defaultClienteStatusForOrigin("crm-import", "PERDIDO")).toBe("closed");
  });
});

describe("Fase 3 — histórico e bloqueio", () => {
  it("buildClienteStatusChangePatch anexa entrada de activity com observação", () => {
    const prev = { id: "a0", author: "X", action: "old", createdAt: "2026-01-01T00:00:00Z" };
    const cliente = baseCliente({ status: "capture", activity: [prev] });
    const patch = buildClienteStatusChangePatch(cliente, "active", "  fechou contrato  ");
    expect(patch.activity).toHaveLength(2);
    expect(patch.activity?.[0]).toBe(prev);
    const entry = patch.activity![1];
    expect(entry.action).toBe("alterou o status de Captação para Ativo");
    expect(entry.reason).toBe("fechou contrato");
    expect(entry.author).toBeTruthy();
    expect(entry.createdAt).toBe(patch.statusChangedAt);
  });

  it("observação vazia não grava reason", () => {
    const patch = buildClienteStatusChangePatch(baseCliente(), "closed", "   ");
    expect(patch.activity?.[0].reason).toBeUndefined();
  });

  const statusOf = (c: { status?: string }) => c.status ?? "planning";
  const withCamps = baseCliente({
    campanhas: [
      { id: "k1", nome: "Ativa", status: "active" },
      { id: "k2", nome: "Neg", status: "planning" },
    ] as unknown as Cliente["campanhas"],
  });

  it("activeCampaignsBlockingClienteStatus lista só campanhas ativas ao encerrar/arquivar", () => {
    expect(
      activeCampaignsBlockingClienteStatus(withCamps, "closed", statusOf).map((c) => c.id),
    ).toEqual(["k1"]);
    expect(activeCampaignsBlockingClienteStatus(withCamps, "archived", statusOf)).toHaveLength(1);
  });

  it("não bloqueia para destinos que não são encerrar/arquivar", () => {
    expect(activeCampaignsBlockingClienteStatus(withCamps, "active", statusOf)).toEqual([]);
    expect(activeCampaignsBlockingClienteStatus(baseCliente(), "closed", statusOf)).toEqual([]);
  });

  it("clienteRestoreTarget usa statusBeforeArchive, com fallback active", () => {
    expect(clienteRestoreTarget(baseCliente({ statusBeforeArchive: "closed" }))).toBe("closed");
    expect(clienteRestoreTarget(baseCliente())).toBe("active");
  });
});

describe("Fase 4 — filtro por status", () => {
  const mk = (id: string, status?: Cliente["status"], extra: Partial<Cliente> = {}) =>
    ({ id, empresa: id, responsavel: "", responsavelInterno: "", status, ...extra }) as Cliente;
  const list = [
    mk("n", "capture"),
    mk("a", "active"),
    mk("legacy"),
    mk("c", "closed"),
    mk("x", "archived"),
  ];

  it("default 'operacao' mostra só captação e ativos (sem encerrados nem arquivados)", () => {
    expect(DEFAULT_CLIENTE_FILTERS.status).toBe("operacao");
    const ids = filterClientes(list, "", DEFAULT_CLIENTE_FILTERS).map((c) => c.id);
    expect(ids).toEqual(["n", "a", "legacy"]);
  });

  it("encerrados e arquivados só com filtro explícito", () => {
    const closed = filterClientes(list, "", { ...DEFAULT_CLIENTE_FILTERS, status: "closed" });
    expect(closed.map((c) => c.id)).toEqual(["c"]);
    const ids = filterClientes(list, "", { ...DEFAULT_CLIENTE_FILTERS, status: "archived" });
    expect(ids.map((c) => c.id)).toEqual(["x"]);
    expect(matchesClienteStatusFilter(list[2], "active")).toBe(true);
  });

  it("contagens por status", () => {
    expect(countClientesByStatusFilter(list)).toEqual({
      operacao: 3,
      capture: 1,
      active: 2,
      closed: 1,
      archived: 1,
    });
    expect(countActiveClienteFilters({ ...DEFAULT_CLIENTE_FILTERS, status: "closed" })).toBe(1);
    expect(countActiveClienteFilters(DEFAULT_CLIENTE_FILTERS)).toBe(0);
  });

  it("última atividade usa a entrada mais recente, ou null", () => {
    expect(lastClienteActivityAt(mk("z"))).toBeNull();
    const c = mk("z", "active", {
      activity: [
        { id: "1", author: "a", action: "x", createdAt: "2026-01-02T00:00:00Z" },
        { id: "2", author: "a", action: "y", createdAt: "2026-03-01T00:00:00Z" },
      ],
    });
    expect(lastClienteActivityAt(c)).toBe("2026-03-01T00:00:00Z");
  });
});

describe("campanhaCreatedActivityEntry", () => {
  it("monta uma entrada de atividade com o nome da campanha", () => {
    const entry = campanhaCreatedActivityEntry("Lançamento de verão");
    expect(entry.action).toBe('criou a campanha "Lançamento de verão"');
    expect(entry.author).toBeTruthy();
    expect(entry.id).toBeTruthy();
    expect(entry.createdAt).toBeTruthy();
  });

  it("usa um rótulo neutro pra campanha sem nome", () => {
    const entry = campanhaCreatedActivityEntry("");
    expect(entry.action).toBe('criou a campanha "sem nome"');
  });
});

describe("findPossibleDuplicateCliente", () => {
  function mkCliente(overrides: Partial<Cliente> = {}): Cliente {
    return {
      id: "existing",
      empresa: "Acme Corp",
      responsavel: "",
      responsavelInterno: "",
      email: "contato@acme.com",
      whatsapp: "(11) 91234-5678",
      ...overrides,
    } as Cliente;
  }

  it("detecta empresa idêntica, tolerante a acento/caixa", () => {
    const list = [mkCliente({ empresa: "Açme Corp" })];
    const match = findPossibleDuplicateCliente(list, { empresa: "ACME CORP" });
    expect(match?.reason).toBe("empresa");
  });

  it("detecta e-mail idêntico mesmo com empresa diferente", () => {
    const list = [mkCliente()];
    const match = findPossibleDuplicateCliente(list, {
      empresa: "Outra Empresa Ltda",
      email: "CONTATO@acme.com",
    });
    expect(match?.reason).toBe("email");
  });

  it("detecta telefone igual mesmo com formatação diferente", () => {
    const list = [mkCliente({ whatsapp: "(11) 91234-5678" })];
    const match = findPossibleDuplicateCliente(list, {
      empresa: "Nome Totalmente Diferente",
      whatsapp: "+55 11 91234-5678",
    });
    expect(match?.reason).toBe("telefone");
  });

  it("nunca casa dois telefones vazios", () => {
    const list = [mkCliente({ whatsapp: "" })];
    const match = findPossibleDuplicateCliente(list, { empresa: "Nome Diferente", whatsapp: "" });
    expect(match).toBeNull();
  });

  it("detecta nome parecido (um é prefixo do outro)", () => {
    const list = [mkCliente({ empresa: "Acme" })];
    const match = findPossibleDuplicateCliente(list, {
      empresa: "Acme Corporação Brasil",
      email: "outro@email.com",
    });
    expect(match?.reason).toBe("nome_parecido");
  });

  it("não alerta pra nomes curtos genéricos", () => {
    const list = [mkCliente({ empresa: "Abc" })];
    const match = findPossibleDuplicateCliente(list, { empresa: "Abcd" });
    expect(match).toBeNull();
  });

  it("retorna null sem nenhum sinal de duplicidade", () => {
    const list = [mkCliente()];
    const match = findPossibleDuplicateCliente(list, {
      empresa: "Empresa Totalmente Nova",
      email: "nova@empresa.com",
      whatsapp: "(21) 90000-0000",
    });
    expect(match).toBeNull();
  });

  it("retorna null com lista vazia", () => {
    expect(findPossibleDuplicateCliente([], { empresa: "Qualquer" })).toBeNull();
  });
});
