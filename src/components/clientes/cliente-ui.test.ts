import { describe, expect, it } from "vitest";
import {
  clienteStatus,
  CLIENTE_STATUS_TRANSITIONS,
  buildClienteStatusChangePatch,
  defaultClienteStatusForOrigin,
  activeCampaignsBlockingClienteStatus,
  clienteRestoreTarget,
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
    expect(clienteStatus(baseCliente({ status: "negotiating" }))).toBe("negotiating");
  });

  it("cai pra 'active' quando não há status (cliente antigo sem backfill)", () => {
    expect(clienteStatus(baseCliente({ status: undefined }))).toBe("active");
  });
});

describe("CLIENTE_STATUS_TRANSITIONS", () => {
  it("negotiating pode ir para active, closed ou archived", () => {
    expect(CLIENTE_STATUS_TRANSITIONS.negotiating).toEqual(["active", "closed", "archived"]);
  });

  it("active pode ir para closed ou archived, nunca de volta pra negotiating", () => {
    expect(CLIENTE_STATUS_TRANSITIONS.active).toEqual(["closed", "archived"]);
  });

  it("closed pode reabrir (active) ou arquivar", () => {
    expect(CLIENTE_STATUS_TRANSITIONS.closed).toEqual(["active", "archived"]);
  });

  it("archived não tem transições diretas listadas (restauração é tratada à parte)", () => {
    expect(CLIENTE_STATUS_TRANSITIONS.archived).toEqual([]);
  });
});

describe("buildClienteStatusChangePatch", () => {
  it("grava status + statusChangedAt/By ao mudar de negotiating para active", () => {
    const cliente = baseCliente({ status: "negotiating" });
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

  it("importar do Comercial, lead não-ganho => default 'negotiating'", () => {
    expect(defaultClienteStatusForOrigin("crm-import", "NEGOCIACAO")).toBe("negotiating");
    expect(defaultClienteStatusForOrigin("crm-import", undefined)).toBe("negotiating");
  });

  it("importar do Comercial, lead já ganho (stage GANHO) => default 'active'", () => {
    expect(defaultClienteStatusForOrigin("crm-import", "GANHO")).toBe("active");
  });
});

describe("Fase 3 — histórico e bloqueio", () => {
  it("buildClienteStatusChangePatch anexa entrada de activity com observação", () => {
    const prev = { id: "a0", author: "X", action: "old", createdAt: "2026-01-01T00:00:00Z" };
    const cliente = baseCliente({ status: "negotiating", activity: [prev] });
    const patch = buildClienteStatusChangePatch(cliente, "active", "  fechou contrato  ");
    expect(patch.activity).toHaveLength(2);
    expect(patch.activity?.[0]).toBe(prev);
    const entry = patch.activity![1];
    expect(entry.action).toBe("alterou o status de Negociando para Ativo");
    expect(entry.reason).toBe("fechou contrato");
    expect(entry.author).toBeTruthy();
    expect(entry.createdAt).toBe(patch.statusChangedAt);
  });

  it("observação vazia não grava reason", () => {
    const patch = buildClienteStatusChangePatch(baseCliente(), "closed", "   ");
    expect(patch.activity?.[0].reason).toBeUndefined();
  });

  const statusOf = (c: { status?: string }) => c.status ?? "negotiation";
  const withCamps = baseCliente({
    campanhas: [
      { id: "k1", nome: "Ativa", status: "active" },
      { id: "k2", nome: "Neg", status: "negotiation" },
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
