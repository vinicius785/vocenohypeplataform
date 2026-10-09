import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Callback de exclusão de dados da Meta (https://developers.facebook.com/docs/development/create-an-app/app-dashboard/data-deletion-callback).
 * Puro e testável: a assinatura é validada com o App Secret ANTES de qualquer leitura do conteúdo,
 * nada daqui registra o segredo, o `signed_request` ou o ID da Meta.
 */

export type SignedRequestResult =
  | { ok: true; userId: string; issuedAt: number }
  | {
      ok: false;
      reason: "missing" | "malformed" | "bad_signature" | "bad_algorithm" | "bad_payload";
    };

const USER_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

/** `signed_request` = `<assinatura base64url>.<payload base64url>`; assinatura = HMAC-SHA256(payload_b64, app_secret). */
export function parseMetaSignedRequest(
  raw: string | null | undefined,
  appSecret: string,
): SignedRequestResult {
  if (!raw) return { ok: false, reason: "missing" };
  const parts = raw.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { ok: false, reason: "malformed" };
  const [sigB64, payloadB64] = parts;
  if (!/^[A-Za-z0-9_-]+$/.test(sigB64) || !/^[A-Za-z0-9_-]+$/.test(payloadB64))
    return { ok: false, reason: "malformed" };

  const received = Buffer.from(sigB64, "base64url");
  const expected = createHmac("sha256", appSecret).update(payloadB64).digest();
  if (received.length !== expected.length || !timingSafeEqual(received, expected))
    return { ok: false, reason: "bad_signature" };

  // só depois de validar a assinatura o conteúdo é lido
  let payload: { algorithm?: unknown; user_id?: unknown; issued_at?: unknown };
  try {
    payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "bad_payload" };
  }
  if (typeof payload.algorithm !== "string" || payload.algorithm.toUpperCase() !== "HMAC-SHA256")
    return { ok: false, reason: "bad_algorithm" };
  const userId =
    typeof payload.user_id === "string" ? payload.user_id : String(payload.user_id ?? "");
  if (!USER_ID_RE.test(userId)) return { ok: false, reason: "bad_payload" };
  const issuedAt = Number(payload.issued_at);
  return { ok: true, userId, issuedAt: Number.isFinite(issuedAt) ? Math.trunc(issuedAt) : 0 };
}

/** Identificador estável e não reversível sem o App Secret (o ID da Meta nunca é guardado em claro). */
export function metaUserHash(userId: string, appSecret: string): string {
  return createHmac("sha256", appSecret).update(`meta-user:${userId}`).digest("hex");
}

export const newConfirmationCode = (): string => randomBytes(16).toString("hex");
export const isConfirmationCode = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f]{32}$/.test(v);

export type DeletionStatus = "received" | "processing" | "completed" | "failed";
export type DeletionRow = {
  id: string;
  confirmationCode: string;
  status: DeletionStatus;
  summary: Record<string, unknown>;
  createdAt: string;
  completedAt: string | null;
};

export interface DeletionRepo {
  findByUserAndIssued(hash: string, issuedAt: number): Promise<DeletionRow | null>;
  /** Cria o pedido; em corrida (UNIQUE hash+issued_at) devolve o já existente. */
  insert(input: { code: string; hash: string; issuedAt: number }): Promise<DeletionRow>;
  update(
    id: string,
    patch: { status: DeletionStatus; summary?: Record<string, unknown>; errorCode?: string | null },
  ): Promise<void>;
  findByCode(code: string): Promise<DeletionRow | null>;
}

/**
 * Local onde dados vinculados a uma identidade Meta podem existir. Cada integração futura com a
 * Meta REGISTRA aqui seu armazenamento (tokens, vínculos, dados importados). `deleteForMetaUser`
 * recebe só o hash e deve apagar APENAS o que pertence àquela identidade (nunca a conta, a
 * organização ou o cliente inteiros) e devolver quantos registros removeu. Hoje não há nenhum,
 * porque a plataforma não tem integração com a Meta nem guarda identificadores dela.
 */
export interface MetaDataStore {
  name: string;
  deleteForMetaUser(userHash: string): Promise<number>;
}
export const META_DATA_STORES: MetaDataStore[] = [];

export type DeletionOutcome = { status: number; body: Record<string, unknown> };

/** Roda os armazenamentos e só marca `completed` depois de TODOS terminarem; falha deixa `failed` (reprocessável). */
export async function processDeletion(
  repo: DeletionRepo,
  row: DeletionRow,
  stores: readonly MetaDataStore[],
  userHash: string,
): Promise<DeletionRow["status"]> {
  await repo.update(row.id, { status: "processing" });
  try {
    const perStore: Record<string, number> = {};
    for (const s of stores) perStore[s.name] = await s.deleteForMetaUser(userHash);
    const deleted = Object.values(perStore).reduce((a, b) => a + b, 0);
    await repo.update(row.id, {
      status: "completed",
      summary: { stores: stores.length, deleted, perStore },
      errorCode: null,
    });
    return "completed";
  } catch {
    await repo.update(row.id, { status: "failed", errorCode: "store_failed" });
    return "failed";
  }
}

/** Trata o corpo do POST da Meta e devolve o JSON exigido: `{ url, confirmation_code }`. */
export async function handleMetaDeletionCallback(deps: {
  signedRequest: string | null | undefined;
  appSecret: string | undefined;
  /** Avaliada só ao montar a resposta (um APP_URL ausente não pode mascarar um pedido inválido). */
  appUrl: () => string;
  repo: DeletionRepo;
  stores?: readonly MetaDataStore[];
  newCode?: () => string;
}): Promise<DeletionOutcome> {
  if (!deps.appSecret) return { status: 500, body: { error: "not_configured" } };
  const parsed = parseMetaSignedRequest(deps.signedRequest, deps.appSecret);
  if (!parsed.ok) return { status: 400, body: { error: "invalid_request" } };

  const hash = metaUserHash(parsed.userId, deps.appSecret);
  let row = await deps.repo.findByUserAndIssued(hash, parsed.issuedAt);
  if (!row) {
    row = await deps.repo.insert({
      code: (deps.newCode ?? newConfirmationCode)(),
      hash,
      issuedAt: parsed.issuedAt,
    });
  }
  // reentrega do mesmo pedido: devolve o mesmo código; só reprocessa se ainda não concluiu
  if (row.status !== "completed") {
    await processDeletion(deps.repo, row, deps.stores ?? META_DATA_STORES, hash);
  }
  return {
    status: 200,
    body: {
      url: `${deps.appUrl()}/exclusao-de-dados/${row.confirmationCode}`,
      confirmation_code: row.confirmationCode,
    },
  };
}

export type PublicStatus = {
  state: "recebido" | "em_processamento" | "concluido" | "nao_encontrado";
  createdAt: string | null;
  completedAt: string | null;
  /** Só contagem: nenhum identificador ou dado pessoal. */
  deletedCount: number | null;
};

export async function getPublicDeletionStatus(
  repo: DeletionRepo,
  code: string,
): Promise<PublicStatus> {
  const none: PublicStatus = {
    state: "nao_encontrado",
    createdAt: null,
    completedAt: null,
    deletedCount: null,
  };
  if (!isConfirmationCode(code)) return none;
  const row = await repo.findByCode(code);
  if (!row) return none;
  const state =
    row.status === "completed"
      ? "concluido"
      : row.status === "received"
        ? "recebido"
        : "em_processamento"; // processing e failed (ainda em tratamento)
  const deleted = typeof row.summary.deleted === "number" ? row.summary.deleted : null;
  return {
    state,
    createdAt: row.createdAt,
    completedAt: row.status === "completed" ? row.completedAt : null,
    deletedCount: row.status === "completed" ? deleted : null,
  };
}
