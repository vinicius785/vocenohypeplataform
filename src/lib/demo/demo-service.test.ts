import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  demoCampanhaId,
  demoClienteId,
  type DemoAssetSpec,
  type DemoScenarioPayload,
} from "./cenario-campanha-completa";
import {
  createDemoService,
  describeMissingPrerequisites,
  type DemoLeadInfo,
  type DemoPort,
  type NewDemoEvent,
} from "./demo-service";
import { DEMO_TOKEN_TTL_DAYS, isWellFormedDemoToken } from "./demo-token";
import {
  DEMO_SCHEMA_VERSION,
  DemoError,
  type DemoEventRow,
  type DemoPrerequisites,
  type DemoSessionRow,
} from "./demo-types";

const T0 = new Date("2026-10-05T15:00:00.000Z");
const DAY = 86_400_000;
const OK_PREREQ: DemoPrerequisites = {
  schemaVersion: DEMO_SCHEMA_VERSION,
  rlsInternalOnly: true,
  npsGuard: true,
  markerGuard: true,
};

class FakePort implements DemoPort {
  prereq: DemoPrerequisites | null = { ...OK_PREREQ };
  leads = new Map<string, DemoLeadInfo>();
  sessions = new Map<string, DemoSessionRow>();
  events: NewDemoEvent[] = [];
  orgs = new Map<string, string>();
  assets = new Set<string>();
  applied: { sessionId: string; payload: DemoScenarioPayload }[] = [];
  calls: string[] = [];
  fail: Partial<
    Record<
      "publish" | "apply" | "removeSession" | "insertEvent" | "updateSession" | "purge",
      boolean
    >
  > = {};
  private orgSeq = 0;

  async getPrerequisites() {
    this.calls.push("prereq");
    return this.prereq;
  }
  async getLead(id: string) {
    return this.leads.get(id) ?? null;
  }
  async findActiveSessionByLead(leadId: string) {
    return (
      [...this.sessions.values()].find((s) => s.lead_id === leadId && s.status === "active") ?? null
    );
  }
  async findLatestSessionByLead(leadId: string) {
    const all = [...this.sessions.values()].filter((s) => s.lead_id === leadId);
    return all.sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null;
  }
  async findSessionById(id: string) {
    const s = this.sessions.get(id);
    return s ? { ...s } : null;
  }
  async findSessionByToken(token: string) {
    const s = [...this.sessions.values()].find((x) => x.token === token);
    return s ? { ...s } : null;
  }
  async createOrganization(name: string) {
    this.calls.push("createOrganization");
    const id = `org-${++this.orgSeq}`;
    this.orgs.set(id, name);
    return id;
  }
  async insertSession(row: DemoSessionRow) {
    this.calls.push("insertSession");
    this.sessions.set(row.id, { ...row });
  }
  async updateSession(id: string, patch: Partial<DemoSessionRow>) {
    if (this.fail.updateSession) throw new Error("update falhou");
    const cur = this.sessions.get(id);
    if (!cur) throw new Error("sessão inexistente");
    const next = { ...cur, ...patch };
    this.sessions.set(id, next);
    return { ...next };
  }
  async insertEvent(e: NewDemoEvent) {
    if (this.fail.insertEvent) throw new Error("evento falhou");
    this.events.push(e);
  }
  async listEvents(sessionId: string, limit: number): Promise<DemoEventRow[]> {
    // Contrato da porta: mais recentes primeiro.
    return this.events
      .filter((e) => e.session_id === sessionId)
      .map((e, i) => ({ ...e, id: `ev-${i}` }))
      .reverse()
      .slice(0, limit);
  }
  async publishAssets(_sessionId: string, specs: DemoAssetSpec[]) {
    this.calls.push("publishAssets");
    if (this.fail.publish) throw new Error("upload falhou");
    for (const s of specs) this.assets.add(s.path);
    return new Map(specs.map((s) => [s.key, `https://signed.test/${s.path}`]));
  }
  async purgeAssets(_sessionId: string, keep?: string[]) {
    this.calls.push(keep ? "purgeAssets:keep" : "purgeAssets:all");
    if (this.fail.purge) throw new Error("purge falhou");
    for (const p of [...this.assets]) if (!keep?.includes(p)) this.assets.delete(p);
  }
  async applyScenario(sessionId: string, payload: DemoScenarioPayload) {
    this.calls.push("applyScenario");
    if (this.fail.apply) throw new Error("rpc falhou");
    this.applied.push({ sessionId, payload });
  }
  async removeSession(s: { id: string; organization_id: string }) {
    this.calls.push("removeSession");
    if (this.fail.removeSession) throw new Error("remoção falhou");
    this.sessions.delete(s.id);
    this.orgs.delete(s.organization_id);
  }
}

let port: FakePort;
let t: Date;
let seq: number;
const log = vi.fn();

function service() {
  return createDemoService(port, {
    now: () => t,
    newId: () => `aaaaaaaa-0000-4000-8000-${String(++seq).padStart(12, "0")}`,
    log,
  });
}

beforeEach(() => {
  port = new FakePort();
  t = new Date(T0);
  seq = 0;
  log.mockReset();
  port.leads.set("lead-1", {
    id: "lead-1",
    name: "Ana Souza",
    company: "Praia Bonita Resorts",
    contact: "Ana Souza",
  });
});

const kinds = () => port.events.map((e) => e.kind);

describe("describeMissingPrerequisites", () => {
  it("sem a função no banco: migration da Demo pendente", () => {
    expect(describeMissingPrerequisites(null)).toEqual([
      "A migration da Demo (20261005) ainda não foi aplicada no banco.",
    ]);
  });

  it("nada falta quando tudo existe", () => {
    expect(describeMissingPrerequisites(OK_PREREQ)).toEqual([]);
  });

  it("cada pré-requisito ausente gera sua mensagem; a 20261004 é nomeada", () => {
    const m = describeMissingPrerequisites({ ...OK_PREREQ, rlsInternalOnly: false });
    expect(m).toHaveLength(1);
    expect(m[0]).toMatch(/20261004/);
    expect(describeMissingPrerequisites({ ...OK_PREREQ, npsGuard: false })[0]).toMatch(/NPS/);
    expect(describeMissingPrerequisites({ ...OK_PREREQ, markerGuard: false })[0]).toMatch(
      /marcador/,
    );
    expect(describeMissingPrerequisites({ ...OK_PREREQ, schemaVersion: 0 })[0]).toMatch(
      /desatualizada/,
    );
  });
});

describe("createDemo — pré-requisitos (a Demo NÃO liga sem eles)", () => {
  for (const [label, prereq] of [
    ["função ausente", null],
    ["20261004 não aplicada", { ...OK_PREREQ, rlsInternalOnly: false }],
    ["guarda do NPS ausente", { ...OK_PREREQ, npsGuard: false }],
    ["guarda do marcador ausente", { ...OK_PREREQ, markerGuard: false }],
    ["esquema desatualizado", { ...OK_PREREQ, schemaVersion: 99 }],
  ] as const) {
    it(`recusa com ${label} e NÃO escreve nada`, async () => {
      port.prereq = prereq as DemoPrerequisites | null;
      await expect(
        service().createDemo({ leadId: "lead-1", actorUserId: "u1" }),
      ).rejects.toMatchObject({
        name: "DemoError",
        code: "prerequisites",
      });
      expect(port.orgs.size).toBe(0);
      expect(port.sessions.size).toBe(0);
      expect(port.assets.size).toBe(0);
      expect(port.applied).toHaveLength(0);
      expect(port.calls).toEqual(["prereq"]);
    });
  }
});

describe("createDemo", () => {
  it("cria sessão, organização, arquivos e cenário — nessa ordem — e registra o evento", async () => {
    const view = await service().createDemo({ leadId: "lead-1", actorUserId: "u1" });

    expect(port.calls).toEqual([
      "prereq",
      "createOrganization",
      "insertSession",
      "publishAssets",
      "applyScenario",
    ]);
    expect(kinds()).toEqual(["criada"]);
    expect(port.events[0]).toMatchObject({ actor_user_id: "u1", data: { leadId: "lead-1" } });

    const stored = port.sessions.get(view.id)!;
    expect(stored.cliente_id).toBe(demoClienteId(view.id));
    expect(stored.campanha_id).toBe(demoCampanhaId(view.id));
    expect(stored.lead_id).toBe("lead-1");
    expect(stored.status).toBe("active");
    expect(stored.created_by).toBe("u1");
    expect(isWellFormedDemoToken(stored.token)).toBe(true);
    expect(stored.realtime_key).toMatch(/^[0-9a-f]{32}$/);
    expect(stored.realtime_key).not.toBe(stored.token);
    expect(Date.parse(stored.token_expires_at)).toBe(T0.getTime() + DEMO_TOKEN_TTL_DAYS * DAY);
    expect(port.orgs.get(stored.organization_id)).toBe("Demonstração · Praia Bonita Resorts");
  });

  it("a visão devolvida ao time NUNCA contém o token", async () => {
    const view = await service().createDemo({ leadId: "lead-1", actorUserId: "u1" });
    expect(view).not.toHaveProperty("token");
    expect(JSON.stringify(view)).not.toContain(port.sessions.get(view.id)!.token);
    expect(view.access).toBe("ativo");
  });

  it("o cenário gravado leva o marcador, o nome do lead e URLs dos arquivos publicados", async () => {
    const view = await service().createDemo({ leadId: "lead-1", actorUserId: "u1" });
    const { payload } = port.applied[0];
    expect(payload.cliente.demoSessionId).toBe(view.id);
    expect(payload.cliente.empresa).toBe("Praia Bonita Resorts");
    expect(payload.cliente.responsavel).toBe("Ana Souza");
    const urls = payload.influenciadores.flatMap((r) =>
      r.data.entregas.flatMap((e) => (e.anexos ?? []).map((a) => a.url)),
    );
    expect(urls.length).toBeGreaterThan(0);
    for (const u of urls) expect(u.startsWith("https://signed.test/demo/")).toBe(true);
    for (const path of port.assets) expect(path.startsWith(`demo/${view.id}/`)).toBe(true);
  });

  it("usa o nome do lead quando não há empresa", async () => {
    port.leads.set("lead-2", { id: "lead-2", name: "João Lima", company: "  ", contact: null });
    const view = await service().createDemo({ leadId: "lead-2", actorUserId: "u1" });
    expect(port.orgs.get(port.sessions.get(view.id)!.organization_id)).toBe(
      "Demonstração · João Lima",
    );
    expect(port.applied[0].payload.cliente.empresa).toBe("João Lima");
  });

  it("lead inexistente: erro claro, nada criado", async () => {
    await expect(service().createDemo({ leadId: "nope", actorUserId: "u1" })).rejects.toMatchObject(
      {
        code: "lead_not_found",
      },
    );
    expect(port.orgs.size).toBe(0);
  });

  it("uma demo ATIVA por lead: a segunda é recusada sem criar organização", async () => {
    const s = service();
    await s.createDemo({ leadId: "lead-1", actorUserId: "u1" });
    port.calls.length = 0;
    await expect(s.createDemo({ leadId: "lead-1", actorUserId: "u1" })).rejects.toMatchObject({
      code: "already_active",
    });
    expect(port.calls).not.toContain("createOrganization");
    expect(port.orgs.size).toBe(1);
  });

  it("depois de encerrar, o lead pode ter uma nova demo", async () => {
    const s = service();
    const first = await s.createDemo({ leadId: "lead-1", actorUserId: "u1" });
    await s.closeDemo({ sessionId: first.id, actorUserId: "u1" });
    const second = await s.createDemo({ leadId: "lead-1", actorUserId: "u1" });
    expect(second.id).not.toBe(first.id);
    expect(second.cliente_id).not.toBe(first.cliente_id);
  });

  it("falha ao aplicar o cenário: desfaz TUDO e devolve mensagem segura", async () => {
    port.fail.apply = true;
    const err = await service()
      .createDemo({ leadId: "lead-1", actorUserId: "u1" })
      .catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(DemoError);
    expect((err as Error).message).toMatch(/Nada foi criado/);
    expect((err as Error).message).not.toMatch(/rpc/i);
    expect(port.sessions.size).toBe(0);
    expect(port.orgs.size).toBe(0);
    expect(port.assets.size).toBe(0);
    expect(port.events).toHaveLength(0);
    expect(log).toHaveBeenCalled();
  });

  it("falha ao publicar arquivos: desfaz sessão e organização", async () => {
    port.fail.publish = true;
    await expect(service().createDemo({ leadId: "lead-1", actorUserId: "u1" })).rejects.toThrow(
      /Nada foi criado/,
    );
    expect(port.sessions.size).toBe(0);
    expect(port.orgs.size).toBe(0);
    expect(port.applied).toHaveLength(0);
  });

  it("se até o desfazer falhar, o erro ao usuário continua seguro e o problema é registrado", async () => {
    port.fail.apply = true;
    port.fail.removeSession = true;
    await expect(service().createDemo({ leadId: "lead-1", actorUserId: "u1" })).rejects.toThrow(
      /Nada foi criado/,
    );
    expect(log.mock.calls.some(([m]) => String(m).includes("FALHA ao desfazer"))).toBe(true);
  });

  it("falha ao gravar o evento de ciclo de vida NÃO derruba a criação", async () => {
    port.fail.insertEvent = true;
    const view = await service().createDemo({ leadId: "lead-1", actorUserId: "u1" });
    expect(port.sessions.has(view.id)).toBe(true);
    expect(port.applied).toHaveLength(1);
  });
});

describe("restartDemo", () => {
  it("mesmos ids e MESMO link; limpa só a sobra de arquivos, depois de aplicar", async () => {
    const s = service();
    const view = await s.createDemo({ leadId: "lead-1", actorUserId: "u1" });
    const before = { ...port.sessions.get(view.id)! };
    port.assets.add(`demo/${view.id}/upload-do-cliente.png`); // sobra de um upload feito na demo
    port.calls.length = 0;
    t = new Date(T0.getTime() + 3 * DAY);

    await s.restartDemo({ sessionId: view.id, actorUserId: "u2" });

    expect(port.calls).toEqual(["prereq", "publishAssets", "applyScenario", "purgeAssets:keep"]);
    expect(port.assets.has(`demo/${view.id}/upload-do-cliente.png`)).toBe(false);
    expect(port.assets.size).toBeGreaterThan(5);
    const after = port.sessions.get(view.id)!;
    expect(after.token).toBe(before.token);
    expect(after.token_expires_at).toBe(before.token_expires_at);
    expect(kinds()).toEqual(["criada", "reiniciada"]);
    expect(port.events[1].actor_user_id).toBe("u2");

    // mesmos ids de linha; só as datas acompanham o novo "agora"
    const [first, second] = port.applied;
    expect(second.payload.influenciadores.map((r) => r.id)).toEqual(
      first.payload.influenciadores.map((r) => r.id),
    );
    expect(second.payload.cliente.campanhas[0].dataInicio).not.toBe(
      first.payload.cliente.campanhas[0].dataInicio,
    );
  });

  it("falha no meio: erro seguro e o cenário/arquivos anteriores ficam intactos (nada é apagado)", async () => {
    const s = service();
    const view = await s.createDemo({ leadId: "lead-1", actorUserId: "u1" });
    const assetsBefore = new Set(port.assets);
    port.fail.apply = true;
    port.calls.length = 0;
    await expect(s.restartDemo({ sessionId: view.id, actorUserId: "u1" })).rejects.toThrow(
      /reiniciar/,
    );
    expect(port.calls).not.toContain("purgeAssets:keep");
    expect(port.assets).toEqual(assetsBefore);
    expect(kinds()).toEqual(["criada"]);
  });

  it("falha só na limpeza da sobra: o reinício vale (best-effort) e é registrado", async () => {
    const s = service();
    const view = await s.createDemo({ leadId: "lead-1", actorUserId: "u1" });
    port.fail.purge = true;
    await expect(s.restartDemo({ sessionId: view.id, actorUserId: "u1" })).resolves.toBeDefined();
    expect(kinds()).toEqual(["criada", "reiniciada"]);
  });

  it("recusa demo encerrada, inexistente ou sem pré-requisitos", async () => {
    const s = service();
    const view = await s.createDemo({ leadId: "lead-1", actorUserId: "u1" });
    await expect(s.restartDemo({ sessionId: "nope", actorUserId: "u1" })).rejects.toMatchObject({
      code: "not_found",
    });
    port.prereq = { ...OK_PREREQ, rlsInternalOnly: false };
    await expect(s.restartDemo({ sessionId: view.id, actorUserId: "u1" })).rejects.toMatchObject({
      code: "prerequisites",
    });
    port.prereq = { ...OK_PREREQ };
    await s.closeDemo({ sessionId: view.id, actorUserId: "u1" });
    await expect(s.restartDemo({ sessionId: view.id, actorUserId: "u1" })).rejects.toMatchObject({
      code: "closed",
    });
  });
});

describe("encerrar, revogar e renovar", () => {
  async function created() {
    const s = service();
    const view = await s.createDemo({ leadId: "lead-1", actorUserId: "u1" });
    return { s, id: view.id, token: () => port.sessions.get(view.id)!.token };
  }

  it("encerrar: cliente perde o acesso, evento registrado, idempotente", async () => {
    const { s, id, token } = await created();
    const closed = await s.closeDemo({ sessionId: id, actorUserId: "u1" });
    expect(closed.status).toBe("closed");
    expect(closed.access).toBe("encerrado");
    expect(closed.closed_at).toBe(T0.toISOString());
    expect(await s.resolveAccess(token())).toEqual({ ok: false });
    await s.closeDemo({ sessionId: id, actorUserId: "u1" });
    expect(kinds().filter((k) => k === "encerrada")).toHaveLength(1);
  });

  it("depois de encerrada: não revoga nem renova", async () => {
    const { s, id } = await created();
    await s.closeDemo({ sessionId: id, actorUserId: "u1" });
    await expect(s.revokeAccess({ sessionId: id, actorUserId: "u1" })).rejects.toMatchObject({
      code: "closed",
    });
    await expect(s.renewAccess({ sessionId: id, actorUserId: "u1" })).rejects.toMatchObject({
      code: "closed",
    });
  });

  it("revogar: o link morre, a campanha continua; idempotente (um evento só)", async () => {
    const { s, id, token } = await created();
    const tk = token();
    expect((await s.resolveAccess(tk)).ok).toBe(true);
    const revoked = await s.revokeAccess({ sessionId: id, actorUserId: "u1" });
    expect(revoked.access).toBe("revogado");
    expect(revoked.status).toBe("active");
    expect(await s.resolveAccess(tk)).toEqual({ ok: false });
    await s.revokeAccess({ sessionId: id, actorUserId: "u1" });
    expect(kinds().filter((k) => k === "acesso_revogado")).toHaveLength(1);
  });

  it("renovar uma demo EXPIRADA estende o prazo e mantém o mesmo link", async () => {
    const { s, id, token } = await created();
    const tk = token();
    t = new Date(T0.getTime() + (DEMO_TOKEN_TTL_DAYS + 1) * DAY);
    expect(await s.resolveAccess(tk)).toEqual({ ok: false });
    const renewed = await s.renewAccess({ sessionId: id, actorUserId: "u1" });
    expect(renewed.access).toBe("ativo");
    expect(Date.parse(renewed.token_expires_at)).toBe(t.getTime() + DEMO_TOKEN_TTL_DAYS * DAY);
    expect(token()).toBe(tk);
    expect((await s.resolveAccess(tk)).ok).toBe(true);
    expect(kinds()).toContain("acesso_renovado");
  });

  it("renovar uma demo REVOGADA gera token NOVO — o antigo nunca volta a funcionar", async () => {
    const { s, id, token } = await created();
    const old = token();
    await s.revokeAccess({ sessionId: id, actorUserId: "u1" });
    const renewed = await s.renewAccess({ sessionId: id, actorUserId: "u1" });
    expect(renewed.access).toBe("ativo");
    expect(token()).not.toBe(old);
    expect(isWellFormedDemoToken(token())).toBe(true);
    expect(await s.resolveAccess(old)).toEqual({ ok: false });
    expect((await s.resolveAccess(token())).ok).toBe(true);
    expect(kinds()).toContain("link_gerado");
  });

  it("`newLink` rotaciona o token mesmo com o atual válido", async () => {
    const { s, id, token } = await created();
    const old = token();
    await s.renewAccess({ sessionId: id, actorUserId: "u1", newLink: true });
    expect(token()).not.toBe(old);
    expect(await s.resolveAccess(old)).toEqual({ ok: false });
  });

  it("sessão inexistente: not_found em todas as operações", async () => {
    const s = service();
    for (const op of [
      () => s.closeDemo({ sessionId: "x", actorUserId: "u" }),
      () => s.revokeAccess({ sessionId: "x", actorUserId: "u" }),
      () => s.renewAccess({ sessionId: "x", actorUserId: "u" }),
      () => s.getLink("x"),
    ]) {
      await expect(op()).rejects.toMatchObject({ code: "not_found" });
    }
  });
});

describe("resolveAccess (acesso do cliente)", () => {
  it("token malformado: recusa SEM consultar o banco", async () => {
    const spy = vi.spyOn(port, "findSessionByToken");
    for (const bad of ["", "abc", null, undefined, 1, "x".repeat(43) + "!"]) {
      expect(await service().resolveAccess(bad)).toEqual({ ok: false });
    }
    expect(spy).not.toHaveBeenCalled();
  });

  it("token bem formado mas desconhecido: mesma resposta de qualquer outra falha", async () => {
    expect(await service().resolveAccess("A".repeat(43))).toEqual({ ok: false });
  });

  it("falhas (inexistente, expirada, revogada, encerrada) são INDISTINGUÍVEIS", async () => {
    const s = service();
    const a = await s.createDemo({ leadId: "lead-1", actorUserId: "u1" });
    const tk = port.sessions.get(a.id)!.token;
    t = new Date(T0.getTime() + 20 * DAY);
    const expired = await s.resolveAccess(tk);
    const unknown = await s.resolveAccess("B".repeat(43));
    expect(expired).toEqual(unknown);
    expect(JSON.stringify(expired)).toBe(JSON.stringify(unknown));
  });

  it("primeiro acesso registra o último acesso e o evento; dentro da janela não grava de novo", async () => {
    const s = service();
    const view = await s.createDemo({ leadId: "lead-1", actorUserId: "u1" });
    const tk = port.sessions.get(view.id)!.token;

    t = new Date(T0.getTime() + 60_000);
    expect((await s.resolveAccess(tk)).ok).toBe(true);
    expect(port.sessions.get(view.id)!.last_client_access_at).toBe(t.toISOString());
    expect(kinds()).toEqual(["criada", "cliente_abriu_link"]);

    const stamp = port.sessions.get(view.id)!.last_client_access_at;
    t = new Date(t.getTime() + 60_000);
    await s.resolveAccess(tk);
    expect(port.sessions.get(view.id)!.last_client_access_at).toBe(stamp);

    t = new Date(t.getTime() + 10 * 60_000);
    await s.resolveAccess(tk);
    expect(port.sessions.get(view.id)!.last_client_access_at).toBe(t.toISOString());
    expect(kinds().filter((k) => k === "cliente_abriu_link")).toHaveLength(1);
  });

  it("falha ao registrar o último acesso NUNCA bloqueia o cliente", async () => {
    const s = service();
    const view = await s.createDemo({ leadId: "lead-1", actorUserId: "u1" });
    port.fail.updateSession = true;
    const r = await s.resolveAccess(port.sessions.get(view.id)!.token);
    expect(r.ok).toBe(true);
  });
});

describe("getLink e getDemoForLead", () => {
  it("getLink é o único que devolve o token, com o caminho público", async () => {
    const s = service();
    const view = await s.createDemo({ leadId: "lead-1", actorUserId: "u1" });
    const link = await s.getLink(view.id);
    expect(link.token).toBe(port.sessions.get(view.id)!.token);
    expect(link.path).toBe(`/demo/${link.token}`);
    expect(link.access).toBe("ativo");
  });

  it("sem demo: `session: null`", async () => {
    expect(await service().getDemoForLead("lead-1")).toEqual({ session: null, events: [] });
  });

  it("devolve a ativa (sem token) com os eventos; sem ativa, a mais recente", async () => {
    const s = service();
    const view = await s.createDemo({ leadId: "lead-1", actorUserId: "u1" });
    let r = await s.getDemoForLead("lead-1");
    expect(r.session?.id).toBe(view.id);
    expect(r.session).not.toHaveProperty("token");
    expect(r.events.map((e) => e.kind)).toEqual(["criada"]);

    await s.closeDemo({ sessionId: view.id, actorUserId: "u1" });
    r = await s.getDemoForLead("lead-1");
    expect(r.session?.status).toBe("closed");
    expect(r.session?.access).toBe("encerrado");
  });
});
