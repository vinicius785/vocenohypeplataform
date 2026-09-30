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
  campanhaActivationChecklist,
  campanhaFinancialState,
} from "./campanha-ui";
import type { Campaign } from "@/components/VincularCampanhaDialog";

/**
 * Reconstrução do modelo de status de campanhas: status NUNCA é derivado
 * de data/progresso/pendência — é sempre um campo persistido explícito,
 * com só 4 valores possíveis (planning/active/completed/archived).
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

  it("cai pra 'planning' quando não há status (campanha antiga sem backfill)", () => {
    expect(campanhaStatus(baseCampaign({ status: undefined }))).toBe("planning");
  });

  it("prazo vencido NÃO muda o status — regra central do pedido", () => {
    const c = baseCampaign({ status: "active", prazo: "2000-01-01" });
    expect(campanhaStatus(c)).toBe("active");
  });

  it("prazo futuro NÃO muda o status sozinho", () => {
    const c = baseCampaign({ status: "planning", prazo: "2099-01-01" });
    expect(campanhaStatus(c)).toBe("planning");
  });
});

describe("CAMPANHA_STATUS_TRANSITIONS", () => {
  it("planning só permite ir pra active, sem confirmação", () => {
    expect(CAMPANHA_STATUS_TRANSITIONS.planning).toEqual([
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
    expect(restoreConfirmMessage("planning")).toContain("Planejamento");
  });
});

describe("buildStatusChangePatch", () => {
  it("registra o histórico com o texto exato pedido", () => {
    const c = baseCampaign({ status: "planning" });
    const patch = buildStatusChangePatch(c, "active");
    expect(patch.status).toBe("active");
    expect(patch.activity).toHaveLength(1);
    expect(patch.activity![0].action).toBe("alterou o status de Planejamento para Ativa");
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
      status: "planning",
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
  const rows = [row("planning"), row("active"), row("completed"), row("archived")];
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

describe("campanhaActivationChecklist", () => {
  const byKey = (c: Campaign) =>
    Object.fromEntries(campanhaActivationChecklist(c).map((i) => [i.key, i.ok]));

  it("marca pendências numa campanha vazia", () => {
    const r = byKey(baseCampaign({ prazo: "" }));
    expect(r).toEqual({
      briefing: false,
      valor: false,
      pagamento: false,
      prazo: false,
      influs: false,
    });
  });

  it("marca itens preenchidos", () => {
    const r = byKey(
      baseCampaign({
        briefing: "x",
        valorCliente: "1000",
        pagClienteTipo: "unica" as Campaign["pagClienteTipo"],
        linhas: [{ id: "l", tipo: "", tamanho: "", quantidade: 1, enviar: 1 }],
      }),
    );
    expect(Object.values(r).every(Boolean)).toBe(true);
  });

  it("semFaturamento dispensa valor e pagamento", () => {
    const r = byKey(baseCampaign({ semFaturamento: true }));
    expect(r.valor).toBe(true);
    expect(r.pagamento).toBe(true);
  });
});

describe("campanhaFinancialState", () => {
  it("sem_faturamento tem prioridade sobre qualquer outro sinal", () => {
    const c = baseCampaign({ status: "active", valorCliente: "1000", semFaturamento: true });
    expect(campanhaFinancialState(c, false)).toBe("sem_faturamento");
  });

  it("nao_configurado quando não há valor preenchido", () => {
    const c = baseCampaign({ status: "active", valorCliente: "" });
    expect(campanhaFinancialState(c, false)).toBe("nao_configurado");
  });

  it("estimado quando a campanha está em planejamento, mesmo com valor", () => {
    const c = baseCampaign({ status: "planning", valorCliente: "1000" });
    expect(campanhaFinancialState(c, false)).toBe("estimado");
  });

  it("estimado quando o cliente ainda está em captação, mesmo com campanha ativa", () => {
    const c = baseCampaign({ status: "active", valorCliente: "1000" });
    expect(campanhaFinancialState(c, true)).toBe("estimado");
  });

  it("confirmado só quando campanha ativa/concluída E cliente fora de captação", () => {
    const c = baseCampaign({ status: "active", valorCliente: "1000" });
    expect(campanhaFinancialState(c, false)).toBe("confirmado");
  });

  it("nunca retorna 'confirmado' pra valor vazio, mesmo campanha ativa e cliente fora de captação", () => {
    const c = baseCampaign({ status: "active", valorCliente: "" });
    expect(campanhaFinancialState(c, false)).not.toBe("confirmado");
  });
});
