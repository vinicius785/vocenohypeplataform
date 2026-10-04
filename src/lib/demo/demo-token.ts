import type { DemoAccessState, DemoSessionRow } from "./demo-types";

/**
 * Token do link público da demo (`/demo/$token`) e regras de validade — funções
 * PURAS (sem banco). A decisão de acesso é sempre tomada no servidor.
 */

/** Validade padrão do link, renovável. */
export const DEMO_TOKEN_TTL_DAYS = 14;

const DAY_MS = 86_400_000;

/** 32 bytes aleatórios em base64url (43 caracteres, sem padding). */
const TOKEN_BYTES = 32;
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** `crypto.getRandomValues` (Web Crypto) — disponível no Node 20+ e no navegador. */
export function generateDemoToken(): string {
  const bytes = new Uint8Array(TOKEN_BYTES);
  globalThis.crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
}

/** Chave do tópico de sinal em tempo real: 16 bytes em hexadecimal (32 caracteres). Distinta
 * do token do link — o sinal é forjável com a chave pública, então nunca deriva do segredo. */
export function generateDemoRealtimeKey(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Barra lixo ANTES de tocar o banco. Não prova que o token existe. */
export function isWellFormedDemoToken(value: unknown): value is string {
  return typeof value === "string" && TOKEN_RE.test(value);
}

export function demoTokenExpiry(from: Date, days: number = DEMO_TOKEN_TTL_DAYS): Date {
  return new Date(from.getTime() + days * DAY_MS);
}

/**
 * Estado de acesso do link, na ordem de severidade: encerrada > revogada > expirada.
 * (Uma demo encerrada nunca volta a ficar "ativa" só por ter prazo sobrando.)
 */
export function computeAccessState(
  session: Pick<DemoSessionRow, "status" | "access_revoked_at" | "token_expires_at">,
  now: Date,
): DemoAccessState {
  if (session.status === "closed") return "encerrado";
  if (session.access_revoked_at) return "revogado";
  const expires = Date.parse(session.token_expires_at);
  if (!Number.isFinite(expires) || expires <= now.getTime()) return "expirado";
  return "ativo";
}

/** Janela mínima entre dois registros de "último acesso do cliente" (evita escrever
 * no banco a cada chamada do polling). */
export const DEMO_LAST_ACCESS_MIN_GAP_MS = 5 * 60_000;

export function shouldTouchLastAccess(lastAccessIso: string | null, now: Date): boolean {
  if (!lastAccessIso) return true;
  const last = Date.parse(lastAccessIso);
  return !Number.isFinite(last) || now.getTime() - last >= DEMO_LAST_ACCESS_MIN_GAP_MS;
}
