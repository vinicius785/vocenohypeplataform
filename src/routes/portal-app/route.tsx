import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { resolveUserEnvironment } from "@/lib/user-environment.server";

/**
 * Layout guard for the NEW authenticated client portal (session + org
 * based), parallel to the existing token-based `portal.$token/**` routes —
 * those are untouched and keep working exactly as before. This phase only
 * needs a minimal authenticated home; the full portal UI (reusing the
 * influencer-approval redesign, campaign pages, etc, now backed by real
 * sessions) is phase 2/3 work — see CLAUDE.md.
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
    if (env.type !== "client") {
      // Internal users, users with multiple environments, or pending users
      // never see the client portal shell directly — send them wherever
      // `resolveUserEnvironment` says they actually belong.
      throw redirect({ to: env.redirectTo });
    }
    return { userId, organizationId: env.organizationId };
  },
  component: () => <Outlet />,
});
