import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildDemoScenario, demoCampanhaId, demoClienteId } from "./cenario-campanha-completa";
import {
  DEMO_CLIENT_ACTOR,
  DEMO_NOT_FOUND_MESSAGE,
  DEMO_RATE_LIMITED_MESSAGE,
  createDemoPublicService,
  type DemoAccessKind,
  type DemoPublicPort,
} from "./demo-public";
import { DEMO_LINK_INVALID_MESSAGE, DemoError, type DemoSessionRow } from "./demo-types";
import { isWellFormedDemoToken } from "./demo-token";
import type { Influ } from "@/lib/influencer-model";

const SESSION_ID = "11111111-2222-4333-8444-555555555555";
const TOKEN = "T".repeat(43);
const NOW = new Date("2026-10-05T15:00:00.000Z");

const baseSession: DemoSessionRow = {
  id: SESSION_ID,
  lead_id: "lead-1",
  cliente_id: demoClienteId(SESSION_ID),
  campanha_id: demoCampanhaId(SESSION_ID),
  organization_id: "org-1",
  scenario: "campanha-completa",
  seed_version: 1,
  status: "active",
  token: TOKEN,
  token_expires_at: "2026-10-19T15:00:00.000Z",
  access_revoked_at: null,
  closed_at: null,
  last_client_access_at: null,
  realtime_key: "k",
  created_by: "u",
  created_at: "x",
  updated_at: "x",
};

function scenario() {
  return buildDemoScenario({
    sessionId: SESSION_ID,
    clienteId: baseSession.cliente_id,
    campanhaId: baseSession.campanha_id,
    now: NOW,
    empresa: "Praia Bonita Resorts",
    assetUrl: (s) => `https://signed.test/${s.path}`,
  });
}

type Harness = {
  port: DemoPublicPort;
  influs: Map<string, Influ>;
  saved: { campanhaId: string; id: string; next: Influ }[];
  limits: { kind: DemoAccessKind; token: string }[];
  afterWrite: ReturnType<typeof vi.fn>;
  state: { session: DemoSessionRow | null; allow: boolean; reports: Map<string, string> };
};

function harness(): Harness {
  const sc = scenario();
  const influs = new Map(sc.payload.influenciadores.map((r) => [r.id, structuredClone(r.data)]));
  const state = {
    session: { ...baseSession } as DemoSessionRow | null,
    allow: true,
    reports: new Map([["rel-1", "https://signed.test/report.pdf"]]),
  };
  const saved: Harness["saved"] = [];
  const limits: Harness["limits"] = [];
  const afterWrite = vi.fn().mockResolvedValue(undefined);
  const port: DemoPublicPort = {
    resolve: async (token) =>
      isWellFormedDemoToken(token) && state.session && token === state.session.token
        ? { ok: true, session: state.session }
        : { ok: false },
    rateLimit: async (kind, token) => (limits.push({ kind, token }), state.allow),
    loadPortalData: async () => ({
      clienteNome: "Praia Bonita Resorts",
      campanhas: [],
      artigos: [],
    }),
    loadInflu: async (campanhaId, id) => {
      const influ = influs.get(id);
      if (!influ || campanhaId !== baseSession.campanha_id) {
        throw new Error("Influenciador não encontrado nesta campanha.");
      }
      return structuredClone(influ);
    },
    saveInflu: async (campanhaId, id, next) => {
      saved.push({ campanhaId, id, next });
      influs.set(id, next);
    },
    signReportUrl: async (_s, relatorioId) => state.reports.get(relatorioId) ?? null,
    afterWrite,
  };
  return { port, influs, saved, limits, afterWrite, state };
}

const idOf = (h: Harness, nome: string) =>
  [...h.influs.entries()].find(([, v]) => v.nome === nome)![0];

let h: Harness;
let svc: ReturnType<typeof createDemoPublicService>;
beforeEach(() => {
  h = harness();
  svc = createDemoPublicService(h.port);
});

describe("autorização (o mesmo erro para qualquer falha de acesso)", () => {
  const attempts = [
    ["lixo", () => svc.getPortalData("abc")],
    ["não-string", () => svc.getPortalData(42)],
    ["desconhecido", () => svc.getPortalData("X".repeat(43))],
  ] as const;

  for (const [label, run] of attempts) {
    it(`token ${label}: "Link inválido ou expirado."`, async () => {
      await expect(run()).rejects.toMatchObject({
        name: "DemoError",
        message: DEMO_LINK_INVALID_MESSAGE,
      });
    });
  }

  it("sessão inexistente/expirada/revogada/encerrada: resolve recusa e o erro é idêntico", async () => {
    h.state.session = null;
    const a = await svc.getPortalData(TOKEN).catch((e: Error) => e);
    h.state.session = { ...baseSession };
    const b = await svc.getPortalData("Z".repeat(43)).catch((e: Error) => e);
    expect((a as Error).message).toBe((b as Error).message);
  });

  it("limite excedido: mensagem própria, SEM tocar nos dados", async () => {
    h.state.allow = false;
    const spy = vi.spyOn(h.port, "loadPortalData");
    await expect(svc.getPortalData(TOKEN)).rejects.toThrow(DEMO_RATE_LIMITED_MESSAGE);
    expect(spy).not.toHaveBeenCalled();
  });

  it("leituras e escritas usam limites separados", async () => {
    await svc.getPortalData(TOKEN);
    await svc.respondInflu(TOKEN, {
      campanhaId: baseSession.campanha_id,
      influencerId: idOf(h, "Mariana Alves"),
      status: "aprovado",
    });
    expect(h.limits.map((l) => l.kind)).toEqual(["read", "write"]);
  });
});

describe("getPortalData", () => {
  it("devolve os dados do portal com papel de cliente (pode agir, não é só leitura)", async () => {
    const data = await svc.getPortalData(TOKEN);
    expect(data.clienteNome).toBe("Praia Bonita Resorts");
    expect(data.role).toBe("client_standard");
    expect(data.realtimeKey).toBe("k");
  });
});

describe("respondInflu", () => {
  const input = (h: Harness, nome: string, extra: object = {}) => ({
    campanhaId: baseSession.campanha_id,
    influencerId: idOf(h, nome),
    ...extra,
  });

  it("cliente aprova um perfil enviado: APROVADO, ator fixo, gravado na campanha da sessão", async () => {
    await svc.respondInflu(TOKEN, input(h, "Mariana Alves", { status: "aprovado" }));
    expect(h.saved).toHaveLength(1);
    expect(h.saved[0].campanhaId).toBe(baseSession.campanha_id);
    const next = h.saved[0].next;
    expect(next.status).toBe("APROVADO");
    const last = next.activityEvents!.at(-1)!;
    expect(last).toMatchObject({
      kind: "perfil_aprovado",
      actor: { type: "cliente", name: DEMO_CLIENT_ACTOR },
    });
    expect(next.activity!.at(-1)!.author).toBe(DEMO_CLIENT_ACTOR);
  });

  it("cliente não aprova: exige motivo da lista; 'Outro' exige comentário", async () => {
    const base = input(h, "Rafael Monteiro", { status: "reprovado" });
    await expect(svc.respondInflu(TOKEN, base)).rejects.toThrow(/motivo/i);
    await expect(svc.respondInflu(TOKEN, { ...base, motivoLabel: "Outro" })).rejects.toThrow(
      /Comentário obrigatório/,
    );
    await expect(
      svc.respondInflu(TOKEN, { ...base, motivoLabel: "Motivo inventado" }),
    ).rejects.toThrow();
    expect(h.saved).toHaveLength(0);

    await svc.respondInflu(TOKEN, { ...base, motivoLabel: "Público incompatível" });
    expect(h.saved[0].next.status).toBe("RECUSADO");
    expect(h.saved[0].next.clienteReprovacao?.motivo).toBe("Público incompatível");
    expect(h.saved[0].next.clienteReprovacao?.autorNome).toBe(DEMO_CLIENT_ACTOR);
  });

  it("guarda de status: só perfil ENVIADO_AO_CLIENTE aceita resposta (curadoria, aprovado e recusado não)", async () => {
    for (const nome of ["Thiago Nunes", "Camila Duarte", "Beatriz Costa"]) {
      await expect(
        svc.respondInflu(TOKEN, input(h, nome, { status: "aprovado" })),
        nome,
      ).rejects.toMatchObject({ code: "invalid_state" });
    }
    expect(h.saved).toHaveLength(0);
  });

  it("campanha que não é a da sessão: recusa sem nem carregar o influenciador", async () => {
    const spy = vi.spyOn(h.port, "loadInflu");
    await expect(
      svc.respondInflu(TOKEN, {
        campanhaId: "00000000-0000-4000-8000-000000000000",
        influencerId: idOf(h, "Mariana Alves"),
        status: "aprovado",
      }),
    ).rejects.toThrow(DEMO_NOT_FOUND_MESSAGE);
    expect(spy).not.toHaveBeenCalled();
  });

  it("influenciador de outra campanha/inexistente: erro do produto, nada gravado", async () => {
    await expect(
      svc.respondInflu(TOKEN, {
        ...input(h, "Mariana Alves"),
        influencerId: "nao-existe",
        status: "aprovado",
      }),
    ).rejects.toThrow(/não encontrado nesta campanha/);
    expect(h.saved).toHaveLength(0);
  });

  it("entradas inválidas são rejeitadas pelo schema (zod)", async () => {
    for (const bad of [
      {},
      { campanhaId: "", influencerId: "x", status: "aprovado" },
      { campanhaId: "c", influencerId: "x", status: "talvez" },
    ]) {
      await expect(svc.respondInflu(TOKEN, bad)).rejects.toThrow();
    }
  });
});

describe("reopenInflu", () => {
  it("perfil aprovado SEM entrega além do roteiro: volta para ENVIADO_AO_CLIENTE", async () => {
    // Camila tem entregas avançadas ⇒ bloqueia; usamos um aprovado sem entregas
    const id = idOf(h, "Camila Duarte");
    const sem = { ...h.influs.get(id)!, entregas: [] };
    h.influs.set(id, sem);
    await svc.reopenInflu(TOKEN, { campanhaId: baseSession.campanha_id, influencerId: id });
    expect(h.saved[0].next.status).toBe("ENVIADO_AO_CLIENTE");
    expect(h.saved[0].next.activityEvents!.at(-1)!.kind).toBe("perfil_reaberto");
  });

  it("com entrega em andamento: a trava do produto recusa", async () => {
    await expect(
      svc.reopenInflu(TOKEN, {
        campanhaId: baseSession.campanha_id,
        influencerId: idOf(h, "Camila Duarte"),
      }),
    ).rejects.toThrow(/não é possível reabrir/i);
    expect(h.saved).toHaveLength(0);
  });
});

describe("respondEntrega (roteiro e conteúdo)", () => {
  const entrega = (nome: string, stage: string) =>
    h.influs.get(idOf(h, nome))!.entregas.find((e) => e.stage === stage)!;

  it("aprova roteiro aguardando ⇒ PRODUCAO", async () => {
    const e = entrega("Camila Duarte", "ROTEIRO_APROVACAO");
    await svc.respondEntrega(TOKEN, {
      campanhaId: baseSession.campanha_id,
      influencerId: idOf(h, "Camila Duarte"),
      entregaId: e.id,
      status: "aprovado",
    });
    expect(h.saved[0].next.entregas.find((x) => x.id === e.id)!.stage).toBe("PRODUCAO");
    expect(h.saved[0].next.activityEvents!.at(-1)).toMatchObject({ kind: "roteiro_aprovado" });
  });

  it("pede ajuste no conteúdo aguardando ⇒ CONTEUDO_AJUSTES, com motivo e autor fixo", async () => {
    const e = entrega("Lucas Ferraz", "CONTEUDO_APROVACAO");
    await svc.respondEntrega(TOKEN, {
      campanhaId: baseSession.campanha_id,
      influencerId: idOf(h, "Lucas Ferraz"),
      entregaId: e.id,
      status: "reprovado",
      motivo: "  Trocar o enquadramento  ",
    });
    const next = h.saved[0].next.entregas.find((x) => x.id === e.id)!;
    expect(next.stage).toBe("CONTEUDO_AJUSTES");
    expect(next.conteudoReprovacao).toMatchObject({
      motivo: "Trocar o enquadramento",
      autorNome: DEMO_CLIENT_ACTOR,
    });
  });

  it("ajuste sem motivo é recusado antes de qualquer leitura", async () => {
    const spy = vi.spyOn(h.port, "loadInflu");
    await expect(
      svc.respondEntrega(TOKEN, {
        campanhaId: baseSession.campanha_id,
        influencerId: idOf(h, "Lucas Ferraz"),
        entregaId: "x",
        status: "reprovado",
      }),
    ).rejects.toThrow(/Comentário obrigatório/);
    expect(spy).not.toHaveBeenCalled();
  });

  it("entrega fora do estágio de aprovação (em produção, publicada) é recusada", async () => {
    for (const [nome, stage] of [
      ["Camila Duarte", "PRODUCAO"],
      ["Camila Duarte", "PUBLICADA"],
      ["Lucas Ferraz", "ROTEIRO_AJUSTES"],
    ] as const) {
      await expect(
        svc.respondEntrega(TOKEN, {
          campanhaId: baseSession.campanha_id,
          influencerId: idOf(h, nome),
          entregaId: entrega(nome, stage).id,
          status: "aprovado",
        }),
        `${nome} ${stage}`,
      ).rejects.toThrow(/não está aguardando aprovação/);
    }
    expect(h.saved).toHaveLength(0);
  });

  it("entrega inexistente: not_found", async () => {
    await expect(
      svc.respondEntrega(TOKEN, {
        campanhaId: baseSession.campanha_id,
        influencerId: idOf(h, "Camila Duarte"),
        entregaId: "nao-existe",
        status: "aprovado",
      }),
    ).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("addComentario", () => {
  it("acrescenta o comentário do cliente (append-only) com o ator fixo e registra o evento", async () => {
    const id = idOf(h, "Mariana Alves");
    const before = h.influs.get(id)!.clienteComments?.length ?? 0;
    const r = await svc.addComentario(TOKEN, {
      campanhaId: baseSession.campanha_id,
      influencerId: id,
      text: "  Gostei do perfil  ",
    });
    expect(r.comment.text).toBe("Gostei do perfil");
    expect(r.comment.author).toBe(DEMO_CLIENT_ACTOR);
    const next = h.saved[0].next;
    expect(next.clienteComments).toHaveLength(before + 1);
    expect(next.comments ?? []).toEqual(h.influs.get(id)!.comments ?? []); // canal interno intocado
    expect(next.activityEvents!.at(-1)).toMatchObject({
      kind: "comentario_cliente",
      comentario: "Gostei do perfil",
    });
  });

  it("texto vazio ou gigante é recusado", async () => {
    const base = { campanhaId: baseSession.campanha_id, influencerId: idOf(h, "Mariana Alves") };
    await expect(svc.addComentario(TOKEN, { ...base, text: "   " })).rejects.toThrow();
    await expect(svc.addComentario(TOKEN, { ...base, text: "x".repeat(2001) })).rejects.toThrow();
  });
});

describe("freshRelatorioUrl", () => {
  it("devolve a URL; relatório inexistente ou campanha alheia: not_found", async () => {
    expect(
      await svc.freshRelatorioUrl(TOKEN, {
        campanhaId: baseSession.campanha_id,
        relatorioId: "rel-1",
      }),
    ).toEqual({
      url: "https://signed.test/report.pdf",
    });
    await expect(
      svc.freshRelatorioUrl(TOKEN, { campanhaId: baseSession.campanha_id, relatorioId: "nope" }),
    ).rejects.toMatchObject({ code: "not_found" });
    await expect(
      svc.freshRelatorioUrl(TOKEN, { campanhaId: "outra", relatorioId: "rel-1" }),
    ).rejects.toThrow(DEMO_NOT_FOUND_MESSAGE);
  });
});

describe("sinal após escrita (best-effort)", () => {
  it("dispara depois de cada escrita bem-sucedida, com a sessão", async () => {
    await svc.respondInflu(TOKEN, {
      campanhaId: baseSession.campanha_id,
      influencerId: idOf(h, "Mariana Alves"),
      status: "aprovado",
    });
    expect(h.afterWrite).toHaveBeenCalledTimes(1);
    expect(h.afterWrite.mock.calls[0][0].id).toBe(SESSION_ID);
  });

  it("não dispara se a escrita falhou; falha do sinal NÃO derruba a resposta", async () => {
    await svc
      .respondInflu(TOKEN, {
        campanhaId: baseSession.campanha_id,
        influencerId: idOf(h, "Thiago Nunes"),
        status: "aprovado",
      })
      .catch(() => {});
    expect(h.afterWrite).not.toHaveBeenCalled();

    h.afterWrite.mockRejectedValueOnce(new Error("realtime fora"));
    await expect(
      svc.respondInflu(TOKEN, {
        campanhaId: baseSession.campanha_id,
        influencerId: idOf(h, "Mariana Alves"),
        status: "aprovado",
      }),
    ).resolves.toEqual({ ok: true });
  });

  it("DemoError usado é a classe esperada", () => {
    expect(new DemoError("forbidden", "x")).toBeInstanceOf(Error);
  });
});

describe("toSafeDemoError", () => {
  it("DemoError e erro de regra do produto passam; zod mostra só a mensagem nossa; o resto é genérico", async () => {
    const { toSafeDemoError, DEMO_GENERIC_ERROR, RespondInfluInput } =
      await import("./demo-public");
    expect(toSafeDemoError(new DemoError("forbidden", DEMO_LINK_INVALID_MESSAGE)).message).toBe(
      DEMO_LINK_INVALID_MESSAGE,
    );
    expect(toSafeDemoError(new Error("Esta entrega não está aguardando aprovação.")).message).toBe(
      "Esta entrega não está aguardando aprovação.",
    );
    const custom = RespondInfluInput.safeParse({
      campanhaId: "c",
      influencerId: "i",
      status: "reprovado",
    });
    expect(custom.success).toBe(false);
    if (!custom.success) expect(toSafeDemoError(custom.error).message).toMatch(/motivo/i);
    const tipo = RespondInfluInput.safeParse({
      campanhaId: 1,
      influencerId: "i",
      status: "aprovado",
    });
    if (!tipo.success) expect(toSafeDemoError(tipo.error).message).toBe("Dados inválidos.");
    expect(toSafeDemoError("texto solto").message).toBe(DEMO_GENERIC_ERROR);
    expect(toSafeDemoError(null).message).toBe(DEMO_GENERIC_ERROR);
  });
});
