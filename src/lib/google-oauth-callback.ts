/**
 * Núcleo do callback OAuth do Google Calendar, com `fetch`, relógio, estado e persistência por
 * parâmetro — a rota (`api/google/oauth-callback.ts`) só monta as dependências reais e converte o
 * desfecho em redirecionamento. Assim o fluxo é testável sem o Google nem o banco.
 *
 * Mantido: `state` de uso único e com TTL, `user_id` sempre vindo do `state` gravado no início da
 * conexão (nunca de parâmetro do navegador), `redirect_uri` idêntico ao do início.
 */
import { isOAuthStateExpired } from "@/lib/google-oauth-config";
import { constantTimeEqual } from "@/lib/google-oauth-state-cookie";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";

/** Códigos para log e para o motivo mostrado na tela. Nunca o texto cru do Google. */
export type GoogleOAuthErrorCode =
  | "app_url_invalid"
  | "google_denied_or_missing_params"
  | "state_invalid_or_reused"
  | "state_expired"
  /** O `state` não coincide com o cookie do navegador que iniciou a conexão (ou o cookie não veio). */
  | "state_not_bound_to_browser"
  | "env_missing"
  | "token_exchange_failed"
  | "no_refresh_token"
  | "db_upsert_failed";

export type CallbackOutcome =
  | { outcome: "connected" }
  | { outcome: "error"; code: GoogleOAuthErrorCode };

export type ConnectionRecord = {
  user_id: string;
  google_email: string | null;
  access_token: string;
  refresh_token: string;
  token_expiry: string;
  connected_at: string;
  updated_at: string;
  /** Reconexão = autorização nova: zera o estado antigo para a tela refletir "conectado" na hora. */
  token_invalid: false;
  last_error: null;
  sync_token: null;
};

export type CallbackDeps = {
  fetch: typeof fetch;
  now: () => number;
  /** Lança se `APP_URL` estiver ausente/inválida. */
  getRedirectUri: () => string;
  getClientCredentials: () => { clientId: string; clientSecret: string } | null;
  /** `DELETE … RETURNING` atômico: uso único mesmo sob corrida. */
  consumeState: (token: string) => Promise<{ user_id: string; created_at: string } | null>;
  saveConnection: (record: ConnectionRecord) => Promise<{ errorCode?: string } | null>;
  log: (event: string, meta: Record<string, string | number | boolean | undefined>) => void;
};

export type CallbackParams = {
  code: string | null;
  state: string | null;
  error: string | null;
  /** Valor do cookie de vínculo enviado por ESTE navegador (ou `null`). */
  browserBinding: string | null;
};

export async function processGoogleOAuthCallback(
  deps: CallbackDeps,
  params: CallbackParams,
): Promise<CallbackOutcome> {
  const fail = (code: GoogleOAuthErrorCode, meta: Record<string, string | number> = {}) => {
    deps.log("callback_error", { code, ...meta });
    return { outcome: "error", code } as const;
  };

  let redirectUri: string;
  try {
    redirectUri = deps.getRedirectUri();
  } catch {
    return fail("app_url_invalid");
  }

  const { code, state, error } = params;
  if (error || !code || !state) return fail("google_denied_or_missing_params");

  // Vínculo ao navegador ANTES de consumir: um callback vindo de outro navegador não queima o state
  // legítimo nem chega a trocar o código.
  if (!params.browserBinding || !constantTimeEqual(params.browserBinding, state)) {
    return fail("state_not_bound_to_browser");
  }

  const stateRow = await deps.consumeState(state);
  if (!stateRow) return fail("state_invalid_or_reused");
  if (isOAuthStateExpired(stateRow.created_at, deps.now())) return fail("state_expired");

  const creds = deps.getClientCredentials();
  if (!creds) return fail("env_missing");

  let tokenRes: Response;
  try {
    tokenRes = await deps.fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: creds.clientId,
        client_secret: creds.clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });
  } catch {
    return fail("token_exchange_failed", { status: 0 });
  }
  if (!tokenRes.ok) return fail("token_exchange_failed", { status: tokenRes.status });

  let tokenJson: { access_token?: unknown; refresh_token?: unknown; expires_in?: unknown };
  try {
    tokenJson = (await tokenRes.json()) as typeof tokenJson;
  } catch {
    return fail("token_exchange_failed", { status: tokenRes.status });
  }
  if (typeof tokenJson.access_token !== "string" || !tokenJson.access_token) {
    return fail("token_exchange_failed", { status: tokenRes.status });
  }
  if (typeof tokenJson.refresh_token !== "string" || !tokenJson.refresh_token) {
    // Sem refresh_token a conexão morreria na primeira expiração (~1h).
    return fail("no_refresh_token");
  }
  const expiresIn =
    typeof tokenJson.expires_in === "number" && tokenJson.expires_in > 0
      ? tokenJson.expires_in
      : 3600;

  // O e-mail é só informativo: falhar aqui não impede a conexão.
  let email: string | null = null;
  try {
    const infoRes = await deps.fetch(USERINFO_URL, {
      headers: { Authorization: `Bearer ${tokenJson.access_token}` },
    });
    if (infoRes.ok) {
      const info = (await infoRes.json()) as { email?: unknown };
      email = typeof info.email === "string" ? info.email : null;
    }
  } catch {
    email = null;
  }

  const nowIso = new Date(deps.now()).toISOString();
  const saved = await deps.saveConnection({
    user_id: stateRow.user_id,
    google_email: email,
    access_token: tokenJson.access_token,
    refresh_token: tokenJson.refresh_token,
    token_expiry: new Date(deps.now() + expiresIn * 1000).toISOString(),
    connected_at: nowIso,
    updated_at: nowIso,
    token_invalid: false,
    last_error: null,
    sync_token: null,
  });
  if (saved) return fail("db_upsert_failed", { dbCode: saved.errorCode ?? "unknown" });

  deps.log("callback_connected", {});
  return { outcome: "connected" };
}
