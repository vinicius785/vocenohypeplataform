/**
 * Decisão de roteamento do NPS mensal obrigatório do Portal V2 — pura
 * (testável), usada pelo `beforeLoad` de `routes/portal-v2/route.tsx`.
 * A pendência em si vem SEMPRE do servidor (`getPendingNpsSession`); aqui
 * só se decide pra onde mandar.
 */
export const NPS_ROUTE = "/portal-v2/nps";
export const PORTAL_HOME = "/portal-v2/inicio";

function normalizePath(pathname: string): string {
  return pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
}

export function isNpsPath(pathname: string): boolean {
  return normalizePath(pathname) === NPS_ROUTE;
}

/** `returnTo` vem da URL (controlável pelo usuário) — só aceita caminhos
 * internos do próprio Portal V2, nunca URL externa (`//evil.com`,
 * `https://...`) nem a própria rota de NPS (loop). */
export function sanitizeNpsReturnTo(raw: unknown): string {
  if (typeof raw !== "string") return PORTAL_HOME;
  if (!raw.startsWith("/portal-v2")) return PORTAL_HOME;
  if (raw.startsWith("//") || raw.includes("\\")) return PORTAL_HOME;
  const pathOnly = raw.split(/[?#]/)[0];
  if (pathOnly !== "/portal-v2" && !pathOnly.startsWith("/portal-v2/")) return PORTAL_HOME;
  if (isNpsPath(pathOnly)) return PORTAL_HOME;
  return raw;
}

export type NpsGuardDecision =
  | { action: "allow" }
  | { action: "toNps"; returnTo: string }
  | { action: "leaveNps"; href: string };

export function decideNpsGuard(input: {
  pathname: string;
  href: string;
  hasPending: boolean;
  returnTo?: unknown;
}): NpsGuardDecision {
  const onNps = isNpsPath(input.pathname);
  if (input.hasPending && !onNps) {
    return { action: "toNps", returnTo: sanitizeNpsReturnTo(input.href) };
  }
  if (!input.hasPending && onNps) {
    return { action: "leaveNps", href: sanitizeNpsReturnTo(input.returnTo) };
  }
  return { action: "allow" };
}
