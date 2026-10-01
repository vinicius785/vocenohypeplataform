import { describe, expect, it } from "vitest";
import {
  findParticipacoes,
  filterBankInflus,
  DEFAULT_INFLUENCER_BANCO_FILTERS,
  countActiveInfluencerBancoFilters,
  totalSeguidores,
  type InfluencerBancoEnrichment,
} from "./influencer-banco-v2";
import { mediaAvaliacao, mediaGeralAvaliacoes } from "./campanha-influenciador-avaliacao";
import type { Cliente } from "@/lib/clientes-store";
import type { Campaign } from "@/components/VincularCampanhaDialog";
import type { Influ } from "@/components/influenciadores/InfluencerBoard";
import type { BankInflu } from "@/lib/banco-influs-store";

function cliente(overrides: Partial<Cliente> = {}): Cliente {
  return { id: "c1", empresa: "Cliente Teste", campanhas: [], ...overrides } as Cliente;
}

function campaign(overrides: Partial<Campaign> = {}): Campaign {
  return {
    id: "camp1",
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
  } as Campaign;
}

function influ(overrides: Partial<Influ> = {}): Influ {
  return {
    id: "inf1",
    nome: "Fulano de Tal",
    redes: [],
    entregas: [],
    status: "APROVADO",
    ...overrides,
  } as Influ;
}

describe("findParticipacoes", () => {
  it("casa por nome (case-insensitive, trim) e inclui o status da campanha e o id estável da participação", () => {
    const camp = campaign({ id: "camp1", nome: "Verão 2026", status: "completed" });
    const clientes = [
      cliente({
        id: "cli1",
        empresa: "ACME",
        campanhas: [camp],
      }),
    ];
    const map = new Map([[camp.id, [influ({ id: "part-1", nome: "  Fulano De Tal  " })]]]);

    const result = findParticipacoes("fulano de tal", clientes, map);

    expect(result).toHaveLength(1);
    expect(result[0].campanhaInfluenciadorId).toBe("part-1");
    expect(result[0].campanhaStatus).toBe("completed");
    expect(result[0].clienteEmpresa).toBe("ACME");
  });

  it("não casa nomes diferentes e devolve lista vazia pra nome em branco", () => {
    const camp = campaign();
    const clientes = [cliente({ campanhas: [camp] })];
    const map = new Map([[camp.id, [influ({ nome: "Outra Pessoa" })]]]);
    expect(findParticipacoes("fulano de tal", clientes, map)).toHaveLength(0);
    expect(findParticipacoes("   ", clientes, map)).toHaveLength(0);
  });

  it("ordena participações por data de início decrescente", () => {
    const campAntiga = campaign({ id: "a", dataInicio: "2025-01-01" });
    const campNova = campaign({ id: "b", dataInicio: "2026-01-01" });
    const clientes = [cliente({ campanhas: [campAntiga, campNova] })];
    const map = new Map([
      ["a", [influ({ id: "p-a", nome: "Fulano" })]],
      ["b", [influ({ id: "p-b", nome: "Fulano" })]],
    ]);
    const result = findParticipacoes("Fulano", clientes, map);
    expect(result.map((r) => r.campanhaInfluenciadorId)).toEqual(["p-b", "p-a"]);
  });

  it("só conta participação efetiva (APROVADO) — ser adicionado à campanha não é participação", () => {
    const campA = campaign({ id: "a", nome: "Campanha A" });
    const campB = campaign({ id: "b", nome: "Campanha B" });
    const campC = campaign({ id: "c", nome: "Campanha C" });
    const campD = campaign({ id: "d", nome: "Campanha D" });
    const clientes = [cliente({ campanhas: [campA, campB, campC, campD] })];
    const map = new Map([
      ["a", [influ({ id: "p-a", nome: "Fulano", status: "APROVADO" })]],
      ["b", [influ({ id: "p-b", nome: "Fulano", status: "RECUSADO" })]],
      ["c", [influ({ id: "p-c", nome: "Fulano", status: "RECUSADO" })]],
      ["d", [influ({ id: "p-d", nome: "Fulano", status: "EM_CURADORIA" })]],
    ]);

    const result = findParticipacoes("Fulano", clientes, map);

    expect(result).toHaveLength(1);
    expect(result[0].campanhaNome).toBe("Campanha A");
  });

  it("exclui INSCRITO e ENVIADO_AO_CLIENTE do histórico (ainda não é participação efetiva)", () => {
    const camp1 = campaign({ id: "1" });
    const camp2 = campaign({ id: "2" });
    const clientes = [cliente({ campanhas: [camp1, camp2] })];
    const map = new Map([
      ["1", [influ({ id: "p1", nome: "Fulano", status: "INSCRITO" })]],
      ["2", [influ({ id: "p2", nome: "Fulano", status: "ENVIADO_AO_CLIENTE" })]],
    ]);
    expect(findParticipacoes("Fulano", clientes, map)).toHaveLength(0);
  });
});

describe("mediaAvaliacao / mediaGeralAvaliacoes", () => {
  it("calcula a média simples dos 5 critérios, com 1 casa decimal", () => {
    const media = mediaAvaliacao({
      cumprimentoCombinados: 5,
      comunicacao: 4,
      qualidadeEntregas: 5,
      aderenciaBriefing: 4,
      organizacaoProfissionalismo: 5,
    });
    expect(media).toBe(4.6);
  });

  it("mediaGeralAvaliacoes devolve null quando não há avaliações (nunca 0, que seria enganoso)", () => {
    expect(mediaGeralAvaliacoes([])).toBeNull();
  });

  it("mediaGeralAvaliacoes é a média das médias de cada avaliação", () => {
    const a = {
      cumprimentoCombinados: 5,
      comunicacao: 5,
      qualidadeEntregas: 5,
      aderenciaBriefing: 5,
      organizacaoProfissionalismo: 5,
    };
    const b = {
      cumprimentoCombinados: 3,
      comunicacao: 3,
      qualidadeEntregas: 3,
      aderenciaBriefing: 3,
      organizacaoProfissionalismo: 3,
    };
    expect(mediaGeralAvaliacoes([a, b])).toBe(4);
  });
});

function bankInflu(overrides: Partial<BankInflu> = {}): BankInflu {
  return {
    id: "b1",
    nome: "Fulano",
    redes: [],
    ...overrides,
  } as BankInflu;
}

describe("filterBankInflus", () => {
  const enrichmentWith = (over: Partial<InfluencerBancoEnrichment>): InfluencerBancoEnrichment => ({
    historicoCount: 0,
    mediaAvaliacao: null,
    avaliacoesCount: 0,
    ...over,
  });

  it("nunca mostra influenciador arquivado", () => {
    const list = [bankInflu({ id: "1", arquivado: true })];
    const out = filterBankInflus(list, "", DEFAULT_INFLUENCER_BANCO_FILTERS, new Map());
    expect(out).toHaveLength(0);
  });

  it("filtra por com/sem histórico", () => {
    const list = [bankInflu({ id: "com" }), bankInflu({ id: "sem" })];
    const enrichmentById = new Map([
      ["com", enrichmentWith({ historicoCount: 2 })],
      ["sem", enrichmentWith({ historicoCount: 0 })],
    ]);
    const comHistorico = filterBankInflus(
      list,
      "",
      { ...DEFAULT_INFLUENCER_BANCO_FILTERS, comHistorico: "com" },
      enrichmentById,
    );
    expect(comHistorico.map((i) => i.id)).toEqual(["com"]);
  });

  it("filtra por avaliado/não avaliado e nota mínima", () => {
    const list = [bankInflu({ id: "bom" }), bankInflu({ id: "ruim" }), bankInflu({ id: "sem" })];
    const enrichmentById = new Map([
      ["bom", enrichmentWith({ avaliacoesCount: 3, mediaAvaliacao: 4.8 })],
      ["ruim", enrichmentWith({ avaliacoesCount: 1, mediaAvaliacao: 2.0 })],
      ["sem", enrichmentWith({ avaliacoesCount: 0, mediaAvaliacao: null })],
    ]);
    const avaliados = filterBankInflus(
      list,
      "",
      { ...DEFAULT_INFLUENCER_BANCO_FILTERS, avaliado: "avaliado", notaMin: "4" },
      enrichmentById,
    );
    expect(avaliados.map((i) => i.id)).toEqual(["bom"]);
  });

  it("busca por nome, handle, telefone e e-mail", () => {
    const list = [
      bankInflu({ id: "1", nome: "Daniel Mohamed", redes: [], telefone: "11999990000" }),
      bankInflu({ id: "2", nome: "Outra Pessoa", email: "contato@exemplo.com" }),
    ];
    expect(
      filterBankInflus(list, "daniel", DEFAULT_INFLUENCER_BANCO_FILTERS, new Map()),
    ).toHaveLength(1);
    expect(
      filterBankInflus(list, "exemplo.com", DEFAULT_INFLUENCER_BANCO_FILTERS, new Map()),
    ).toHaveLength(1);
  });

  it("ordena por seguidores (desc) quando sort = seguidores", () => {
    const list = [
      bankInflu({
        id: "pequeno",
        redes: [{ id: "r1", plataforma: "Instagram", handle: "a", seguidores: "1000" }],
      }),
      bankInflu({
        id: "grande",
        redes: [{ id: "r2", plataforma: "Instagram", handle: "b", seguidores: "50000" }],
      }),
    ];
    const out = filterBankInflus(
      list,
      "",
      { ...DEFAULT_INFLUENCER_BANCO_FILTERS, sort: "seguidores" },
      new Map(),
    );
    expect(out.map((i) => i.id)).toEqual(["grande", "pequeno"]);
  });
});

describe("totalSeguidores / countActiveInfluencerBancoFilters", () => {
  it("soma seguidores de todas as redes, ignorando valores não numéricos", () => {
    expect(
      totalSeguidores([
        { id: "1", plataforma: "Instagram", handle: "a", seguidores: "10.000" },
        { id: "2", plataforma: "TikTok", handle: "b", seguidores: "5000" },
      ]),
    ).toBe(15000);
  });

  it("conta só os filtros preenchidos", () => {
    expect(countActiveInfluencerBancoFilters(DEFAULT_INFLUENCER_BANCO_FILTERS)).toBe(0);
    expect(
      countActiveInfluencerBancoFilters({
        ...DEFAULT_INFLUENCER_BANCO_FILTERS,
        nicho: "Moda",
        avaliado: "avaliado",
      }),
    ).toBe(2);
  });
});
