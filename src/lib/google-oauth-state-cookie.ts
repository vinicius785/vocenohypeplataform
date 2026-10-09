/**
 * Vínculo do `state` do OAuth ao NAVEGADOR que iniciou a conexão.
 *
 * Sem isso, quem iniciasse o fluxo (com a própria sessão) poderia entregar a URL de autorização a
 * outra pessoa; ao consentir, a conta Google DELA ficaria ligada ao usuário de quem iniciou. O
 * cookie é HttpOnly (o JavaScript da página não lê), `SameSite=Lax` (é enviado na volta do Google,
 * uma navegação de topo, mas não em requisições entre sites), expira em 10 min (= TTL do `state`) e
 * vale só para `/api/google`. O valor é o próprio `state`; o callback exige que cookie e parâmetro
 * coincidam. Sem alteração de schema.
 */

export const OAUTH_STATE_COOKIE = "vnh_google_oauth";
export const OAUTH_STATE_COOKIE_PATH = "/api/google";
export const OAUTH_STATE_COOKIE_MAX_AGE_S = 10 * 60;

type CookieOpts = { secure: boolean };

function attrs(opts: CookieOpts, maxAge: number): string {
  return `Path=${OAUTH_STATE_COOKIE_PATH}; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${opts.secure ? "; Secure" : ""}`;
}

/** Valor de `Set-Cookie` que grava o `state` (UUID: só caracteres seguros, sem codificação). */
export function buildStateCookie(token: string, opts: CookieOpts): string {
  if (!/^[A-Za-z0-9-]{8,64}$/.test(token)) throw new Error("state inválido para cookie");
  return `${OAUTH_STATE_COOKIE}=${token}; ${attrs(opts, OAUTH_STATE_COOKIE_MAX_AGE_S)}`;
}

/** Valor de `Set-Cookie` que apaga o cookie (uso único). */
export function buildClearStateCookie(opts: CookieOpts): string {
  return `${OAUTH_STATE_COOKIE}=; ${attrs(opts, 0)}`;
}

export function readCookie(header: string | null | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim() || null;
  }
  return null;
}

/** Comparação em tempo constante (sem vazar por tempo quantos caracteres batem). */
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
