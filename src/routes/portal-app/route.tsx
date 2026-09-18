import { createFileRoute, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { LogOut, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { resolveUserEnvironment } from "@/lib/user-environment.server";
import { getPortalDataForSession } from "@/lib/portal-auth.functions";
import { shouldRequireMfaChallenge } from "@/lib/mfa.functions";
import { acceptPendingInvites } from "@/lib/accept-invite.functions";
import {
  PortalSessionDataProvider,
  type PortalSessionData,
} from "@/components/portal/portal-session-context";

/**
 * Layout guard for the NEW authenticated client portal (session + org
 * based), parallel to the existing token-based `portal.$token/**` routes —
 * those are untouched and keep working exactly as before.
 *
 * Multi-environment support (Phase 2b, "active organization" persistence):
 * `resolveUserEnvironment()` returns `type: "multiple"` whenever the user
 * has more than one active environment overall — that could be several
 * client orgs, or a mix of internal + client. When that happens here, we
 * don't immediately bounce to `/selecionar-ambiente`: we first check
 * whether one of the user's active CLIENT environments matches the
 * `vnh_active_org` cookie set by `/selecionar-ambiente` (validated
 * server-side against a live membership row, never trusted blindly — see
 * `resolveActiveClientOrganization` in `portal-auth.functions.ts`, which
 * every data/mutation call in this route tree goes through independently
 * anyway). Only when there's no such match do we send the user to pick an
 * environment.
 */
/** Mirrors `_authenticated/route.tsx`'s own `profiles.must_change_password`
 * check (see CLAUDE.md, gap #1: `inviteClientUser` sets
 * `must_change_password: true` in `user_metadata` at creation, but the only
 * place that column was ever enforced was inside `_authenticated`, which
 * clients never enter). Best-effort in the sense that a query error fails
 * OPEN (renders the portal) rather than stranding every client behind a
 * broken check — same fail-open philosophy already used throughout this
 * file's rate limiting/audit logging. */
async function checkMustChangePassword(userId: string): Promise<boolean> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("must_change_password")
    .eq("id", userId)
    .maybeSingle();
  return Boolean(profile?.must_change_password);
}

export const Route = createFileRoute("/portal-app")({
  ssr: false,
  beforeLoad: async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
      throw redirect({ to: "/" });
    }

    // Same additive check as `_authenticated/route.tsx` (see CLAUDE.md,
    // Fase 3 parte 2): a client with MFA enrolled must not reach the portal
    // shell on a session that hasn't completed the challenge yet.
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (shouldRequireMfaChallenge(aal?.currentLevel ?? null, aal?.nextLevel ?? null)) {
      throw redirect({ to: "/" });
    }

    const userId = sessionData.session.user.id;

    // Ativa qualquer vínculo `invited` deste usuário ANTES de resolver o
    // ambiente — sem isto, um cliente recém-convidado autentica com sucesso
    // (a senha temporária É válida) mas `resolveUserEnvironment` nunca o
    // reconhece como tendo um ambiente de cliente (só conta vínculos
    // `active`), caindo em "acesso pendente" mesmo tendo acabado de aceitar
    // o convite. Autenticar com sucesso pela primeira vez É a prova de
    // aceite nesse modelo (não há um token de convite separado). Fail-open:
    // nunca bloquear o acesso por uma falha nessa etapa best-effort.
    try {
      await acceptPendingInvites();
    } catch {
      /* segue mesmo assim — se realmente havia um convite pendente, o pior
       * caso é o usuário cair em /acesso-pendente e poder tentar de novo. */
    }

    const env = await resolveUserEnvironment(supabase, userId);

    // CRITICAL ORDERING (see CLAUDE.md task spec): `env.type` already
    // resolves suspended/pending users to their own redirect BEFORE we ever
    // reach the must-change-password check below — a suspended invitee's
    // `env.type` is `"suspended"`, never `"client"`, so they fall through
    // to the generic `redirect({ to: env.redirectTo })` at the bottom of
    // this function and land on /acesso-bloqueado, never on /criar-senha.
    // Only a user who has a genuinely active client membership reaches the
    // must-change-password check at all.
    if (env.type === "client") {
      const mustChangePassword = await checkMustChangePassword(userId);
      if (mustChangePassword) {
        throw redirect({ to: "/criar-senha" });
      }
      return { userId, organizationId: env.organizationId };
    }

    if (env.type === "multiple") {
      // This guard runs client-side (`ssr: false`) and cannot read the
      // httpOnly active-org cookie directly — delegate the (re-validated,
      // never-trust-the-cookie-blindly) resolution to the server function
      // that already does this for every portal-app data call.
      const { getActivePortalOrganization } = await import("@/lib/portal-auth.functions");
      const { organizationId } = await getActivePortalOrganization();
      if (organizationId) {
        const mustChangePassword = await checkMustChangePassword(userId);
        if (mustChangePassword) {
          throw redirect({ to: "/criar-senha" });
        }
        return { userId, organizationId };
      }
    }

    // Internal-only users, pending users, or multi-environment users with
    // no (valid) active-org cookie yet never see the client portal shell
    // directly — send them wherever `resolveUserEnvironment` says they
    // actually belong (the picker, in the multi-env case).
    throw redirect({ to: env.redirectTo });
  },
  loader: async () => {
    const data = (await getPortalDataForSession()) as PortalSessionData;
    return { clienteData: data };
  },
  component: PortalAppLayout,
});

function PortalAppLayout() {
  const { clienteData } = Route.useLoaderData();
  const navigate = useNavigate();
  const [multiEnv, setMultiEnv] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) return;
      const env = await resolveUserEnvironment(supabase, sessionData.session.user.id);
      if (!cancelled) setMultiEnv(env.type === "multiple");
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  };

  return (
    <PortalSessionDataProvider initialData={clienteData}>
      <div className="flex min-h-screen flex-col bg-background">
        <header className="flex items-center justify-between border-b border-border px-5 py-3">
          <p className="truncate text-sm font-medium text-foreground">{clienteData.clienteNome}</p>
          <div className="flex items-center gap-2">
            {multiEnv && (
              <button
                type="button"
                onClick={() => navigate({ to: "/selecionar-ambiente" })}
                className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
              >
                <RefreshCw className="h-3.5 w-3.5" /> Trocar ambiente
              </button>
            )}
            <button
              type="button"
              onClick={handleLogout}
              className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
            >
              <LogOut className="h-3.5 w-3.5" /> Sair
            </button>
          </div>
        </header>
        <main className="flex-1 p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </PortalSessionDataProvider>
  );
}
