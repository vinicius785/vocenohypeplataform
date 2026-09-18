import { createFileRoute, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { LogOut, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { resolveUserEnvironment } from "@/lib/user-environment.server";
import { getPortalDataForSession } from "@/lib/portal-auth.functions";
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
export const Route = createFileRoute("/portal-app")({
  ssr: false,
  beforeLoad: async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
      throw redirect({ to: "/" });
    }
    const userId = sessionData.session.user.id;
    const env = await resolveUserEnvironment(supabase, userId);

    if (env.type === "client") {
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
