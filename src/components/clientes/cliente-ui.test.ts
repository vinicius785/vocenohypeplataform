import { describe, expect, it } from "vitest";
import {
  clienteStatus,
  CLIENTE_STATUS_TRANSITIONS,
  buildClienteStatusChangePatch,
  defaultClienteStatusForOrigin,
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
