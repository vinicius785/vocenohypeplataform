import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import {
  handleMetaDeletionCallback,
  metaUserHash,
  type DeletionRepo,
  type DeletionRow,
} from "../meta-data-deletion";
import {
  InstagramClient,
  InstagramError,
  buildAuthorizeUrl,
  demographicEntries,
  type InstagramSnapshot,
} from "./instagram-client";
import {
  completeOAuth,
  createConnectLink,
  disconnect,
  getPublicLinkInfo,
  instagramDeletionStore,
  refreshExpiringTokens,
  startOAuth,
  syncMetrics,
  toPublicConnection,
  type ConnectionRow,
  type Deps,
  type InstagramRepo,
  type LinkRow,
} from "./instagram-service";
import { decryptToken, encryptToken } from "./token-crypto";

const APP_SECRET = "ig-app-secret-de-teste";
const HASH_KEY = "meta-app-secret-de-teste";
const REDIRECT = "https://plataforma.vocenohype.com.br/api/instagram/oauth-callback";
const T0 = new Date("2026-10-10T12:00:00Z");
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe("criptografia do token", () => {
  it("ida e volta; não deixa o token em claro; segredo errado ou adulteração devolvem null", () => {
    const enc = encryptToken("IGQWtoken-secreto", APP_SECRET);
    expect(enc.startsWith("v1.")).toBe(true);
    expect(enc).not.toContain("IGQWtoken-secreto");
    expect(decryptToken(enc, APP_SECRET)).toBe("IGQWtoken-secreto");
    expect(decryptToken(enc, "outro")).toBeNull();
    expect(decryptToken(enc.slice(0, -3) + "AAA", APP_SECRET)).toBeNull();
    expect(decryptToken("lixo", APP_SECRET)).toBeNull();
    expect(encryptToken("x", APP_SECRET)).not.toBe(encryptToken("x", APP_SECRET)); // IV aleatório
  });
});

describe("URL de autorização", () => {
  it("usa só as duas permissões de leitura, state e redirect exato", () => {
    const u = new URL(buildAuthorizeUrl({ appId: "123", redirectUri: REDIRECT, state: "abc" }));
    expect(u.origin + u.pathname).toBe("https://www.instagram.com/oauth/authorize");
    expect(u.searchParams.get("scope")).toBe(
      "instagram_business_basic,instagram_business_manage_insights",
    );
    expect(u.searchParams.get("response_type")).toBe("code");
    expect(u.searchParams.get("state")).toBe("abc");
    expect(u.searchParams.get("redirect_uri")).toBe(REDIRECT);
    expect(u.searchParams.get("client_id")).toBe("123");
    expect(u.toString()).not.toMatch(/publish|messages|comments/);
  });
});

describe("cliente da API", () => {
  const mk = (handler: (url: URL, init?: RequestInit) => Response) =>
    new InstagramClient({ appId: "123", appSecret: APP_SECRET }, (async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ) => handler(new URL(String(input)), init)) as typeof fetch);

  it("troca o código (formato com `data` e formato plano) e lê as permissões", async () => {
    const calls: { url: string; body: string }[] = [];
    const c = mk((u, init) => {
      calls.push({ url: u.toString(), body: String(init?.body) });
      return json({
        data: [
          {
            access_token: "SHORT",
            user_id: 99,
            permissions: "instagram_business_basic,instagram_business_manage_insights",
          },
        ],
      });
    });
    const r = await c.exchangeCode("CODE", REDIRECT);
    expect(r).toEqual({
      shortToken: "SHORT",
      appUserId: "99",
      permissions: ["instagram_business_basic", "instagram_business_manage_insights"],
    });
    expect(calls[0].url).toBe("https://api.instagram.com/oauth/access_token");
    expect(calls[0].body).toContain("grant_type=authorization_code");
    const flat = mk(() => json({ access_token: "S2", user_id: "7", permissions: ["a"] }));
    expect(await flat.exchangeCode("C", REDIRECT)).toMatchObject({
      shortToken: "S2",
      appUserId: "7",
      permissions: ["a"],
    });
  });

  it("código inválido, 429 e 500 viram erros com código estável, sem vazar token ou segredo", async () => {
    const bad = mk(() =>
      json(
        { error_type: "OAuthException", code: 400, error_message: "Invalid code SEGREDO-123" },
        400,
      ),
    );
    const e1 = await bad.exchangeCode("x", REDIRECT).catch((e) => e);
    expect(e1).toBeInstanceOf(InstagramError);
    expect(e1.code).toBe("invalid_code");
    expect(String(e1.message)).not.toContain("SEGREDO");
    expect(
      (
        await mk(() => json({}, 429))
          .exchangeCode("x", REDIRECT)
          .catch((e) => e)
      ).code,
    ).toBe("rate_limited");
    expect(
      (
        await mk(() => json({}, 503))
          .exchangeCode("x", REDIRECT)
          .catch((e) => e)
      ).code,
    ).toBe("unavailable");
  });

  it("token longo, renovação e perfil", async () => {
    const urls: string[] = [];
    const c = mk((u) => {
      urls.push(u.pathname);
      if (u.pathname === "/access_token")
        return json({ access_token: "LONG", token_type: "bearer", expires_in: 5183944 });
      if (u.pathname === "/refresh_access_token")
        return json({ access_token: "LONG2", expires_in: 5000000 });
      return json({
        user_id: "555",
        username: "ana",
        account_type: "CREATOR",
        followers_count: 1200,
        follows_count: 10,
        media_count: 40,
      });
    });
    expect(await c.toLongLived("S")).toEqual({ accessToken: "LONG", expiresInSec: 5183944 });
    expect(await c.refresh("LONG")).toEqual({ accessToken: "LONG2", expiresInSec: 5000000 });
    expect(await c.profile("T")).toMatchObject({ userId: "555", username: "ana", followers: 1200 });
    expect(urls).toEqual(["/access_token", "/refresh_access_token", "/me"]);
  });

  it("snapshot: totais de 30 dias + demografia; métrica indisponível não derruba o resto", async () => {
    const c = mk((u) => {
      if (u.pathname === "/me")
        return json({
          user_id: "555",
          username: "ana",
          account_type: "BUSINESS",
          followers_count: 5000,
          media_count: 8,
        });
      const metric = u.searchParams.get("metric");
      if (metric === "saves") return json({ error: { code: 100, message: "indisponível" } }, 400);
      if (metric === "follower_demographics") {
        const b = u.searchParams.get("breakdown");
        const results =
          b === "gender"
            ? [
                { dimension_values: ["F"], value: 60 },
                { dimension_values: ["M"], value: 40 },
              ]
            : b === "age"
              ? [
                  { dimension_values: ["25-34"], value: 50 },
                  { dimension_values: ["18-24"], value: 50 },
                ]
              : [];
        return json({ data: [{ total_value: { breakdowns: [{ results }] } }] });
      }
      const v: Record<string, number> = {
        reach: 1000,
        views: 4000,
        accounts_engaged: 200,
        total_interactions: 150,
        likes: 100,
        comments: 20,
        shares: 10,
      };
      return json({ data: [{ total_value: { value: v[metric!] ?? 0 } }] });
    });
    const s = await c.snapshot("T", "555", T0);
    expect(s.totals).toMatchObject({ reach: 1000, views: 4000, totalInteractions: 150 });
    expect(s.totals.saves).toBeUndefined();
    expect(s.interactionRateByReach).toBe(15);
    expect(s.demographics.gender).toEqual([
      { id: "gender:F", label: "Feminino", percentual: 60 },
      { id: "gender:M", label: "Masculino", percentual: 40 },
    ]);
    expect(s.demographics.age?.map((e) => e.percentual)).toEqual([50, 50]);
    expect(s.demographics.city).toBeUndefined();
    expect(s.windowDays).toBe(30);
  });

  it("token inválido interrompe o snapshot (não o mascara como 'sem dados')", async () => {
    const c = mk((u) =>
      u.pathname === "/me"
        ? json({ user_id: "1", username: "x" })
        : json({ error: { code: 190, message: "Invalid OAuth access token" } }, 401),
    );
    expect((await c.snapshot("T", "1", T0).catch((e) => e)).code).toBe("token_invalid");
  });

  it("demografia: percentuais, rótulos e ordenação", () => {
    expect(demographicEntries({ data: [] }, "age")).toBeUndefined();
    const d = demographicEntries(
      {
        data: [
          {
            total_value: {
              breakdowns: [
                {
                  results: [
                    { dimension_values: ["U"], value: 1 },
                    { dimension_values: ["F"], value: 3 },
                  ],
                },
              ],
            },
          },
        ],
      },
      "gender",
    )!;
    expect(d.map((e) => [e.label, e.percentual])).toEqual([
      ["Feminino", 75],
      ["Não informado", 25],
    ]);
  });
});

/* ---------- serviço ---------- */
function memRepo() {
  const links: (LinkRow & { tokenHash: string; stateHash: string | null })[] = [];
  const conns = new Map<string, ConnectionRow & { igUserHash: string; igAppUserHash: string }>();
  const names = new Map<string, string>([
    ["inf-1", "Ana Souza"],
    ["inf-2", "Bruno Lima"],
  ]);
  let n = 0;
  const repo: InstagramRepo = {
    async influencerName(id) {
      return names.get(id) ?? null;
    },
    async insertLink(i) {
      links.push({
        id: `l${++n}`,
        influenciadorId: i.influenciadorId,
        expiresAt: i.expiresAt,
        usedAt: null,
        tokenHash: i.tokenHash,
        stateHash: null,
      });
    },
    async findLinkByTokenHash(h) {
      return links.find((l) => l.tokenHash === h) ?? null;
    },
    async setLinkState(id, h) {
      links.find((l) => l.id === id)!.stateHash = h;
    },
    async findLinkByStateHash(h) {
      return links.find((l) => l.stateHash === h) ?? null;
    },
    async markLinkUsed(id) {
      links.find((l) => l.id === id)!.usedAt = T0.toISOString();
    },
    async upsertConnection(c) {
      conns.set(c.influenciadorId, { ...c, lastSyncError: null });
    },
    async getConnection(id) {
      return conns.get(id) ?? null;
    },
    async updateConnection(id, p) {
      Object.assign(conns.get(id)!, p);
    },
    async deleteConnection(id) {
      return conns.delete(id);
    },
    async listConnectedExpiringBefore(iso) {
      return [...conns.values()].filter((c) => c.status === "connected" && c.tokenExpiresAt < iso);
    },
    async deleteByUserHash(h) {
      let k = 0;
      for (const [id, c] of conns)
        if (c.igUserHash === h || c.igAppUserHash === h) {
          conns.delete(id);
          k++;
        }
      return k;
    },
  };
  return { repo, links, conns };
}

const SNAP: InstagramSnapshot = {
  fetchedAt: T0.toISOString(),
  windowDays: 30,
  profile: { username: "ana", accountType: "CREATOR", followers: 5000, follows: 1, media: 8 },
  totals: { reach: 1000, totalInteractions: 100 },
  interactionRateByReach: 10,
  demographics: {},
};

function fakeClient(over: Partial<Record<string, unknown>> = {}) {
  const calls: string[] = [];
  const client = {
    exchangeCode: async () => {
      calls.push("exchange");
      return {
        shortToken: "SHORT",
        appUserId: "APP-1",
        permissions: ["instagram_business_basic", "instagram_business_manage_insights"],
      };
    },
    toLongLived: async () => ({ accessToken: "LONG-TOKEN", expiresInSec: 60 * 86400 }),
    refresh: async () => {
      calls.push("refresh");
      return { accessToken: "REFRESHED-TOKEN", expiresInSec: 60 * 86400 };
    },
    profile: async () => ({
      userId: "IG-1",
      username: "ana",
      accountType: "CREATOR",
      followers: 5000,
      follows: 1,
      media: 8,
    }),
    snapshot: async () => {
      calls.push("snapshot");
      return SNAP;
    },
    ...over,
  } as unknown as InstagramClient;
  return { client, calls };
}

function setup(over: Partial<Record<string, unknown>> = {}) {
  const m = memRepo();
  const f = fakeClient(over);
  let r = 0;
  const deps: Deps = {
    repo: m.repo,
    client: f.client,
    appSecret: APP_SECRET,
    appId: "123",
    hashKey: HASH_KEY,
    redirectUri: REDIRECT,
    now: () => T0,
    rand: () => `rand-${"x".repeat(30)}-${++r}`,
  };
  return { ...m, ...f, deps };
}

async function connectFlow(s: ReturnType<typeof setup>) {
  const { token } = await createConnectLink(s.deps, { influenciadorId: "inf-1", createdBy: "u1" });
  const { url } = await startOAuth(s.deps, token);
  const state = new URL(url).searchParams.get("state")!;
  return { token, state };
}

afterEach(() => vi.restoreAllMocks());

describe("link de conexão", () => {
  it("guarda só o hash do token; influenciador inexistente é recusado", async () => {
    const s = setup();
    const { token, expiresAt } = await createConnectLink(s.deps, {
      influenciadorId: "inf-1",
      createdBy: "u1",
    });
    expect(s.links[0].tokenHash).toBe(sha(token));
    expect(JSON.stringify(s.links)).not.toContain(token);
    expect(new Date(expiresAt).getTime() - T0.getTime()).toBe(7 * 86400_000);
    await expect(
      createConnectLink(s.deps, { influenciadorId: "nada", createdBy: "u1" }),
    ).rejects.toBeInstanceOf(InstagramError);
  });

  it("estados do link e só o primeiro nome na página pública", async () => {
    const s = setup();
    const { token } = await createConnectLink(s.deps, {
      influenciadorId: "inf-1",
      createdBy: null,
    });
    expect(await getPublicLinkInfo(s.deps, token)).toEqual({ state: "valid", firstName: "Ana" });
    expect((await getPublicLinkInfo(s.deps, "curto")).state).toBe("invalid");
    expect((await getPublicLinkInfo(s.deps, "z".repeat(43))).state).toBe("invalid");
    s.links[0].expiresAt = new Date(T0.getTime() - 1000).toISOString();
    expect((await getPublicLinkInfo(s.deps, token)).state).toBe("expired");
    s.links[0].expiresAt = new Date(T0.getTime() + 1000).toISOString();
    s.links[0].usedAt = T0.toISOString();
    expect((await getPublicLinkInfo(s.deps, token)).state).toBe("used");
  });

  it("iniciar com link inválido não gera URL do Instagram", async () => {
    const s = setup();
    await expect(startOAuth(s.deps, "z".repeat(43))).rejects.toBeInstanceOf(InstagramError);
  });
});

describe("OAuth (callback)", () => {
  it("sucesso: token criptografado, hashes de identidade, link marcado como usado", async () => {
    const s = setup();
    const { state } = await connectFlow(s);
    expect(await completeOAuth(s.deps, { code: "CODE", state })).toBe("ok");
    const c = s.conns.get("inf-1")!;
    expect(c.tokenEnc).not.toContain("LONG-TOKEN");
    expect(decryptToken(c.tokenEnc, APP_SECRET)).toBe("LONG-TOKEN");
    expect(c.igUserHash).toBe(metaUserHash("IG-1", HASH_KEY));
    expect(c.igAppUserHash).toBe(metaUserHash("APP-1", HASH_KEY));
    expect(new Date(c.tokenExpiresAt).getTime() - T0.getTime()).toBe(60 * 86400_000);
    expect(s.links[0].usedAt).not.toBeNull();
    expect(c.snapshot?.totals.reach).toBe(1000);
  });

  it("repetir o mesmo redirect (replay) e state desconhecido são recusados", async () => {
    const s = setup();
    const { state } = await connectFlow(s);
    await completeOAuth(s.deps, { code: "CODE", state });
    expect(await completeOAuth(s.deps, { code: "CODE", state })).toBe("invalido");
    expect(await completeOAuth(s.deps, { code: "C", state: "desconhecido" })).toBe("invalido");
    expect(await completeOAuth(s.deps, { code: "C", state: null })).toBe("invalido");
    expect(s.calls.filter((c) => c === "exchange")).toHaveLength(1);
  });

  it("usuário nega: nada é guardado; link expirado no meio: 'expirado'", async () => {
    const s = setup();
    const { state } = await connectFlow(s);
    expect(await completeOAuth(s.deps, { error: "access_denied", state })).toBe("negado");
    expect(s.conns.size).toBe(0);
    s.links[0].expiresAt = new Date(T0.getTime() - 1).toISOString();
    expect(await completeOAuth(s.deps, { code: "C", state })).toBe("expirado");
  });

  it("permissões incompletas ou falha na troca: nada é guardado", async () => {
    const s1 = setup({
      exchangeCode: async () => ({
        shortToken: "S",
        appUserId: "A",
        permissions: ["instagram_business_basic"],
      }),
    });
    const a = await connectFlow(s1);
    expect(await completeOAuth(s1.deps, { code: "C", state: a.state })).toBe("permissao");
    expect(s1.conns.size).toBe(0);
    const s2 = setup({
      exchangeCode: async () => {
        throw new InstagramError("invalid_code");
      },
    });
    const b = await connectFlow(s2);
    expect(await completeOAuth(s2.deps, { code: "C", state: b.state })).toBe("erro");
    expect(s2.conns.size).toBe(0);
    expect(s2.links[0].usedAt).toBeNull(); // pode tentar de novo com o mesmo link
  });

  it("reconectar substitui a conexão do mesmo influenciador (uma só)", async () => {
    const s = setup();
    const a = await connectFlow(s);
    await completeOAuth(s.deps, { code: "C", state: a.state });
    const b = await connectFlow(s);
    await completeOAuth(s.deps, { code: "C", state: b.state });
    expect(s.conns.size).toBe(1);
  });
});

describe("métricas e renovação", () => {
  async function connected() {
    const s = setup();
    const { state } = await connectFlow(s);
    await completeOAuth(s.deps, { code: "C", state });
    s.calls.length = 0;
    return s;
  }

  it("atualiza o snapshot sem renovar token longe do vencimento", async () => {
    const s = await connected();
    const out = await syncMetrics(s.deps, "inf-1");
    expect(out.snapshot?.totals.reach).toBe(1000);
    expect(s.calls).toEqual(["snapshot"]);
  });

  it("renova o token quando faltam ≤ 14 dias e guarda o novo criptografado", async () => {
    const s = await connected();
    s.conns.get("inf-1")!.tokenExpiresAt = new Date(T0.getTime() + 10 * 86400_000).toISOString();
    await syncMetrics(s.deps, "inf-1");
    expect(s.calls).toEqual(["refresh", "snapshot"]);
    const c = s.conns.get("inf-1")!;
    expect(decryptToken(c.tokenEnc, APP_SECRET)).toBe("REFRESHED-TOKEN");
    expect(new Date(c.tokenExpiresAt).getTime() - T0.getTime()).toBe(60 * 86400_000);
  });

  it("token revogado marca 'expired' com erro estável; token vencido não é usado", async () => {
    const s = await connected();
    s.deps.client.snapshot = async () => {
      throw new InstagramError("token_invalid");
    };
    const out = await syncMetrics(s.deps, "inf-1");
    expect(out.status).toBe("expired");
    expect(out.lastSyncError).toBe("token_invalid");
    const s2 = await connected();
    s2.conns.get("inf-1")!.tokenExpiresAt = new Date(T0.getTime() - 1).toISOString();
    expect((await syncMetrics(s2.deps, "inf-1")).status).toBe("expired");
    expect(s2.calls).toEqual([]);
  });

  it("rotina diária renova só quem vence em até 14 dias", async () => {
    const s = await connected();
    expect(await refreshExpiringTokens(s.deps)).toEqual({ checked: 0, expired: 0 });
    s.conns.get("inf-1")!.tokenExpiresAt = new Date(T0.getTime() + 5 * 86400_000).toISOString();
    expect(await refreshExpiringTokens(s.deps)).toEqual({ checked: 1, expired: 0 });
    expect(s.calls).toContain("refresh");
  });

  it("sem conexão: resposta 'não conectado'; desconectar apaga tudo", async () => {
    const s = await connected();
    expect((await syncMetrics(s.deps, "inf-2")).connected).toBe(false);
    expect(await disconnect(s.deps, "inf-1")).toBe(true);
    expect(s.conns.size).toBe(0);
  });
});

describe("privacidade", () => {
  it("o que o navegador recebe nunca tem token, IDs do Instagram ou hashes", async () => {
    const s = setup();
    const { state } = await connectFlow(s);
    await completeOAuth(s.deps, { code: "C", state });
    const pub = toPublicConnection(s.conns.get("inf-1")!);
    const text = JSON.stringify(pub);
    for (const secret of [
      "LONG-TOKEN",
      "IG-1",
      "APP-1",
      s.conns.get("inf-1")!.tokenEnc,
      s.conns.get("inf-1")!.igUserHash,
    ])
      expect(text).not.toContain(secret);
    expect(Object.keys(pub).sort()).toEqual([
      "accountType",
      "connected",
      "lastSyncAt",
      "lastSyncError",
      "snapshot",
      "status",
      "tokenExpiresAt",
      "username",
    ]);
  });

  it("nenhum console recebe token ou segredo durante conectar, sincronizar e falhar", async () => {
    const spies = (["log", "info", "warn", "error"] as const).map((k) =>
      vi.spyOn(console, k).mockImplementation(() => {}),
    );
    const s = setup();
    const { state } = await connectFlow(s);
    await completeOAuth(s.deps, { code: "C", state });
    s.deps.client.snapshot = async () => {
      throw new InstagramError("unavailable");
    };
    await syncMetrics(s.deps, "inf-1");
    expect(spies.every((sp) => sp.mock.calls.length === 0)).toBe(true);
  });
});

describe("exclusão de dados da Meta (integração real)", () => {
  const b64 = (v: string | Buffer) => Buffer.from(v).toString("base64url");
  const signed = (userId: string, secret: string) => {
    const p = b64(JSON.stringify({ algorithm: "HMAC-SHA256", user_id: userId, issued_at: 1 }));
    return `${b64(createHmac("sha256", secret).update(p).digest())}.${p}`;
  };
  function memDeletionRepo(): DeletionRepo {
    const rows: (DeletionRow & { hash: string; issuedAt: number })[] = [];
    return {
      async findByUserAndIssued(h, i) {
        return rows.find((r) => r.hash === h && r.issuedAt === i) ?? null;
      },
      async insert({ code, hash, issuedAt }) {
        const r = {
          id: `r${rows.length}`,
          confirmationCode: code,
          status: "received" as const,
          summary: {},
          createdAt: "",
          completedAt: null,
          hash,
          issuedAt,
        };
        rows.push(r);
        return r;
      },
      async update(id, p) {
        const r = rows.find((x) => x.id === id)!;
        r.status = p.status;
        if (p.summary) r.summary = p.summary;
      },
      async findByCode(c) {
        return rows.find((r) => r.confirmationCode === c) ?? null;
      },
    };
  }

  async function twoConnected() {
    const s = setup();
    for (const id of ["inf-1", "inf-2"]) {
      const idx = id === "inf-1" ? 1 : 2;
      s.deps.client.exchangeCode = async () => ({
        shortToken: "S",
        appUserId: `APP-${idx}`,
        permissions: ["instagram_business_basic", "instagram_business_manage_insights"],
      });
      s.deps.client.profile = async () => ({
        userId: `IG-${idx}`,
        username: `u${idx}`,
        accountType: "CREATOR",
        followers: 1,
        follows: 1,
        media: 1,
      });
      const { token } = await createConnectLink(s.deps, { influenciadorId: id, createdBy: null });
      const { url } = await startOAuth(s.deps, token);
      await completeOAuth(s.deps, { code: "C", state: new URL(url).searchParams.get("state") });
    }
    return s;
  }

  it("pedido assinado da Meta apaga SÓ a conexão daquela identidade (por ID do app ou do Instagram)", async () => {
    const s = await twoConnected();
    const out = await handleMetaDeletionCallback({
      signedRequest: signed("APP-1", "ig-secret"),
      appSecrets: ["meta-secret", "ig-secret"], // assinado com o segredo do produto Instagram
      hashKey: HASH_KEY,
      appUrl: () => "https://plataforma.vocenohype.com.br",
      repo: memDeletionRepo(),
      stores: [instagramDeletionStore(s.repo)],
    });
    expect(out.status).toBe(200);
    expect([...s.conns.keys()]).toEqual(["inf-2"]); // outro influenciador intacto
    const out2 = await handleMetaDeletionCallback({
      signedRequest: signed("IG-2", "meta-secret"),
      appSecrets: ["meta-secret", "ig-secret"],
      hashKey: HASH_KEY,
      appUrl: () => "https://plataforma.vocenohype.com.br",
      repo: memDeletionRepo(),
      stores: [instagramDeletionStore(s.repo)],
    });
    expect(out2.status).toBe(200);
    expect(s.conns.size).toBe(0);
  });

  it("assinatura com segredo desconhecido não apaga nada", async () => {
    const s = await twoConnected();
    const out = await handleMetaDeletionCallback({
      signedRequest: signed("APP-1", "segredo-de-outro"),
      appSecrets: ["meta-secret", "ig-secret"],
      hashKey: HASH_KEY,
      appUrl: () => "x",
      repo: memDeletionRepo(),
      stores: [instagramDeletionStore(s.repo)],
    });
    expect(out.status).toBe(400);
    expect(s.conns.size).toBe(2);
  });
});
