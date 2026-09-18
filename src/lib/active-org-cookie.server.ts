/**
 * "Active organization" persistence for multi-environment users (Phase 2b —
 * see CLAUDE.md). Deliberately minimal: one httpOnly cookie storing the
 * `organization_id` the user last picked at `/selecionar-ambiente`, read by
 * `resolvePortalOrganization` (`portal-auth.functions.ts`) so subsequent
 * `/portal-app/**` requests know which of the user's (potentially several)
 * ACTIVE client orgs is current.
 *
 * Not a general workspace-switcher framework — just enough for one active
 * org per session. Users with exactly one active client org never touch
 * this: `resolveUserEnvironment()` resolves them directly. The cookie VALUE
 * is never trusted blindly — every read site re-validates it's still one of
 * the caller's ACTIVE memberships via a live DB query before using it (see
 * `resolvePortalOrganization`).
 */
import { getCookie, setCookie, deleteCookie } from "@tanstack/react-start/server";

export const ACTIVE_ORG_COOKIE = "vnh_active_org";

export function readActiveOrgCookie(): string | null {
  const value = getCookie(ACTIVE_ORG_COOKIE);
  return value && value.length > 0 ? value : null;
}

export function writeActiveOrgCookie(organizationId: string): void {
  setCookie(ACTIVE_ORG_COOKIE, organizationId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 dias
  });
}

export function clearActiveOrgCookie(): void {
  deleteCookie(ACTIVE_ORG_COOKIE, { path: "/" });
}
