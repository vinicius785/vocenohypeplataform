import { createHash, randomBytes } from "node:crypto";
import { metaUserHash, type MetaDataStore } from "../meta-data-deletion";
import {
  InstagramError,
  IG_SCOPES,
  buildAuthorizeUrl,
  type InstagramClient,
  type InstagramSnapshot,
} from "./instagram-client";
import { decryptToken, encryptToken } from "./token-crypto";

export type LinkRow = {
  id: string;
  influenciadorId: string;
  expiresAt: string;
  usedAt: string | null;
};
export type ConnectionRow = {
  influenciadorId: string;
  igUserId: string;
  tokenEnc: string;
  tokenExpiresAt: string;
  status: "connected" | "expired";
  username: string | null;
  accountType: string | null;
  permissions: string[];
  connectedAt: string;
  lastSyncAt: string | null;
  lastSyncError: string | null;
  snapshot: InstagramSnapshot | null;
};

export interface InstagramRepo {
  influencerName(id: string): Promise<string | null>;
  insertLink(i: {
    influenciadorId: string;
    tokenHash: string;
    expiresAt: string;
    createdBy: string | null;
  }): Promise<void>;
  findLinkByTokenHash(hash: string): Promise<LinkRow | null>;
  setLinkState(id: string, stateHash: string): Promise<void>;
  findLinkByStateHash(hash: string): Promise<LinkRow | null>;
  markLinkUsed(id: string): Promise<void>;
  /** Uma conexão por influenciador: reconectar substitui a anterior. */
  upsertConnection(
    c: Omit<ConnectionRow, "lastSyncAt" | "lastSyncError"> & {
      igUserHash: string;
      igAppUserHash: string;
      lastSyncAt: string | null;
    },
  ): Promise<void>;
  getConnection(influenciadorId: string): Promise<ConnectionRow | null>;
  updateConnection(
    influenciadorId: string,
    patch: Partial<
      Pick<
        ConnectionRow,
        | "tokenEnc"
        | "tokenExpiresAt"
        | "status"
        | "lastSyncAt"
        | "lastSyncError"
        | "snapshot"
        | "username"
        | "accountType"
      >
    >,
  ): Promise<void>;
  deleteConnection(influenciadorId: string): Promise<boolean>;
  listConnectedExpiringBefore(iso: string): Promise<ConnectionRow[]>;
  deleteByUserHash(hash: string): Promise<number>;
}

export type Deps = {
  repo: InstagramRepo;
  client: InstagramClient;
  /** App Secret do Instagram: deriva a chave que criptografa o token. */
  appSecret: string;
  appId: string;
  /** Chave dos hashes dos IDs (a mesma do callback de exclusão: META_APP_SECRET). */
  hashKey: string;
  redirectUri: string;
  now?: () => Date;
  rand?: () => string;
};

const LINK_TTL_MS = 7 * 86400_000;
const REFRESH_WINDOW_MS = 14 * 86400_000;
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const rand = (d: Deps) => (d.rand ?? (() => randomBytes(32).toString("base64url")))();
const nowOf = (d: Deps) => (d.now ?? (() => new Date()))();
export const isLinkToken = (v: unknown): v is string =>
  typeof v === "string" && /^[A-Za-z0-9_-]{32,64}$/.test(v);

/** Gera o link único (7 dias) para o influenciador conectar a conta. Só o hash do token é guardado. */
export async function createConnectLink(
  d: Deps,
  i: { influenciadorId: string; createdBy: string | null },
) {
  if (!(await d.repo.influencerName(i.influenciadorId)))
    throw new InstagramError("invalid_code", "influencer_not_found");
  const token = rand(d);
  const expiresAt = new Date(nowOf(d).getTime() + LINK_TTL_MS).toISOString();
  await d.repo.insertLink({
    influenciadorId: i.influenciadorId,
    tokenHash: sha256(token),
    expiresAt,
    createdBy: i.createdBy,
  });
  return { token, expiresAt };
}

export type LinkState = "valid" | "expired" | "used" | "invalid";
async function resolveLink(
  d: Deps,
  token: string,
): Promise<{ state: LinkState; link: LinkRow | null }> {
  if (!isLinkToken(token)) return { state: "invalid", link: null };
  const link = await d.repo.findLinkByTokenHash(sha256(token));
  if (!link) return { state: "invalid", link: null };
  if (link.usedAt) return { state: "used", link };
  if (new Date(link.expiresAt).getTime() <= nowOf(d).getTime()) return { state: "expired", link };
  return { state: "valid", link };
}

/** Dados mínimos para a página pública do influenciador (só o primeiro nome). */
export async function getPublicLinkInfo(d: Deps, token: string) {
  const { state, link } = await resolveLink(d, token);
  if (state !== "valid" || !link) return { state, firstName: null as string | null };
  const name = await d.repo.influencerName(link.influenciadorId);
  return { state, firstName: name ? name.trim().split(/\s+/)[0] : null };
}

/** Passo 1 do OAuth: valida o link, grava o hash do `state` e devolve a URL de autorização do Instagram. */
export async function startOAuth(d: Deps, token: string): Promise<{ url: string }> {
  const { state, link } = await resolveLink(d, token);
  if (state !== "valid" || !link) throw new InstagramError("invalid_code", `link_${state}`);
  const oauthState = rand(d);
  await d.repo.setLinkState(link.id, sha256(oauthState));
  return {
    url: buildAuthorizeUrl({ appId: d.appId, redirectUri: d.redirectUri, state: oauthState }),
  };
}

export type OAuthResult = "ok" | "negado" | "expirado" | "invalido" | "permissao" | "erro";

/** Passo 2 (callback): troca o código, guarda o token CRIPTOGRAFADO e marca o link como usado. */
export async function completeOAuth(
  d: Deps,
  q: { code?: string | null; state?: string | null; error?: string | null },
): Promise<OAuthResult> {
  if (!q.state) return "invalido";
  const link = await d.repo.findLinkByStateHash(sha256(q.state));
  if (!link || link.usedAt) return "invalido";
  if (new Date(link.expiresAt).getTime() <= nowOf(d).getTime()) return "expirado";
  if (q.error) return q.error === "access_denied" ? "negado" : "erro";
  if (!q.code) return "invalido";
  try {
    const { shortToken, appUserId, permissions } = await d.client.exchangeCode(
      q.code,
      d.redirectUri,
    );
    if (!IG_SCOPES.every((s) => permissions.includes(s))) return "permissao";
    const long = await d.client.toLongLived(shortToken);
    const now = nowOf(d);
    let snapshot: InstagramSnapshot | null = null;
    let profileUserId: string;
    let username: string | null = null;
    let accountType: string | null = null;
    try {
      const profile = await d.client.profile(long.accessToken);
      profileUserId = profile.userId;
      username = profile.username;
      accountType = profile.accountType;
      snapshot = await d.client.snapshot(long.accessToken, profile.userId, now);
    } catch {
      return "erro";
    }
    await d.repo.upsertConnection({
      influenciadorId: link.influenciadorId,
      igUserId: profileUserId,
      igUserHash: metaUserHash(profileUserId, d.hashKey),
      igAppUserHash: metaUserHash(appUserId, d.hashKey),
      tokenEnc: encryptToken(long.accessToken, d.appSecret),
      tokenExpiresAt: new Date(now.getTime() + long.expiresInSec * 1000).toISOString(),
      status: "connected",
      username,
      accountType,
      permissions,
      connectedAt: now.toISOString(),
      lastSyncAt: now.toISOString(),
      snapshot,
    });
    await d.repo.markLinkUsed(link.id);
    return "ok";
  } catch (e) {
    if (e instanceof InstagramError && e.code === "denied") return "negado";
    return "erro";
  }
}

export type PublicConnection = {
  connected: boolean;
  status: "connected" | "expired" | null;
  username: string | null;
  accountType: string | null;
  tokenExpiresAt: string | null;
  lastSyncAt: string | null;
  lastSyncError: string | null;
  snapshot: InstagramSnapshot | null;
};

/** O que o navegador da equipe pode ver: nunca o token, o ID do Instagram ou os hashes. */
export function toPublicConnection(c: ConnectionRow | null): PublicConnection {
  if (!c)
    return {
      connected: false,
      status: null,
      username: null,
      accountType: null,
      tokenExpiresAt: null,
      lastSyncAt: null,
      lastSyncError: null,
      snapshot: null,
    };
  return {
    connected: true,
    status: c.status,
    username: c.username,
    accountType: c.accountType,
    tokenExpiresAt: c.tokenExpiresAt,
    lastSyncAt: c.lastSyncAt,
    lastSyncError: c.lastSyncError,
    snapshot: c.snapshot,
  };
}

/** Renova o token (60 dias) quando faltam ≤ 14 dias; devolve o token válido ou `null` se expirou. */
async function ensureFreshToken(d: Deps, c: ConnectionRow): Promise<string | null> {
  const token = decryptToken(c.tokenEnc, d.appSecret);
  if (!token) {
    await d.repo.updateConnection(c.influenciadorId, {
      status: "expired",
      lastSyncError: "token_invalid",
    });
    return null;
  }
  const left = new Date(c.tokenExpiresAt).getTime() - nowOf(d).getTime();
  if (left <= 0) {
    await d.repo.updateConnection(c.influenciadorId, {
      status: "expired",
      lastSyncError: "token_expired",
    });
    return null;
  }
  if (left > REFRESH_WINDOW_MS) return token;
  try {
    const r = await d.client.refresh(token);
    await d.repo.updateConnection(c.influenciadorId, {
      tokenEnc: encryptToken(r.accessToken, d.appSecret),
      tokenExpiresAt: new Date(nowOf(d).getTime() + r.expiresInSec * 1000).toISOString(),
      status: "connected",
    });
    return r.accessToken;
  } catch (e) {
    if (e instanceof InstagramError && e.code === "token_invalid") {
      await d.repo.updateConnection(c.influenciadorId, {
        status: "expired",
        lastSyncError: "token_invalid",
      });
      return null;
    }
    return token; // falha transitória: ainda vale
  }
}

/** Atualiza as métricas de um influenciador (manual, pelo botão da equipe). */
export async function syncMetrics(d: Deps, influenciadorId: string): Promise<PublicConnection> {
  const c = await d.repo.getConnection(influenciadorId);
  if (!c) return toPublicConnection(null);
  const token = await ensureFreshToken(d, c);
  if (!token) return toPublicConnection(await d.repo.getConnection(influenciadorId));
  try {
    const snapshot = await d.client.snapshot(token, c.igUserId, nowOf(d));
    await d.repo.updateConnection(influenciadorId, {
      snapshot,
      username: snapshot.profile.username ?? c.username,
      accountType: snapshot.profile.accountType ?? c.accountType,
      lastSyncAt: nowOf(d).toISOString(),
      lastSyncError: null,
      status: "connected",
    });
  } catch (e) {
    const code = e instanceof InstagramError ? e.code : "unavailable";
    await d.repo.updateConnection(influenciadorId, {
      lastSyncError: code,
      ...(code === "token_invalid" ? { status: "expired" as const } : {}),
    });
  }
  return toPublicConnection(await d.repo.getConnection(influenciadorId));
}

/** Rotina diária (cron externo): renova tokens que vencem em até 14 dias. */
export async function refreshExpiringTokens(
  d: Deps,
): Promise<{ checked: number; expired: number }> {
  const rows = await d.repo.listConnectedExpiringBefore(
    new Date(nowOf(d).getTime() + REFRESH_WINDOW_MS).toISOString(),
  );
  let expired = 0;
  for (const c of rows) {
    if (!(await ensureFreshToken(d, c))) expired += 1;
  }
  return { checked: rows.length, expired };
}

export const disconnect = (d: Deps, influenciadorId: string) =>
  d.repo.deleteConnection(influenciadorId);

/** Registro no callback de exclusão da Meta: apaga SÓ as conexões daquela identidade (token, perfil, métricas). */
export const instagramDeletionStore = (repo: InstagramRepo): MetaDataStore => ({
  name: "instagram_connections",
  deleteForMetaUser: (hash) => repo.deleteByUserHash(hash),
});
