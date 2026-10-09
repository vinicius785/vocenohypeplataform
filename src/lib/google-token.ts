/**
 * Renovação do access token do Google Calendar, SEM dependências de rede/banco fixas: `fetch` e o
 * armazenamento entram por parâmetro, para que cada desfecho possa ser testado sem o Google real.
 *
 * Regras (diagnóstico das fases 1.5/1.6):
 * - só `invalid_grant` prova que a autorização não pode mais ser renovada → `reauth_required`;
 * - 429, 5xx, rede, resposta ilegível e erro de configuração do app (`invalid_client`) são
 *   TEMPORÁRIOS: a conexão é preservada e a próxima rodada tenta de novo;
 * - o `refresh_token` guardado só é trocado quando o Google devolve um novo;
 * - nada aqui registra token, segredo, corpo de resposta ou e-mail.
 */

const TOKEN_URL = "https://oauth2.googleapis.com/token";
/** Renova quando faltar menos que isto para expirar. */
export const TOKEN_REFRESH_MARGIN_MS = 60_000;
const DEFAULT_EXPIRES_IN_S = 3600;

export type GoogleConnectionTokens = {
  user_id: string;
  access_token: string;
  refresh_token: string;
  token_expiry: string;
  /** `true` = a autorização já foi dada como inválida (`invalid_grant`). Só uma reconexão (que
   * grava tokens novos e zera esta flag) a recupera — por isso não se chama o Google de novo. */
  token_invalid?: boolean;
};

export type TransientReason =
  | "rate_limited"
  | "server_error"
  | "network"
  | "bad_response"
  | "config"
  | "rejected";

export type RefreshOutcome =
  | { kind: "ok"; accessToken: string; refreshed: boolean; persisted: boolean }
  /** `persisted: false` = o banco NÃO guardou o estado de reautorização (ver log
   * `reauth_state_not_persisted`); `skippedCall: true` = já estava inválida, sem chamar o Google. */
  | { kind: "reauth_required"; persisted: boolean; skippedCall?: boolean }
  | { kind: "transient"; reason: TransientReason; status?: number; recorded: boolean };

export type RefreshedTokens = {
  access_token: string;
  token_expiry: string;
  /** Só presente quando o Google devolveu um refresh_token novo. */
  refresh_token?: string;
};

export type ConnectionTokenStore = {
  /** Grava o resultado da renovação e limpa o estado de erro. `false`/exceção = falha ao persistir. */
  saveRefreshed(userId: string, tokens: RefreshedTokens): Promise<boolean>;
  /** Autorização realmente inválida (`invalid_grant`): a UI passa a pedir reconexão. */
  markReauthRequired(userId: string, message: string): Promise<boolean>;
  /** Falha temporária: só registra a mensagem, SEM marcar a conexão como inválida. */
  recordTransientError(userId: string, message: string): Promise<boolean>;
};

export type RefreshDeps = {
  fetch: typeof fetch;
  clientId: string;
  clientSecret: string;
  store: ConnectionTokenStore;
  now?: () => number;
  log?: (event: string, meta: Record<string, string | number | boolean | undefined>) => void;
};

export const REAUTH_MESSAGE =
  "O acesso à sua conta Google foi revogado ou expirou. Reconecte sua conta para voltar a sincronizar.";

export function transientMessage(reason: TransientReason, status?: number): string {
  const detail =
    reason === "rate_limited"
      ? "limite de requisições do Google (HTTP 429)"
      : reason === "server_error"
        ? `instabilidade no Google (HTTP ${status ?? 5}xx)`
        : reason === "network"
          ? "falha de conexão com o Google"
          : reason === "config"
            ? "configuração do aplicativo Google no servidor"
            : "resposta inesperada do Google";
  return `Falha temporária na renovação do acesso (${detail}). A conexão foi mantida e uma nova tentativa será feita automaticamente.`;
}

/** Lê só o campo `error` (código curto) do corpo; nunca devolve `error_description` nem o texto. */
async function readGoogleErrorCode(res: Response): Promise<string | undefined> {
  try {
    const body = (await res.json()) as { error?: unknown };
    return typeof body.error === "string" ? body.error.slice(0, 40) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Devolve um access token utilizável da conexão, renovando via `refresh_token` se estiver perto de
 * expirar. Nunca lança por falha de rede/Google/banco: o desfecho vem tipado em `RefreshOutcome`.
 */
export async function ensureAccessToken(
  deps: RefreshDeps,
  row: GoogleConnectionTokens,
): Promise<RefreshOutcome> {
  const now = deps.now ?? Date.now;
  const log = deps.log ?? (() => {});

  // Autorização já marcada como inválida: repetir a chamada a cada ciclo só gera tráfego e ruído.
  if (row.token_invalid) {
    return { kind: "reauth_required", persisted: true, skippedCall: true };
  }

  const expiresInMs = new Date(row.token_expiry).getTime() - now();
  if (expiresInMs > TOKEN_REFRESH_MARGIN_MS) {
    return { kind: "ok", accessToken: row.access_token, refreshed: false, persisted: true };
  }

  const transient = async (reason: TransientReason, status?: number): Promise<RefreshOutcome> => {
    log("refresh_transient_failure", { reason, status });
    let recorded = false;
    try {
      recorded = await deps.store.recordTransientError(
        row.user_id,
        transientMessage(reason, status),
      );
    } catch {
      recorded = false;
    }
    // A conexão segue preservada mesmo sem registrar; só não fingimos que o aviso foi gravado.
    if (!recorded) log("transient_state_not_persisted", { reason });
    return { kind: "transient", reason, status, recorded };
  };

  let res: Response;
  try {
    res = await deps.fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: deps.clientId,
        client_secret: deps.clientSecret,
        refresh_token: row.refresh_token,
        grant_type: "refresh_token",
      }),
    });
  } catch {
    return transient("network");
  }

  if (!res.ok) {
    if (res.status === 429) return transient("rate_limited", res.status);
    if (res.status >= 500) return transient("server_error", res.status);
    const code = await readGoogleErrorCode(res);
    if (res.status === 400 && code === "invalid_grant") {
      log("refresh_reauth_required", { status: res.status, code });
      let persisted = false;
      try {
        persisted = await deps.store.markReauthRequired(row.user_id, REAUTH_MESSAGE);
      } catch {
        persisted = false;
      }
      // Sem persistir, a tela ainda mostra "conectado": o diagnóstico fica explícito no resultado e
      // no log, e a próxima rodada tenta de novo (a flag não foi gravada, então o Google é chamado).
      if (!persisted) log("reauth_state_not_persisted", { status: res.status });
      return { kind: "reauth_required", persisted };
    }
    // invalid_client / unauthorized_client / invalid_request...: problema do app ou do pedido, não
    // prova de que o usuário revogou. Preserva a conexão.
    log("refresh_rejected", { status: res.status, code });
    return transient(code === "invalid_client" ? "config" : "rejected", res.status);
  }

  let json: { access_token?: unknown; expires_in?: unknown; refresh_token?: unknown };
  try {
    json = (await res.json()) as typeof json;
  } catch {
    return transient("bad_response", res.status);
  }
  if (typeof json.access_token !== "string" || json.access_token.length === 0) {
    return transient("bad_response", res.status);
  }
  const expiresIn =
    typeof json.expires_in === "number" && json.expires_in > 0
      ? json.expires_in
      : DEFAULT_EXPIRES_IN_S;
  const rotated =
    typeof json.refresh_token === "string" && json.refresh_token.length > 0
      ? json.refresh_token
      : undefined;

  const tokens: RefreshedTokens = {
    access_token: json.access_token,
    token_expiry: new Date(now() + expiresIn * 1000).toISOString(),
    ...(rotated ? { refresh_token: rotated } : null),
  };

  let persisted = false;
  try {
    persisted = await deps.store.saveRefreshed(row.user_id, tokens);
  } catch {
    persisted = false;
  }
  if (!persisted) {
    // O token novo ainda serve para este ciclo; o refresh_token anterior continua no banco.
    log("refresh_persist_failed", { rotated: Boolean(rotated) });
  }
  return { kind: "ok", accessToken: tokens.access_token, refreshed: true, persisted };
}
