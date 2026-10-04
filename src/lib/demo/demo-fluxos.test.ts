import { beforeEach, describe, expect, it } from "vitest";
import { canTransitionInflu } from "@/lib/campanha-status";
import { applyEntregaAction } from "@/lib/entrega-engine";
import { addAnexosComVersao, type Entrega, type Influ } from "@/lib/influencer-model";
import type { DemoAssetSpec, DemoScenarioPayload } from "./cenario-campanha-completa";
import { DEMO_CLIENT_ACTOR, createDemoPublicService, type DemoPublicPort } from "./demo-public";
import {
  createDemoService,
  type DemoLeadInfo,
  type DemoPort,
  type NewDemoEvent,
} from "./demo-service";
import { buildDemoTimeline } from "./demo-timeline";
import { DEMO_LINK_INVALID_MESSAGE, type DemoEventRow, type DemoSessionRow } from "./demo-types";

/**
 * FLUXOS COMPLETOS da Demo, de ponta a ponta e em memória: o TIME (serviço da demo + as funções
 * puras do motor de entrega, as mesmas do produto) e o CLIENTE (funções públicas por token)
 * operam sobre o MESMO estado — como no banco real. Cada `it` é um cenário da aceitação.
 */

const T0 = new Date("2026-10-05T15:00:00.000Z");
const DAY = 86_400_000;

type World = {
  now: Date;
  sessions: Map<string, DemoSessionRow>;
  events: NewDemoEvent[];
  influs: Map<string, Influ>;
  saves: { campanhaId: string; id: string }[];
  signals: string[];
  report: string;
};

function makeWorld(): World & {
  team: ReturnType<typeof createDemoService>;
  client: ReturnType<typeof createDemoPublicService>;
} {
  const w: World = {
    now: new Date(T0),
    sessions: new Map(),
    events: [],
    influs: new Map(),
    saves: [],
    signals: [],
    report: "https://signed.test/relatorio.pdf",
  };
  let orgSeq = 0;
  let idSeq = 0;
  const lead: DemoLeadInfo = {
    id: "lead-1",
    name: "Ana Souza",
    company: "Praia Bonita Resorts",
    contact: "Ana Souza",
  };

  const port: DemoPort = {
    getPrerequisites: async () => ({
      schemaVersion: 1,
      rlsInternalOnly: true,
      npsGuard: true,
      markerGuard: true,
    }),
    getLead: async (id) => (id === lead.id ? lead : null),
    findActiveSessionByLead: async (id) =>
      [...w.sessions.values()].find((s) => s.lead_id === id && s.status === "active") ?? null,
    findLatestSessionByLead: async (id) =>
      [...w.sessions.values()].find((s) => s.lead_id === id) ?? null,
    findSessionById: async (id) => (w.sessions.get(id) ? { ...w.sessions.get(id)! } : null),
    findSessionByToken: async (t) => {
      const s = [...w.sessions.values()].find((x) => x.token === t);
      return s ? { ...s } : null;
    },
    createOrganization: async () => `org-${++orgSeq}`,
    insertSession: async (row) => void w.sessions.set(row.id, { ...row }),
    updateSession: async (id, patch) => {
      const next = { ...w.sessions.get(id)!, ...patch };
      w.sessions.set(id, next);
      return { ...next };
    },
    insertEvent: async (e) => void w.events.push(e),
    listEvents: async (id): Promise<DemoEventRow[]> =>
      w.events
        .filter((e) => e.session_id === id)
        .map((e, i) => ({ ...e, id: `ev-${i}` }))
        .reverse(),
    publishAssets: async (_s, specs: DemoAssetSpec[]) =>
      new Map(specs.map((s) => [s.key, `https://signed.test/${s.path}`])),
    purgeAssets: async () => {},
    applyScenario: async (_id: string, payload: DemoScenarioPayload) => {
      // Mesmo contrato do SQL: apaga o que era da campanha e recria o cenário.
      w.influs = new Map(payload.influenciadores.map((r) => [r.id, structuredClone(r.data)]));
    },
    removeSession: async (s) => void w.sessions.delete(s.id),
  };

  const team = createDemoService(port, {
    now: () => w.now,
    newId: () => `aaaaaaaa-0000-4000-8000-${String(++idSeq).padStart(12, "0")}`,
    log: () => {},
  });

  const publicPort: DemoPublicPort = {
    resolve: (token) => team.resolveAccess(token),
    rateLimit: async () => true,
    loadPortalData: async () => ({
      clienteNome: "Praia Bonita Resorts",
      campanhas: [],
      artigos: [],
    }),
    loadInflu: async (campanhaId, id) => {
      const influ = w.influs.get(id);
      const camp = [...w.sessions.values()][0]?.campanha_id;
      if (!influ || campanhaId !== camp)
        throw new Error("Influenciador não encontrado nesta campanha.");
      return structuredClone(influ);
    },
    saveInflu: async (campanhaId, id, next) => {
      w.saves.push({ campanhaId, id });
      w.influs.set(id, next);
    },
    signReportUrl: async (_s, rid) => (rid === "r1" ? w.report : null),
    afterWrite: async (s) => void w.signals.push(s.realtime_key),
  };
  const client = createDemoPublicService(publicPort);
  return Object.assign(w, { team, client });
}

// ---------------- operações do TIME (funções puras do produto) ----------------
const find = (w: World, nome: string) => [...w.influs.entries()].find(([, v]) => v.nome === nome)!;
function teamSendProfile(w: World, nome: string) {
  const [id, i] = find(w, nome);
  if (!canTransitionInflu(i.status, "ENVIADO_AO_CLIENTE"))
    throw new Error(`transição inválida: ${i.status}`);
  w.influs.set(id, { ...i, status: "ENVIADO_AO_CLIENTE" });
}
function teamUpdateEntrega(
  w: World,
  nome: string,
  entregaId: string,
  fn: (e: Entrega) => Partial<Entrega>,
) {
  const [id, i] = find(w, nome);
  w.influs.set(id, {
    ...i,
    entregas: i.entregas.map((e) => (e.id === entregaId ? { ...e, ...fn(e) } : e)),
  });
}
const entregaIn = (w: World, nome: string, stage: string) =>
  find(w, nome)[1].entregas.find((e) => e.stage === stage)!;

let w: ReturnType<typeof makeWorld>;
let sessionId: string;
let token: string;
let campanhaId: string;

const asClient = (nome: string) => ({ campanhaId, influencerId: find(w, nome)[0] });

beforeEach(async () => {
  w = makeWorld();
  const view = await w.team.createDemo({ leadId: "lead-1", actorUserId: "u1" });
  sessionId = view.id;
  campanhaId = view.campanha_id;
  token = (await w.team.getLink(sessionId)).token;
});

describe("1–4 · criação, vínculo, link e primeiro acesso", () => {
  it("1. cria a demo (cenário completo) e 2. vincula ao lead sem tocar nele", () => {
    expect(w.influs.size).toBe(7);
    expect(w.sessions.get(sessionId)!.lead_id).toBe("lead-1");
  });

  it("3. gera link próprio e 4. o cliente abre e recebe os dados", async () => {
    expect(token).toHaveLength(43);
    const data = await w.client.getPortalData(token);
    expect(data.role).toBe("client_standard");
    expect(w.events.map((e) => e.kind)).toContain("cliente_abriu_link");
  });
});

describe("5–9 · influenciadores (aprovar, reprovar, substituir)", () => {
  it("5. cliente aprova um perfil enviado", async () => {
    await w.client.respondInflu(token, { ...asClient("Mariana Alves"), status: "aprovado" });
    expect(find(w, "Mariana Alves")[1].status).toBe("APROVADO");
  });

  it("6. cliente reprova com motivo; o time vê o motivo", async () => {
    await w.client.respondInflu(token, {
      ...asClient("Rafael Monteiro"),
      status: "reprovado",
      motivoLabel: "Métricas insuficientes",
    });
    const r = find(w, "Rafael Monteiro")[1];
    expect(r.status).toBe("RECUSADO");
    expect(r.clienteReprovacao?.motivo).toBe("Métricas insuficientes");
  });

  it("7. time seleciona OUTRO da curadoria (fluxo atual, sem ação nova) e 8. cliente aprova o substituto", async () => {
    await w.client.respondInflu(token, {
      ...asClient("Rafael Monteiro"),
      status: "reprovado",
      motivoLabel: "Métricas insuficientes",
    });
    teamSendProfile(w, "Thiago Nunes");
    expect(find(w, "Thiago Nunes")[1].status).toBe("ENVIADO_AO_CLIENTE");
    await w.client.respondInflu(token, { ...asClient("Thiago Nunes"), status: "aprovado" });
    expect(find(w, "Thiago Nunes")[1].status).toBe("APROVADO");
  });

  it("9. time reenvia o perfil recusado e o cliente decide de novo", async () => {
    teamSendProfile(w, "Beatriz Costa"); // RECUSADO → ENVIADO_AO_CLIENTE
    await w.client.respondInflu(token, { ...asClient("Beatriz Costa"), status: "aprovado" });
    expect(find(w, "Beatriz Costa")[1].status).toBe("APROVADO");
  });
});

describe("10–15 · roteiros e conteúdos (aprovar, ajustar, reenviar)", () => {
  const entregaAguardando = (nome: string, stage: "ROTEIRO_APROVACAO" | "CONTEUDO_APROVACAO") =>
    entregaIn(w, nome, stage);

  it("10. cliente aprova roteiro → produção", async () => {
    const e = entregaAguardando("Camila Duarte", "ROTEIRO_APROVACAO");
    await w.client.respondEntrega(token, {
      ...asClient("Camila Duarte"),
      entregaId: e.id,
      status: "aprovado",
    });
    expect(find(w, "Camila Duarte")[1].entregas.find((x) => x.id === e.id)!.stage).toBe("PRODUCAO");
  });

  it("11. cliente pede ajuste no roteiro; 12. time reconhece, anexa a v2 e reenvia; 13. cliente aprova a v2", async () => {
    const e = entregaAguardando("Lucas Ferraz", "ROTEIRO_APROVACAO");
    const nome = "Lucas Ferraz";
    await w.client.respondEntrega(token, {
      ...asClient(nome),
      entregaId: e.id,
      status: "reprovado",
      motivo: "Incluir a promoção",
    });
    expect(find(w, nome)[1].entregas.find((x) => x.id === e.id)!.stage).toBe("ROTEIRO_AJUSTES");

    teamUpdateEntrega(w, nome, e.id, (x) => applyEntregaAction(x, "reconhecer_ajustes_roteiro")); // → ROTEIRO_PRODUCAO
    teamUpdateEntrega(w, nome, e.id, (x) => ({
      anexos: addAnexosComVersao(x.anexos ?? [], "Roteiro", [
        { nome: "roteiro-v2.pdf", url: "https://x/v2.pdf" },
      ]),
    }));
    teamUpdateEntrega(w, nome, e.id, (x) => applyEntregaAction(x, "enviar_roteiro")); // → ROTEIRO_APROVACAO
    const atual = find(w, nome)[1].entregas.find((x) => x.id === e.id)!;
    expect(atual.stage).toBe("ROTEIRO_APROVACAO");
    expect(
      Math.max(
        ...(atual.anexos ?? []).filter((a) => a.categoria === "Roteiro").map((a) => a.versao ?? 1),
      ),
    ).toBe(2);

    await w.client.respondEntrega(token, {
      ...asClient(nome),
      entregaId: e.id,
      status: "aprovado",
    });
    expect(find(w, nome)[1].entregas.find((x) => x.id === e.id)!.stage).toBe("PRODUCAO");
  });

  it("14. cliente aprova conteúdo → publicação; 15. cliente pede ajuste em outro e o time reenvia", async () => {
    const aprova = entregaAguardando("Camila Duarte", "CONTEUDO_APROVACAO");
    await w.client.respondEntrega(token, {
      ...asClient("Camila Duarte"),
      entregaId: aprova.id,
      status: "aprovado",
    });
    expect(find(w, "Camila Duarte")[1].entregas.find((x) => x.id === aprova.id)!.stage).toBe(
      "PUBLICACAO",
    );

    const ajusta = entregaAguardando("Lucas Ferraz", "CONTEUDO_APROVACAO");
    await w.client.respondEntrega(token, {
      ...asClient("Lucas Ferraz"),
      entregaId: ajusta.id,
      status: "reprovado",
      motivo: "Trocar o enquadramento",
    });
    teamUpdateEntrega(w, "Lucas Ferraz", ajusta.id, (x) =>
      applyEntregaAction(x, "reconhecer_ajustes_conteudo"),
    ); // → PRODUCAO
    teamUpdateEntrega(w, "Lucas Ferraz", ajusta.id, (x) => ({
      anexos: addAnexosComVersao(x.anexos ?? [], "Conteúdo final", [
        { nome: "v2.png", url: "https://x/v2.png" },
      ]),
    }));
    teamUpdateEntrega(w, "Lucas Ferraz", ajusta.id, (x) =>
      applyEntregaAction(x, "enviar_conteudo"),
    );
    expect(find(w, "Lucas Ferraz")[1].entregas.find((x) => x.id === ajusta.id)!.stage).toBe(
      "CONTEUDO_APROVACAO",
    );
  });
});

describe("16–19 · publicação, métricas, relatório, comentários e narrativa", () => {
  it("16. time publica e registra métricas (só as que o produto tem); o cliente as vê no dado", async () => {
    const aprova = entregaIn(w, "Camila Duarte", "CONTEUDO_APROVACAO");
    await w.client.respondEntrega(token, {
      ...asClient("Camila Duarte"),
      entregaId: aprova.id,
      status: "aprovado",
    });
    teamUpdateEntrega(w, "Camila Duarte", aprova.id, (x) => ({
      ...applyEntregaAction(x, "marcar_publicado", { url: "https://example.com/p" }),
      metrics: { views: 1000, likes: 80, comments: 5, shares: 3, saves: 9, reach: 700 },
    }));
    const pub = find(w, "Camila Duarte")[1].entregas.find((x) => x.id === aprova.id)!;
    expect(pub.stage).toBe("PUBLICADA");
    expect(Object.keys(pub.metrics!).sort()).toEqual([
      "comments",
      "likes",
      "reach",
      "saves",
      "shares",
      "views",
    ]);
  });

  it("17. o cliente obtém a URL do relatório; relatório inexistente é recusado", async () => {
    expect(await w.client.freshRelatorioUrl(token, { campanhaId, relatorioId: "r1" })).toEqual({
      url: w.report,
    });
    await expect(
      w.client.freshRelatorioUrl(token, { campanhaId, relatorioId: "nao" }),
    ).rejects.toThrow();
  });

  it("18. o cliente comenta; o comentário vai ao canal do cliente, nunca ao interno", async () => {
    const before = find(w, "Mariana Alves")[1].comments ?? [];
    await w.client.addComentario(token, { ...asClient("Mariana Alves"), text: "Ótimo perfil" });
    const i = find(w, "Mariana Alves")[1];
    expect(i.clienteComments!.at(-1)!.text).toBe("Ótimo perfil");
    expect(i.comments ?? []).toEqual(before);
  });

  it("19. a narrativa conta o que aconteceu, com as frases pedidas e o ator fixo", async () => {
    await w.client.respondInflu(token, {
      ...asClient("Rafael Monteiro"),
      status: "reprovado",
      motivoLabel: "Público incompatível",
    });
    await w.client.respondInflu(token, { ...asClient("Mariana Alves"), status: "aprovado" });
    const t = buildDemoTimeline(
      [...w.influs.values()],
      await w.team.getDemoForLead("lead-1").then((r) => r.events),
    );
    const texts = t.map((x) => x.text);
    expect(texts).toContain("Cliente reprovou Rafael Monteiro");
    expect(texts).toContain("Cliente aprovou Mariana Alves");
    expect(texts).toContain("Cliente abriu o link");
    for (const i of w.influs.values()) {
      for (const e of i.activityEvents ?? []) {
        if (e.actor.type === "cliente") expect(e.actor.name).toBe(DEMO_CLIENT_ACTOR);
      }
    }
  });
});

describe("20–23 · ciclo de vida (reiniciar, revogar, renovar, encerrar)", () => {
  it("20. reiniciar desfaz TUDO que foi feito e mantém o MESMO link", async () => {
    await w.client.respondInflu(token, { ...asClient("Mariana Alves"), status: "aprovado" });
    await w.client.addComentario(token, { ...asClient("Mariana Alves"), text: "oi" });
    await w.team.restartDemo({ sessionId, actorUserId: "u1" });
    const i = find(w, "Mariana Alves")[1];
    expect(i.status).toBe("ENVIADO_AO_CLIENTE");
    expect(i.clienteComments ?? []).toHaveLength(0);
    expect((await w.team.getLink(sessionId)).token).toBe(token);
    expect((await w.client.getPortalData(token)).role).toBe("client_standard");
  });

  it("21. revogar mata o link na hora (mesmo erro de sempre); a campanha segue para o time", async () => {
    await w.team.revokeAccess({ sessionId, actorUserId: "u1" });
    await expect(w.client.getPortalData(token)).rejects.toThrow(DEMO_LINK_INVALID_MESSAGE);
    await expect(
      w.client.respondInflu(token, { ...asClient("Mariana Alves"), status: "aprovado" }),
    ).rejects.toThrow(DEMO_LINK_INVALID_MESSAGE);
    expect(w.influs.size).toBe(7);
  });

  it("22. renovar uma demo expirada reativa o MESMO link; renovar uma revogada gera link novo e o antigo não volta", async () => {
    w.now = new Date(T0.getTime() + 15 * DAY);
    await expect(w.client.getPortalData(token)).rejects.toThrow(DEMO_LINK_INVALID_MESSAGE);
    await w.team.renewAccess({ sessionId, actorUserId: "u1" });
    expect((await w.client.getPortalData(token)).role).toBe("client_standard");

    await w.team.revokeAccess({ sessionId, actorUserId: "u1" });
    await w.team.renewAccess({ sessionId, actorUserId: "u1" });
    const novo = (await w.team.getLink(sessionId)).token;
    expect(novo).not.toBe(token);
    await expect(w.client.getPortalData(token)).rejects.toThrow(DEMO_LINK_INVALID_MESSAGE);
    expect((await w.client.getPortalData(novo)).role).toBe("client_standard");
  });

  it("23. encerrar bloqueia o cliente de vez e não permite reabrir, reiniciar ou renovar", async () => {
    await w.team.closeDemo({ sessionId, actorUserId: "u1" });
    await expect(w.client.getPortalData(token)).rejects.toThrow(DEMO_LINK_INVALID_MESSAGE);
    await expect(w.team.restartDemo({ sessionId, actorUserId: "u1" })).rejects.toMatchObject({
      code: "closed",
    });
    await expect(w.team.renewAccess({ sessionId, actorUserId: "u1" })).rejects.toMatchObject({
      code: "closed",
    });
    const nova = await w.team.createDemo({ leadId: "lead-1", actorUserId: "u1" });
    expect(nova.id).not.toBe(sessionId);
  });
});

describe("24 · isolamento e efeitos externos", () => {
  it("o cliente só alcança a campanha da SESSÃO: id de campanha real é recusado, nada é gravado", async () => {
    const realCampanha = "00000000-0000-4000-8000-000000000999";
    await expect(
      w.client.respondInflu(token, {
        campanhaId: realCampanha,
        influencerId: find(w, "Mariana Alves")[0],
        status: "aprovado",
      }),
    ).rejects.toThrow();
    await expect(
      w.client.respondEntrega(token, {
        campanhaId: realCampanha,
        influencerId: "x",
        entregaId: "y",
        status: "aprovado",
      }),
    ).rejects.toThrow();
    expect(w.saves).toHaveLength(0);
  });

  it("toda escrita do cliente vai para a campanha da sessão e dispara o sinal (best-effort)", async () => {
    await w.client.respondInflu(token, { ...asClient("Mariana Alves"), status: "aprovado" });
    expect(w.saves.every((s) => s.campanhaId === campanhaId)).toBe(true);
    expect(w.signals).toEqual([w.sessions.get(sessionId)!.realtime_key]);
  });

  it("nenhum efeito externo: demo sem e-mail/telefone, e a ação do cliente faz UMA escrita (a do influenciador)", async () => {
    for (const i of w.influs.values()) {
      expect(i.email).toBeUndefined();
      expect(i.telefone).toBeUndefined();
    }
    await w.client.respondInflu(token, { ...asClient("Mariana Alves"), status: "aprovado" });
    expect(w.saves).toHaveLength(1);
  });

  it("transições incoerentes são barradas: aprovar de novo, aprovar quem está na curadoria, aprovar entrega em produção", async () => {
    await w.client.respondInflu(token, { ...asClient("Mariana Alves"), status: "aprovado" });
    await expect(
      w.client.respondInflu(token, { ...asClient("Mariana Alves"), status: "aprovado" }),
    ).rejects.toThrow();
    await expect(
      w.client.respondInflu(token, { ...asClient("Julia Prado"), status: "aprovado" }),
    ).rejects.toThrow();
    const emProducao = entregaIn(w, "Camila Duarte", "PRODUCAO");
    await expect(
      w.client.respondEntrega(token, {
        ...asClient("Camila Duarte"),
        entregaId: emProducao.id,
        status: "aprovado",
      }),
    ).rejects.toThrow(/não está aguardando aprovação/);
  });
});
