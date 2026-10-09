import { describe, expect, it, vi } from "vitest";
import {
  processGoogleOAuthCallback,
  type CallbackDeps,
  type ConnectionRecord,
} from "@/lib/google-oauth-callback";

const NOW = Date.parse("2026-10-09T12:00:00.000Z");
const ACCESS = "access-marker";
const REFRESH = "refresh-marker";
const STATE_USER = "user-from-state";

function res(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function makeDeps(over: Partial<CallbackDeps> = {}) {
  const saved: ConnectionRecord[] = [];
  const logs: { event: string; meta: Record<string, unknown> }[] = [];
  const fetchCalls: { url: string; body?: string }[] = [];
  const deps: CallbackDeps = {
    fetch: (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      fetchCalls.push({ url, body: init?.body ? String(init.body) : undefined });
      if (url.includes("oauth2.googleapis.com/token")) {
        return res(200, { access_token: ACCESS, refresh_token: REFRESH, expires_in: 3600 });
      }
      return res(200, { email: "pessoa@example.com" });
    }) as typeof fetch,
    now: () => NOW,
    getRedirectUri: () => "https://plataforma.example/api/google/oauth-callback",
    getClientCredentials: () => ({ clientId: "cid", clientSecret: "csecret" }),
    consumeState: vi.fn(async () => ({
      user_id: STATE_USER,
      created_at: new Date(NOW - 60_000).toISOString(),
    })),
    saveConnection: vi.fn(async (r: ConnectionRecord) => {
      saved.push(r);
      return null;
    }),
    log: (event, meta) => logs.push({ event, meta }),
    ...over,
  };
  return { deps, saved, logs, fetchCalls };
}

const ok = {
  code: "code-marker",
  state: "state-marker",
  error: null,
  browserBinding: "state-marker",
};

describe("callback OAuth — sucesso", () => {
  it("conecta, grava para o user_id do STATE e zera o estado antigo (reconexão limpa a tela)", async () => {
    const { deps, saved } = makeDeps();
    const out = await processGoogleOAuthCallback(deps, ok);
    expect(out).toEqual({ outcome: "connected" });
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({
      user_id: STATE_USER,
      google_email: "pessoa@example.com",
      access_token: ACCESS,
      refresh_token: REFRESH,
      token_invalid: false,
      last_error: null,
      sync_token: null,
    });
    expect(saved[0].token_expiry).toBe(new Date(NOW + 3600_000).toISOString());
    expect(saved[0].connected_at).toBe(new Date(NOW).toISOString());
  });

  it("usa o mesmo redirect_uri do início e consome o state recebido", async () => {
    const { deps, fetchCalls } = makeDeps();
    await processGoogleOAuthCallback(deps, ok);
    const body = fetchCalls.find((c) => c.url.includes("/token"))!.body!;
    expect(decodeURIComponent(body)).toContain(
      "redirect_uri=https://plataforma.example/api/google/oauth-callback",
    );
    expect(deps.consumeState).toHaveBeenCalledWith("state-marker");
  });

  it("falha ao buscar o e-mail não impede a conexão (e-mail fica nulo)", async () => {
    const { deps, saved } = makeDeps({
      fetch: (async (input: string | URL | Request) =>
        String(input).includes("/token")
          ? res(200, { access_token: ACCESS, refresh_token: REFRESH, expires_in: 3600 })
          : res(500, {})) as typeof fetch,
    });
    expect(await processGoogleOAuthCallback(deps, ok)).toEqual({ outcome: "connected" });
    expect(saved[0].google_email).toBeNull();
  });
});

describe("callback OAuth — falhas controladas", () => {
  it("APP_URL ausente/inválida → app_url_invalid, sem tocar no state", async () => {
    const { deps } = makeDeps({
      getRedirectUri: () => {
        throw new Error("APP_URL não configurada");
      },
    });
    expect(await processGoogleOAuthCallback(deps, ok)).toEqual({
      outcome: "error",
      code: "app_url_invalid",
    });
    expect(deps.consumeState).not.toHaveBeenCalled();
  });

  it.each([
    [{ code: null, state: "s", error: null, browserBinding: "s" }],
    [{ code: "c", state: null, error: null, browserBinding: "s" }],
    [{ code: "c", state: "s", error: "access_denied", browserBinding: "s" }],
  ])("parâmetros ausentes ou negados pelo Google (%j)", async (params) => {
    const { deps, saved } = makeDeps();
    expect(await processGoogleOAuthCallback(deps, params)).toEqual({
      outcome: "error",
      code: "google_denied_or_missing_params",
    });
    expect(saved).toHaveLength(0);
  });

  it("state inexistente ou já usado → state_invalid_or_reused", async () => {
    const { deps, saved } = makeDeps({ consumeState: vi.fn(async () => null) });
    expect(await processGoogleOAuthCallback(deps, ok)).toEqual({
      outcome: "error",
      code: "state_invalid_or_reused",
    });
    expect(saved).toHaveLength(0);
  });

  it("state com mais de 10 minutos → state_expired", async () => {
    const { deps, saved } = makeDeps({
      consumeState: vi.fn(async () => ({
        user_id: STATE_USER,
        created_at: new Date(NOW - 11 * 60_000).toISOString(),
      })),
    });
    expect(await processGoogleOAuthCallback(deps, ok)).toEqual({
      outcome: "error",
      code: "state_expired",
    });
    expect(saved).toHaveLength(0);
  });

  it("credenciais do app ausentes → env_missing", async () => {
    const { deps } = makeDeps({ getClientCredentials: () => null });
    expect(await processGoogleOAuthCallback(deps, ok)).toEqual({
      outcome: "error",
      code: "env_missing",
    });
  });

  it("Google recusa a troca do código (HTTP 400) → token_exchange_failed", async () => {
    const { deps, saved, logs } = makeDeps({
      fetch: (async () =>
        res(400, { error: "invalid_grant", error_description: "segredo-do-erro" })) as typeof fetch,
    });
    expect(await processGoogleOAuthCallback(deps, ok)).toEqual({
      outcome: "error",
      code: "token_exchange_failed",
    });
    expect(saved).toHaveLength(0);
    expect(JSON.stringify(logs)).not.toContain("segredo-do-erro");
  });

  it("falha de rede na troca → token_exchange_failed (sem lançar)", async () => {
    const { deps } = makeDeps({
      fetch: (async () => {
        throw new TypeError("fetch failed");
      }) as typeof fetch,
    });
    expect(await processGoogleOAuthCallback(deps, ok)).toEqual({
      outcome: "error",
      code: "token_exchange_failed",
    });
  });

  it("resposta sem refresh_token → no_refresh_token e nada é gravado", async () => {
    const { deps, saved } = makeDeps({
      fetch: (async () => res(200, { access_token: ACCESS, expires_in: 3600 })) as typeof fetch,
    });
    expect(await processGoogleOAuthCallback(deps, ok)).toEqual({
      outcome: "error",
      code: "no_refresh_token",
    });
    expect(saved).toHaveLength(0);
  });

  it("falha ao gravar a conexão → db_upsert_failed (código do banco só no log)", async () => {
    const { deps, logs } = makeDeps({
      saveConnection: vi.fn(async () => ({ errorCode: "23505" })),
    });
    expect(await processGoogleOAuthCallback(deps, ok)).toEqual({
      outcome: "error",
      code: "db_upsert_failed",
    });
    expect(logs.at(-1)?.meta).toMatchObject({ code: "db_upsert_failed", dbCode: "23505" });
  });

  it("nenhum log contém tokens, código OAuth ou e-mail", async () => {
    const { deps, logs } = makeDeps();
    await processGoogleOAuthCallback(deps, ok);
    const failing = makeDeps({ saveConnection: vi.fn(async () => ({ errorCode: "X" })) });
    await processGoogleOAuthCallback(failing.deps, ok);
    const dump = JSON.stringify([...logs, ...failing.logs]);
    for (const secret of [ACCESS, REFRESH, "code-marker", "state-marker", "pessoa@example.com"]) {
      expect(dump).not.toContain(secret);
    }
  });
});

describe("callback OAuth — state vinculado ao navegador que iniciou", () => {
  it.each([
    ["sem cookie (outro navegador / cookie bloqueado ou expirado)", null],
    ["cookie de OUTRA tentativa (state diferente)", "outro-state-marker"],
    ["cookie vazio", ""],
  ] as const)(
    "%s → state_not_bound_to_browser, sem consumir o state nem trocar o código",
    async (_n, binding) => {
      const { deps, saved, fetchCalls } = makeDeps();
      const out = await processGoogleOAuthCallback(deps, { ...ok, browserBinding: binding });
      expect(out).toEqual({ outcome: "error", code: "state_not_bound_to_browser" });
      // um callback não vinculado não queima o state legítimo nem chega ao Google
      expect(deps.consumeState).not.toHaveBeenCalled();
      expect(fetchCalls).toHaveLength(0);
      expect(saved).toHaveLength(0);
    },
  );

  it("cookie de mesmo tamanho mas diferente também é rejeitado (comparação em tempo constante)", async () => {
    const { deps } = makeDeps();
    const out = await processGoogleOAuthCallback(deps, {
      ...ok,
      browserBinding: "state-marker".replace("k", "x"),
    });
    expect(out).toMatchObject({ outcome: "error", code: "state_not_bound_to_browser" });
  });

  it("várias tentativas: só a última (cookie mais recente) conclui; as anteriores não são aceitas", async () => {
    const { deps } = makeDeps();
    // o navegador guarda o cookie da 2ª tentativa
    const first = await processGoogleOAuthCallback(deps, {
      ...ok,
      state: "state-tentativa-1",
      browserBinding: "state-tentativa-2",
    });
    expect(first).toMatchObject({ outcome: "error", code: "state_not_bound_to_browser" });
    const second = await processGoogleOAuthCallback(deps, {
      ...ok,
      state: "state-tentativa-2",
      browserBinding: "state-tentativa-2",
    });
    expect(second).toEqual({ outcome: "connected" });
  });

  it("state reutilizado (cookie correto, mas já consumido) → state_invalid_or_reused", async () => {
    let used = false;
    const { deps } = makeDeps({
      consumeState: vi.fn(async () => {
        if (used) return null;
        used = true;
        return { user_id: STATE_USER, created_at: new Date(NOW - 1000).toISOString() };
      }),
    });
    expect(await processGoogleOAuthCallback(deps, ok)).toEqual({ outcome: "connected" });
    expect(await processGoogleOAuthCallback(deps, ok)).toEqual({
      outcome: "error",
      code: "state_invalid_or_reused",
    });
  });

  it("o valor do cookie nunca aparece nos logs", async () => {
    const { deps, logs } = makeDeps();
    await processGoogleOAuthCallback(deps, { ...ok, browserBinding: "cookie-secreto-marker" });
    expect(JSON.stringify(logs)).not.toContain("cookie-secreto-marker");
  });
});
