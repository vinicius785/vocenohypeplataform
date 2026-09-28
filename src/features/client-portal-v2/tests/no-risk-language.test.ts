import { describe, expect, it } from "vitest";
import { deriveAttentionItems, deriveCampaignSummaries, deriveRecentActivity } from "../lib/derive";
import type { ClienteLinkData } from "@/lib/portal-types";

// Busca ampla (não só substituição textual): serializa TODA a saída dos
// derivadores da V2 pra um dataset com prazo já estourado + pendências
// reais, e garante que nenhum rótulo de saúde/risco interna vaza — nem
// como texto solto, nem escondido num campo que algum componente possa
// vir a renderizar amanhã.
const FORBIDDEN_SUBSTRINGS = [
  "em risco",
  "at_risk",
  "risk_status",
  "health_status",
  "crítica",
  "crítico",
  "atrasad", // cobre "atrasado"/"atrasada"/"X dias atrasado"
  "fora do prazo",
  "com problemas",
  "desempenho ruim",
  "risco alto",
  "risco médio",
  "risco baixo",
  "problemática",
];

function dataWithOverdueDeadline(): ClienteLinkData {
  return {
    clienteNome: "Cliente Teste",
    artigos: [],
    campanhas: [
      {
        id: "c1",
        nome: "Campanha PoupaTempo RJ",
        // 10 dias no passado — o cenário que antes virava "Em risco".
        prazo: new Date(Date.now() - 10 * 86400000).toISOString(),
        planejado: 0,
        isRecorrente: false,
        influencers: [
          {
            id: "i1",
            nome: "Ana",
            status: "ENVIADO_AO_CLIENTE",
            statusCliente: "x",
            redes: [],
            entregas: [],
          },
          {
            id: "i2",
            nome: "Bruno",
            status: "ENVIADO_AO_CLIENTE",
            statusCliente: "x",
            redes: [],
            entregas: [],
          },
          {
            id: "i3",
            nome: "Carla",
            status: "ENVIADO_AO_CLIENTE",
            statusCliente: "x",
            redes: [],
            entregas: [],
          },
        ],
        cronograma: [],
        relatorios: [],
      },
    ],
  };
}

describe("Portal V2 — nenhuma linguagem de saúde/risco interna vaza pro cliente", () => {
  it("deriveCampaignSummaries: nenhum rótulo proibido, mesmo com prazo estourado e 3+ pendências", () => {
    const data = dataWithOverdueDeadline();
    const serialized = JSON.stringify(deriveCampaignSummaries(data)).toLowerCase();
    for (const forbidden of FORBIDDEN_SUBSTRINGS) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("deriveAttentionItems: dueLabel nunca usa 'Atrasado' — mostra a data real no passado", () => {
    const data = dataWithOverdueDeadline();
    const items = deriveAttentionItems(data);
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      expect(item.dueLabel?.toLowerCase()).not.toContain("atrasad");
      // Fica factual: mostra a data real do prazo passado.
      expect(item.dueLabel).toMatch(/Prazo era em \d{2}\/\d{2}\/\d{4}/);
    }
    const serialized = JSON.stringify(items).toLowerCase();
    for (const forbidden of FORBIDDEN_SUBSTRINGS) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("deriveRecentActivity: nenhum rótulo proibido no dataset com prazo estourado", () => {
    const data = dataWithOverdueDeadline();
    const serialized = JSON.stringify(deriveRecentActivity(data)).toLowerCase();
    for (const forbidden of FORBIDDEN_SUBSTRINGS) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});
