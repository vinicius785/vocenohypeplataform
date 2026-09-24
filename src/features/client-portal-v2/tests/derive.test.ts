import { describe, expect, it } from "vitest";
import {
  deriveAttentionItems,
  deriveCampaignSummaries,
  deriveContentItems,
  deriveRecentActivity,
} from "../lib/derive";
import type { ClienteLinkData } from "@/lib/portal-types";

function baseData(): ClienteLinkData {
  return { clienteNome: "Cliente Teste", campanhas: [], artigos: [] };
}

describe("deriveAttentionItems — um item individual por pessoa/conteúdo, nunca um agregado genérico", () => {
  it("sem pendências, não gera nenhum item", () => {
    const data: ClienteLinkData = {
      ...baseData(),
      campanhas: [
        {
          id: "c1",
          nome: "Campanha A",
          planejado: 0,
          influencers: [],
          cronograma: [],
          relatorios: [],
          isRecorrente: false,
        },
      ],
    };
    expect(deriveAttentionItems(data)).toEqual([]);
  });

  it("gera um item individual por influenciador pendente, nunca um agregado por campanha", () => {
    const data: ClienteLinkData = {
      ...baseData(),
      campanhas: [
        {
          id: "c1",
          nome: "Campanha A",
          prazo: new Date(Date.now() + 5 * 86400000).toISOString(),
          planejado: 0,
          influencers: [
            {
              id: "i1",
              nome: "A",
              status: "ENVIADO_AO_CLIENTE",
              statusCliente: "x",
              redes: [],
              entregas: [],
            },
            {
              id: "i2",
              nome: "B",
              status: "ENVIADO_AO_CLIENTE",
              statusCliente: "x",
              redes: [],
              entregas: [],
            },
          ],
          cronograma: [],
          relatorios: [],
          isRecorrente: false,
        },
      ],
    };
    const items = deriveAttentionItems(data);
    const influItems = items.filter((i) => i.kind === "influencer_review");
    expect(influItems).toHaveLength(2);
    expect(influItems.map((i) => i.description)).toEqual([
      "Perfil de A aguarda sua avaliação",
      "Perfil de B aguarda sua avaliação",
    ]);
    expect(influItems.every((i) => i.count === 1)).toBe(true);
    expect(influItems[0].href).toBe("/portal-v2/campanhas/c1?influenciador=i1");
    expect(influItems[1].href).toBe("/portal-v2/campanhas/c1?influenciador=i2");
  });

  it("nunca gera pendência genérica de 'briefing personalizado' — influenciador aprovado sem entregas não vira item algum", () => {
    const data: ClienteLinkData = {
      ...baseData(),
      campanhas: [
        {
          id: "c1",
          nome: "Campanha A",
          planejado: 0,
          influencers: [
            {
              id: "i1",
              nome: "A",
              status: "APROVADO",
              statusCliente: "x",
              redes: [],
              entregas: [],
            },
          ],
          cronograma: [],
          relatorios: [],
          isRecorrente: false,
        },
      ],
    };
    expect(deriveAttentionItems(data)).toEqual([]);
  });

  it("nunca considera 'aguardando a equipe'/'em produção' como pendência do cliente", () => {
    const data: ClienteLinkData = {
      ...baseData(),
      campanhas: [
        {
          id: "c1",
          nome: "Campanha A",
          planejado: 0,
          influencers: [
            {
              id: "i1",
              nome: "A",
              status: "APROVADO",
              statusCliente: "x",
              redes: [],
              entregas: [
                {
                  id: "e1",
                  tipo: "reel",
                  quantidade: 1,
                  status: "combinado",
                  stage: "PRODUCAO",
                  statusCliente: "Em produção",
                },
              ],
            },
          ],
          cronograma: [],
          relatorios: [],
          isRecorrente: false,
        },
      ],
    };
    expect(deriveAttentionItems(data)).toEqual([]);
  });

  it("nunca mistura pendências de campanhas diferentes no mesmo item (isolamento por campanha)", () => {
    const data: ClienteLinkData = {
      ...baseData(),
      campanhas: [
        {
          id: "c1",
          nome: "Campanha A",
          planejado: 0,
          influencers: [
            {
              id: "i1",
              nome: "A",
              status: "ENVIADO_AO_CLIENTE",
              statusCliente: "x",
              redes: [],
              entregas: [],
            },
          ],
          cronograma: [],
          relatorios: [],
          isRecorrente: false,
        },
        {
          id: "c2",
          nome: "Campanha B",
          planejado: 0,
          influencers: [
            {
              id: "i2",
              nome: "B",
              status: "ENVIADO_AO_CLIENTE",
              statusCliente: "x",
              redes: [],
              entregas: [],
            },
          ],
          cronograma: [],
          relatorios: [],
          isRecorrente: false,
        },
      ],
    };
    const items = deriveAttentionItems(data).filter((i) => i.kind === "influencer_review");
    expect(items).toHaveLength(2);
    expect(items.find((i) => i.campanhaId === "c1")?.count).toBe(1);
    expect(items.find((i) => i.campanhaId === "c2")?.count).toBe(1);
  });

  it("prazo hoje/amanhã sobe a prioridade pra alta", () => {
    const data: ClienteLinkData = {
      ...baseData(),
      campanhas: [
        {
          id: "c1",
          nome: "Campanha A",
          prazo: new Date().toISOString(),
          planejado: 0,
          influencers: [
            {
              id: "i1",
              nome: "A",
              status: "ENVIADO_AO_CLIENTE",
              statusCliente: "x",
              redes: [],
              entregas: [],
            },
          ],
          cronograma: [],
          relatorios: [],
          isRecorrente: false,
        },
      ],
    };
    const items = deriveAttentionItems(data).filter((i) => i.kind === "influencer_review");
    expect(items[0].priority).toBe("high");
  });

  it("campanha recorrente: indica o mês no rótulo e preserva a competência no link (nunca ambíguo)", () => {
    const data: ClienteLinkData = {
      ...baseData(),
      campanhas: [
        {
          id: "c1",
          nome: "PoupaTempo RJ",
          planejado: 0,
          isRecorrente: true,
          cycles: [{ id: "cycle-set", competenceYear: 2026, competenceMonth: 9, status: "active" }],
          influencers: [
            {
              id: "i1",
              nome: "Aline Peixoto",
              status: "ENVIADO_AO_CLIENTE",
              statusCliente: "x",
              redes: [],
              entregas: [],
              campaignCycleId: "cycle-set",
            },
          ],
          cronograma: [],
          relatorios: [],
        },
      ],
    };
    const [item] = deriveAttentionItems(data);
    expect(item.campanhaNome).toBe("PoupaTempo RJ · Setembro de 2026");
    expect(item.href).toBe("/portal-v2/campanhas/c1?influenciador=i1&competencia=2026-09");
  });
});

describe("deriveCampaignSummaries", () => {
  it("calcula progresso a partir de entregas publicadas/planejadas", () => {
    const data: ClienteLinkData = {
      ...baseData(),
      campanhas: [
        {
          id: "c1",
          nome: "Campanha A",
          planejado: 0,
          influencers: [
            {
              id: "i1",
              nome: "A",
              status: "APROVADO",
              statusCliente: "x",
              redes: [],
              entregas: [
                {
                  id: "e1",
                  tipo: "reel",
                  quantidade: 1,
                  status: "combinado",
                  stage: "PUBLICADA",
                  statusCliente: "Publicado",
                },
                {
                  id: "e2",
                  tipo: "reel",
                  quantidade: 1,
                  status: "combinado",
                  stage: "PRODUCAO",
                  statusCliente: "Em produção",
                },
              ],
            },
          ],
          cronograma: [],
          relatorios: [],
          isRecorrente: false,
        },
      ],
    };
    const [summary] = deriveCampaignSummaries(data);
    expect(summary.contentPlanned).toBe(2);
    expect(summary.contentPublished).toBe(1);
    expect(summary.progressPercent).toBe(50);
    expect(summary.influencersApproved).toBe(1);
  });

  it("campanha sem influenciadores/entregas não quebra e fica em 'Planejamento'", () => {
    const data: ClienteLinkData = {
      ...baseData(),
      campanhas: [
        {
          id: "c1",
          nome: "Campanha vazia",
          planejado: 0,
          influencers: [],
          cronograma: [],
          relatorios: [],
          isRecorrente: false,
        },
      ],
    };
    const [summary] = deriveCampaignSummaries(data);
    expect(summary.stageLabel).toBe("Planejamento");
    expect(summary.progressPercent).toBe(0);
  });
});

describe("deriveRecentActivity", () => {
  it("ordena do mais recente pro mais antigo e respeita o limite", () => {
    const data: ClienteLinkData = {
      ...baseData(),
      campanhas: [
        {
          id: "c1",
          nome: "Campanha A",
          planejado: 0,
          influencers: [
            {
              id: "i1",
              nome: "A",
              status: "APROVADO",
              statusCliente: "x",
              redes: [],
              entregas: [],
              activityEvents: [
                {
                  id: "ev1",
                  kind: "perfil_aprovado",
                  actorType: "cliente",
                  actorName: "Cliente",
                  createdAt: "2026-01-01T00:00:00.000Z",
                },
                {
                  id: "ev2",
                  kind: "perfil_reaberto",
                  actorType: "equipe",
                  actorName: "Equipe",
                  createdAt: "2026-02-01T00:00:00.000Z",
                },
              ],
            },
          ],
          cronograma: [],
          relatorios: [],
          isRecorrente: false,
        },
      ],
    };
    const entries = deriveRecentActivity(data, 1);
    expect(entries).toHaveLength(1);
    expect(entries[0].id).toBe("ev2");
  });

  it("agrupa eventos do mesmo tipo, mesma campanha e mesmo dia num único resumo com contagem", () => {
    const data: ClienteLinkData = {
      ...baseData(),
      campanhas: [
        {
          id: "c1",
          nome: "Campanha A",
          planejado: 0,
          influencers: [
            {
              id: "i1",
              nome: "A",
              status: "APROVADO",
              statusCliente: "x",
              redes: [],
              entregas: [],
              activityEvents: [
                {
                  id: "ev1",
                  kind: "perfil_aprovado",
                  actorType: "cliente",
                  actorName: "Cliente",
                  createdAt: "2026-01-01T10:00:00.000Z",
                },
              ],
            },
            {
              id: "i2",
              nome: "B",
              status: "APROVADO",
              statusCliente: "x",
              redes: [],
              entregas: [],
              activityEvents: [
                {
                  id: "ev2",
                  kind: "perfil_aprovado",
                  actorType: "cliente",
                  actorName: "Cliente",
                  createdAt: "2026-01-01T14:00:00.000Z",
                },
              ],
            },
            {
              id: "i3",
              nome: "C",
              status: "APROVADO",
              statusCliente: "x",
              redes: [],
              entregas: [],
              activityEvents: [
                {
                  id: "ev3",
                  kind: "perfil_aprovado",
                  actorType: "cliente",
                  actorName: "Cliente",
                  createdAt: "2026-01-01T18:00:00.000Z",
                },
              ],
            },
          ],
          cronograma: [],
          relatorios: [],
          isRecorrente: false,
        },
      ],
    };
    const entries = deriveRecentActivity(data, 10);
    expect(entries).toHaveLength(1);
    expect(entries[0].count).toBe(3);
    expect(entries[0].label).toBe("3 perfis foram aprovados");
  });

  it("nunca agrupa aprovação com recusa, mesmo na mesma campanha e no mesmo dia", () => {
    const data: ClienteLinkData = {
      ...baseData(),
      campanhas: [
        {
          id: "c1",
          nome: "Campanha A",
          planejado: 0,
          influencers: [
            {
              id: "i1",
              nome: "A",
              status: "APROVADO",
              statusCliente: "x",
              redes: [],
              entregas: [],
              activityEvents: [
                {
                  id: "ev1",
                  kind: "perfil_aprovado",
                  actorType: "cliente",
                  actorName: "Cliente",
                  createdAt: "2026-01-01T10:00:00.000Z",
                },
              ],
            },
            {
              id: "i2",
              nome: "B",
              status: "RECUSADO",
              statusCliente: "x",
              redes: [],
              entregas: [],
              activityEvents: [
                {
                  id: "ev2",
                  kind: "perfil_recusado",
                  actorType: "cliente",
                  actorName: "Cliente",
                  createdAt: "2026-01-01T14:00:00.000Z",
                },
              ],
            },
          ],
          cronograma: [],
          relatorios: [],
          isRecorrente: false,
        },
      ],
    };
    const entries = deriveRecentActivity(data, 10);
    expect(entries).toHaveLength(2);
    expect(entries.every((e) => e.count === 1)).toBe(true);
  });

  it("nunca agrupa comentários ou pedidos de ajuste, mesmo repetidos no mesmo dia/campanha", () => {
    const data: ClienteLinkData = {
      ...baseData(),
      campanhas: [
        {
          id: "c1",
          nome: "Campanha A",
          planejado: 0,
          influencers: [
            {
              id: "i1",
              nome: "A",
              status: "APROVADO",
              statusCliente: "x",
              redes: [],
              entregas: [],
              activityEvents: [
                {
                  id: "ev1",
                  kind: "comentario_cliente",
                  actorType: "cliente",
                  actorName: "Cliente",
                  createdAt: "2026-01-01T10:00:00.000Z",
                },
                {
                  id: "ev2",
                  kind: "comentario_cliente",
                  actorType: "cliente",
                  actorName: "Cliente",
                  createdAt: "2026-01-01T11:00:00.000Z",
                },
              ],
            },
          ],
          cronograma: [],
          relatorios: [],
          isRecorrente: false,
        },
      ],
    };
    const entries = deriveRecentActivity(data, 10);
    expect(entries).toHaveLength(2);
    expect(entries.every((e) => e.count === 1)).toBe(true);
  });
});

describe("deriveContentItems — entregas corretas por influenciador dentro da campanha (teste obrigatório #10)", () => {
  it("nunca mistura entregas de influenciadores diferentes da mesma campanha", () => {
    const data: ClienteLinkData = {
      ...baseData(),
      campanhas: [
        {
          id: "c1",
          nome: "Campanha A",
          planejado: 0,
          influencers: [
            {
              id: "i1",
              nome: "Ana",
              status: "APROVADO",
              statusCliente: "x",
              redes: [],
              entregas: [
                {
                  id: "e1",
                  tipo: "reel",
                  quantidade: 1,
                  status: "combinado",
                  stage: "PRODUCAO",
                  statusCliente: "Em produção",
                },
              ],
            },
            {
              id: "i2",
              nome: "Bruno",
              status: "APROVADO",
              statusCliente: "x",
              redes: [],
              entregas: [
                {
                  id: "e2",
                  tipo: "story",
                  quantidade: 1,
                  status: "combinado",
                  stage: "PUBLICADA",
                  statusCliente: "Publicado",
                },
              ],
            },
          ],
          cronograma: [],
          relatorios: [],
          isRecorrente: false,
        },
      ],
    };
    const items = deriveContentItems(data);
    const forAna = items.filter((i) => i.influencerId === "i1");
    const forBruno = items.filter((i) => i.influencerId === "i2");
    expect(forAna).toHaveLength(1);
    expect(forAna[0].entrega.id).toBe("e1");
    expect(forBruno).toHaveLength(1);
    expect(forBruno[0].entrega.id).toBe("e2");
  });
});
