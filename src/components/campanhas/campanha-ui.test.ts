import { describe, expect, it } from "vitest";
import {
  campanhaStatus,
  CAMPANHA_STATUS_TRANSITIONS,
  ARCHIVE_ACTION,
  restoreConfirmMessage,
  buildStatusChangePatch,
  filterCampanhas,
  DEFAULT_CAMPANHA_FILTERS,
  type CampanhaRow,
} from "./campanha-ui";
import type { Campaign } from "@/components/VincularCampanhaDialog";

/**
 * Reconstrução do modelo de status de campanhas: status NUNCA é derivado
 * de data/progresso/pendência — é sempre um campo persistido explícito,
 * com só 4 valores possíveis (negotiation/active/completed/archived).
 */

function baseCampaign(overrides: Partial<Campaign> = {}): Campaign {
  return {
    id: "c1",
    nome: "Campanha teste",
    briefing: "",
    prazo: "2026-01-01",
    linhas: [],
    valorCliente: "",
    orcamento: "",
    pagTipos: [],
    pagConfig: { Valor: {}, "Por Hora": {}, Comissão: {}, Permuta: {}, Outro: {} },
    prazoPag: "",
    ...overrides,
  };
}

describe("campanhaStatus", () => {
  it("lê o campo status persistido diretamente — nunca deriva de prazo/progresso", () => {
    expect(campanhaStatus(baseCampaign({ status: "active", prazo: "2020-01-01" }))).toBe("active");
  });

  it("cai pra 'negotiation' quando não há status (campanha antiga sem backfill)", () => {
    expect(campanhaStatus(baseCampaign({ status: undefined }))).toBe("negotiation");
  });

  it("prazo vencido NÃO muda o status — regra central do pedido", () => {
    const c = baseCampaign({ status: "active", prazo: "2000-01-01" });
    expect(campanhaStatus(c)).toBe("active");
  });

  it("prazo futuro NÃO muda o status sozinho", () => {
    const c = baseCampaign({ status: "negotiation", prazo: "2099-01-01" });
    expect(campanhaStatus(c)).toBe("negotiation");
  });
});

describe("CAMPANHA_STATUS_TRANSITIONS", () => {
  it("negotiation só permite ir pra active, sem confirmação", () => {
    expect(CAMPANHA_STATUS_TRANSITIONS.negotiation).toEqual([
      { to: "active", actionLabel: "Iniciar campanha", needsConfirm: false },
    ]);
  });

  it("active só permite concluir, com confirmação", () => {
    const [t] = CAMPANHA_STATUS_TRANSITIONS.active;
    expect(t.to).toBe("completed");
    expect(t.needsConfirm).toBe(true);
    expect(t.confirmMessage).toMatch(/deixará de aparecer entre as campanhas ativas/);
  });

  it("completed só permite reabrir, com confirmação", () => {
    const [t] = CAMPANHA_STATUS_TRANSITIONS.completed;
    expect(t.to).toBe("active");
    expect(t.needsConfirm).toBe(true);
    expect(t.confirmMessage).toMatch(/retornará aos indicadores operacionais/);
  });

  it("archived não tem transições regulares (restaurar é tratado à parte)", () => {
    expect(CAMPANHA_STATUS_TRANSITIONS.archived).toEqual([]);
  });
});

describe("ARCHIVE_ACTION / restoreConfirmMessage", () => {
  it("mensagem de arquivar não fala em apagar dados", () => {
    expect(ARCHIVE_ACTION.confirmMessage).toMatch(/nenhum dado será apagado/);
  });

  it("mensagem de restaurar informa o status de destino", () => {
    expect(restoreConfirmMessage("active")).toContain("Ativa");
    expect(restoreConfirmMessage("negotiation")).toContain("Negociação");
  });
});

describe("buildStatusChangePatch", () => {
  it("registra o histórico com o texto exato pedido", () => {
    const c = baseCampaign({ status: "negotiation" });
    const patch = buildStatusChangePatch(c, "active");
    expect(patch.status).toBe("active");
    expect(patch.activity).toHaveLength(1);
    expect(patch.activity![0].action).toBe("alterou o status de Negociação para Ativa");
  });

  it("arquivar grava archivedAt/By e o status anterior pra restaurar depois", () => {
    const c = baseCampaign({ status: "active" });
    const patch = buildStatusChangePatch(c, "archived");
    expect(patch.archivedAt).toBeDefined();
    expect(patch.archivedBy).toBeDefined();
    expect(patch.statusBeforeArchive).toBe("active");
  });

  it("sair de archived limpa statusBeforeArchive", () => {
    const c = baseCampaign({ status: "archived", statusBeforeArchive: "active" });
    const patch = buildStatusChangePatch(c, "completed");
    expect(patch.statusBeforeArchive).toBeUndefined();
  });

  it("acumula atividades anteriores em vez de substituir", () => {
    const c = baseCampaign({
      status: "negotiation",
      activity: [
        { id: "a1", author: "Ana", action: "criou a campanha", createdAt: "2026-01-01T00:00:00Z" },
      ],
    });
    const patch = buildStatusChangePatch(c, "active");
    expect(patch.activity).toHaveLength(2);
    expect(patch.activity![0].id).toBe("a1");
  });
});

describe("filterCampanhas — filtro de status", () => {
  const row = (status: Campaign["status"]): CampanhaRow => ({
    cliente: { id: "cl1", empresa: "Cliente 1" },
    campanha: baseCampaign({ id: `c-${status}`, status }),
  });
  const rows = [row("negotiation"), row("active"), row("completed"), row("archived")];
  const influsByCampanha = new Map<string, { nome: string }[]>();

  it("'todos' (sem filtro) inclui todos os status quando aplicado diretamente por filterCampanhas", () => {
    // O filtro "nunca mostrar arquivada em Todos" é aplicado por quem
    // chama (`CampanhasSection.tsx`), não por `filterCampanhas` em si —
    // esta função só aplica o filtro EXPLÍCITO de `filters.status`.
    const result = filterCampanhas(rows, "", DEFAULT_CAMPANHA_FILTERS, influsByCampanha);
    expect(result).toHaveLength(4);
  });

  it("filtra por um status específico", () => {
    const result = filterCampanhas(
      rows,
      "",
      { ...DEFAULT_CAMPANHA_FILTERS, status: "archived" },
      influsByCampanha,
    );
    expect(result).toHaveLength(1);
    expect(result[0].campanha.status).toBe("archived");
  });
});
