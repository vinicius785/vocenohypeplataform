import { describe, expect, it, vi } from "vitest";
import {
  REAUTH_MESSAGE,
  ensureAccessToken,
  transientMessage,
  type ConnectionTokenStore,
  type GoogleConnectionTokens,
  type RefreshDeps,
} from "@/lib/google-token";

/**
 * Renovação do access token, sem o Google real: `fetch` e o armazenamento são simulados. Os valores
 * abaixo são marcadores de teste, não credenciais.
 */

const NOW = Date.parse("2026-10-09T12:00:00.000Z");
const OLD_REFRESH = "old-refresh-marker";
const NEW_REFRESH = "new-refresh-marker";
const ACCESS = "access-marker";

const expired: GoogleConnectionTokens = {
  user_id: "user-a",
  access_token: "stale-access-marker",
  refresh_token: OLD_REFRESH,
  token_expiry: new Date(NOW - 5 * 60_000).toISOString(),
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function makeStore(overrides: Partial<ConnectionTokenStore> = {}) {
  const store = {
    saveRefreshed: vi.fn(async () => true),
    markReauthRequired: vi.fn(async () => true),
    recordTransientError: vi.fn(async () => true),
    ...overrides,
  } satisfies ConnectionTokenStore;
  return store;
}

function makeDeps(fetchImpl: typeof fetch, store: ConnectionTokenStore) {
  const logs: { event: string; meta: Record<string, unknown> }[] = [];
  const deps: RefreshDeps = {
    fetch: fetchImpl,
    clientId: "client-id-marker",
    clientSecret: "client-secret-marker",
    store,
    now: () => NOW,
    log: (event, meta) => logs.push({ event, meta }),
  };
  return { deps, logs };
}

describe("ensureAccessToken — token ainda válido", () => {
  it("não chama o Google quando faltam mais de 60 s para expirar", async () => {
    const fetchSpy = vi.fn();
    const store = makeStore();
    const { deps } = makeDeps(fetchSpy as unknown as typeof fetch, store);
    const out = await ensureAccessToken(deps, {
      ...expired,
      access_token: ACCESS,
      token_expiry: new Date(NOW + 10 * 60_000).toISOString(),
    });
    expect(out).toEqual({ kind: "ok", accessToken: ACCESS, refreshed: false, persisted: true });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(store.saveRefreshed).not.toHaveBeenCalled();
  });

  it("renova quando faltam menos de 60 s", async () => {
    const fetchSpy = vi.fn(async () =>
      jsonResponse(200, { access_token: ACCESS, expires_in: 3600 }),
    );
    const { deps } = makeDeps(fetchSpy as unknown as typeof fetch, makeStore());
    const out = await ensureAccessToken(deps, {
      ...expired,
      token_expiry: new Date(NOW + 30_000).toISOString(),
    });
    expect(out.kind).toBe("ok");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

describe("ensureAccessToken — renovação bem-sucedida", () => {
  it("com novo refresh_token: persiste os dois", async () => {
    const store = makeStore();
    const fetchImpl = vi.fn(async () =>
      jsonResponse(200, { access_token: ACCESS, expires_in: 1800, refresh_token: NEW_REFRESH }),
    );
    const { deps } = makeDeps(fetchImpl as unknown as typeof fetch, store);
    const out = await ensureAccessToken(deps, expired);
    expect(out).toEqual({ kind: "ok", accessToken: ACCESS, refreshed: true, persisted: true });
    expect(store.saveRefreshed).toHaveBeenCalledWith("user-a", {
      access_token: ACCESS,
      token_expiry: new Date(NOW + 1800 * 1000).toISOString(),
      refresh_token: NEW_REFRESH,
    });
  });

  it("sem novo refresh_token: NÃO sobrescreve o existente (a chave nem é enviada ao banco)", async () => {
    const store = makeStore();
    const fetchImpl = vi.fn(async () =>
      jsonResponse(200, { access_token: ACCESS, expires_in: 3600 }),
    );
    const { deps } = makeDeps(fetchImpl as unknown as typeof fetch, store);
    await ensureAccessToken(deps, expired);
    const saved = vi.mocked(store.saveRefreshed).mock.calls[0][1] as Record<string, unknown>;
    expect("refresh_token" in saved).toBe(false);
    expect(saved.access_token).toBe(ACCESS);
  });

  it("pede ao Google com grant_type=refresh_token e o refresh_token guardado", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(200, { access_token: ACCESS, expires_in: 3600 }),
    );
    const { deps } = makeDeps(fetchImpl as unknown as typeof fetch, makeStore());
    await ensureAccessToken(deps, expired);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://oauth2.googleapis.com/token");
    const body = (init.body as URLSearchParams).toString();
    expect(body).toContain("grant_type=refresh_token");
    expect(body).toContain(`refresh_token=${OLD_REFRESH}`);
  });

  it("expires_in ausente usa 1 h", async () => {
    const store = makeStore();
    const fetchImpl = vi.fn(async () => jsonResponse(200, { access_token: ACCESS }));
    const { deps } = makeDeps(fetchImpl as unknown as typeof fetch, store);
    await ensureAccessToken(deps, expired);
    expect(
      (vi.mocked(store.saveRefreshed).mock.calls[0][1] as { token_expiry: string }).token_expiry,
    ).toBe(new Date(NOW + 3600_000).toISOString());
  });
});

describe("ensureAccessToken — autorização realmente inválida", () => {
  it("invalid_grant (HTTP 400) → reauth_required e marca a conexão", async () => {
    const store = makeStore();
    const fetchImpl = vi.fn(async () =>
      jsonResponse(400, { error: "invalid_grant", error_description: "Token has been expired" }),
    );
    const { deps, logs } = makeDeps(fetchImpl as unknown as typeof fetch, store);
    const out = await ensureAccessToken(deps, expired);
    expect(out).toEqual({ kind: "reauth_required", persisted: true });
    expect(store.markReauthRequired).toHaveBeenCalledWith("user-a", REAUTH_MESSAGE);
    expect(store.recordTransientError).not.toHaveBeenCalled();
    // o texto do Google (error_description) nunca é registrado
    expect(JSON.stringify(logs)).not.toContain("expired");
  });
});

describe("ensureAccessToken — falhas temporárias preservam a conexão", () => {
  it.each([
    [429, "rate_limited"],
    [500, "server_error"],
    [503, "server_error"],
  ] as const)("HTTP %i → transient/%s, sem marcar inválida", async (status, reason) => {
    const store = makeStore();
    const fetchImpl = vi.fn(async () => jsonResponse(status, { error: "backendError" }));
    const { deps } = makeDeps(fetchImpl as unknown as typeof fetch, store);
    const out = await ensureAccessToken(deps, expired);
    expect(out).toEqual({ kind: "transient", reason, status, recorded: true });
    expect(store.markReauthRequired).not.toHaveBeenCalled();
    expect(store.saveRefreshed).not.toHaveBeenCalled();
    expect(store.recordTransientError).toHaveBeenCalledWith(
      "user-a",
      transientMessage(reason, status),
    );
  });

  it("falha de rede (fetch lança) → transient/network, sem lançar", async () => {
    const store = makeStore();
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    const { deps } = makeDeps(fetchImpl as unknown as typeof fetch, store);
    const out = await ensureAccessToken(deps, expired);
    expect(out).toEqual({
      kind: "transient",
      reason: "network",
      status: undefined,
      recorded: true,
    });
    expect(store.markReauthRequired).not.toHaveBeenCalled();
  });

  it("invalid_client (config do app) → transient/config: não culpa o usuário", async () => {
    const store = makeStore();
    const fetchImpl = vi.fn(async () => jsonResponse(401, { error: "invalid_client" }));
    const { deps } = makeDeps(fetchImpl as unknown as typeof fetch, store);
    const out = await ensureAccessToken(deps, expired);
    expect(out).toMatchObject({ kind: "transient", reason: "config" });
    expect(store.markReauthRequired).not.toHaveBeenCalled();
  });

  it("400 com outro código (ex.: invalid_request) não prova revogação", async () => {
    const store = makeStore();
    const fetchImpl = vi.fn(async () => jsonResponse(400, { error: "invalid_request" }));
    const { deps } = makeDeps(fetchImpl as unknown as typeof fetch, store);
    const out = await ensureAccessToken(deps, expired);
    expect(out).toMatchObject({ kind: "transient", reason: "rejected" });
    expect(store.markReauthRequired).not.toHaveBeenCalled();
  });

  it("corpo de erro ilegível não vira invalid_grant", async () => {
    const store = makeStore();
    const fetchImpl = vi.fn(async () => new Response("<html>erro</html>", { status: 400 }));
    const { deps } = makeDeps(fetchImpl as unknown as typeof fetch, store);
    const out = await ensureAccessToken(deps, expired);
    expect(out.kind).toBe("transient");
    expect(store.markReauthRequired).not.toHaveBeenCalled();
  });

  it("200 sem access_token → transient/bad_response", async () => {
    const store = makeStore();
    const fetchImpl = vi.fn(async () => jsonResponse(200, { expires_in: 3600 }));
    const { deps } = makeDeps(fetchImpl as unknown as typeof fetch, store);
    expect(await ensureAccessToken(deps, expired)).toMatchObject({
      kind: "transient",
      reason: "bad_response",
    });
  });

  it("falha ao gravar a mensagem de erro não derruba nem muda o diagnóstico", async () => {
    const store = makeStore({
      recordTransientError: vi.fn(async () => {
        throw new Error("db down");
      }),
    });
    const fetchImpl = vi.fn(async () => jsonResponse(503, {}));
    const { deps } = makeDeps(fetchImpl as unknown as typeof fetch, store);
    await expect(ensureAccessToken(deps, expired)).resolves.toMatchObject({ kind: "transient" });
  });
});

describe("ensureAccessToken — falha ao persistir a renovação", () => {
  it("saveRefreshed retorna false: o token novo ainda serve neste ciclo (persisted:false)", async () => {
    const store = makeStore({ saveRefreshed: vi.fn(async () => false) });
    const fetchImpl = vi.fn(async () =>
      jsonResponse(200, { access_token: ACCESS, expires_in: 3600 }),
    );
    const { deps, logs } = makeDeps(fetchImpl as unknown as typeof fetch, store);
    const out = await ensureAccessToken(deps, expired);
    expect(out).toEqual({ kind: "ok", accessToken: ACCESS, refreshed: true, persisted: false });
    expect(store.markReauthRequired).not.toHaveBeenCalled();
    expect(logs.some((l) => l.event === "refresh_persist_failed")).toBe(true);
  });

  it("saveRefreshed lança: não propaga e não marca a conexão como inválida", async () => {
    const store = makeStore({
      saveRefreshed: vi.fn(async () => {
        throw new Error("connection reset");
      }),
    });
    const fetchImpl = vi.fn(async () =>
      jsonResponse(200, { access_token: ACCESS, expires_in: 3600, refresh_token: NEW_REFRESH }),
    );
    const { deps, logs } = makeDeps(fetchImpl as unknown as typeof fetch, store);
    const out = await ensureAccessToken(deps, expired);
    expect(out).toMatchObject({ kind: "ok", persisted: false });
    expect(store.markReauthRequired).not.toHaveBeenCalled();
    // avisa que um refresh_token novo pode ter se perdido, sem registrá-lo
    expect(logs.find((l) => l.event === "refresh_persist_failed")?.meta).toEqual({ rotated: true });
  });
});

describe("ensureAccessToken — nada sensível nos logs", () => {
  it("nenhum log contém token, segredo ou corpo do Google", async () => {
    const outcomes = [
      jsonResponse(200, { access_token: ACCESS, expires_in: 3600, refresh_token: NEW_REFRESH }),
      jsonResponse(400, { error: "invalid_grant", error_description: "secret-detail-marker" }),
      jsonResponse(503, { error: "backend", error_description: "secret-detail-marker" }),
    ];
    for (const res of outcomes) {
      const store = makeStore({ saveRefreshed: vi.fn(async () => false) });
      const { deps, logs } = makeDeps((async () => res) as unknown as typeof fetch, store);
      await ensureAccessToken(deps, expired);
      const dump = JSON.stringify(logs);
      for (const secret of [
        ACCESS,
        OLD_REFRESH,
        NEW_REFRESH,
        "client-secret-marker",
        "secret-detail-marker",
      ]) {
        expect(dump).not.toContain(secret);
      }
    }
  });
});

describe("ensureAccessToken — conexão já inválida não gera chamadas repetidas ao Google", () => {
  it("token_invalid=true: devolve reauth_required SEM fetch e SEM tocar no banco", async () => {
    const fetchSpy = vi.fn();
    const store = makeStore();
    const { deps } = makeDeps(fetchSpy as unknown as typeof fetch, store);
    for (let i = 0; i < 5; i++) {
      const out = await ensureAccessToken(deps, { ...expired, token_invalid: true });
      expect(out).toEqual({ kind: "reauth_required", persisted: true, skippedCall: true });
    }
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(store.markReauthRequired).not.toHaveBeenCalled();
    expect(store.saveRefreshed).not.toHaveBeenCalled();
  });

  it("vale também com o access token ainda dentro da validade", async () => {
    const fetchSpy = vi.fn();
    const { deps } = makeDeps(fetchSpy as unknown as typeof fetch, makeStore());
    const out = await ensureAccessToken(deps, {
      ...expired,
      token_invalid: true,
      token_expiry: new Date(NOW + 30 * 60_000).toISOString(),
    });
    expect(out.kind).toBe("reauth_required");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("token_invalid=false/ausente continua renovando normalmente", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(200, { access_token: ACCESS, expires_in: 3600 }),
    );
    const { deps } = makeDeps(fetchImpl as unknown as typeof fetch, makeStore());
    await ensureAccessToken(deps, { ...expired, token_invalid: false });
    await ensureAccessToken(deps, expired);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("depois de uma reconexão (flag zerada, tokens novos) volta a chamar o Google", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(200, { access_token: ACCESS, expires_in: 3600 }),
    );
    const { deps } = makeDeps(fetchImpl as unknown as typeof fetch, makeStore());
    expect((await ensureAccessToken(deps, { ...expired, token_invalid: true })).kind).toBe(
      "reauth_required",
    );
    expect(
      (
        await ensureAccessToken(deps, {
          ...expired,
          refresh_token: NEW_REFRESH,
          token_invalid: false,
        })
      ).kind,
    ).toBe("ok");
  });
});

describe("ensureAccessToken — falha ao gravar o estado não é escondida", () => {
  it("invalid_grant e o banco não grava (false): reauth_required com persisted:false e log", async () => {
    const store = makeStore({ markReauthRequired: vi.fn(async () => false) });
    const fetchImpl = vi.fn(async () => jsonResponse(400, { error: "invalid_grant" }));
    const { deps, logs } = makeDeps(fetchImpl as unknown as typeof fetch, store);
    const out = await ensureAccessToken(deps, expired);
    expect(out).toEqual({ kind: "reauth_required", persisted: false });
    expect(logs.some((l) => l.event === "reauth_state_not_persisted")).toBe(true);
  });

  it("invalid_grant e o banco lança: não propaga, persisted:false", async () => {
    const store = makeStore({
      markReauthRequired: vi.fn(async () => {
        throw new Error("db down");
      }),
    });
    const fetchImpl = vi.fn(async () => jsonResponse(400, { error: "invalid_grant" }));
    const { deps } = makeDeps(fetchImpl as unknown as typeof fetch, store);
    await expect(ensureAccessToken(deps, expired)).resolves.toEqual({
      kind: "reauth_required",
      persisted: false,
    });
  });

  it("falha temporária e o banco não grava o aviso: recorded:false, conexão preservada", async () => {
    const store = makeStore({ recordTransientError: vi.fn(async () => false) });
    const fetchImpl = vi.fn(async () => jsonResponse(503, {}));
    const { deps, logs } = makeDeps(fetchImpl as unknown as typeof fetch, store);
    const out = await ensureAccessToken(deps, expired);
    expect(out).toMatchObject({ kind: "transient", recorded: false });
    expect(store.markReauthRequired).not.toHaveBeenCalled();
    expect(logs.some((l) => l.event === "transient_state_not_persisted")).toBe(true);
  });
});
