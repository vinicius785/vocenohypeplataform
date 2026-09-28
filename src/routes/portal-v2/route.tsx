import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { resolveUserEnvironment } from "@/lib/user-environment.server";
import { getPortalDataForSession } from "@/lib/portal-auth.functions";
import { shouldRequireMfaChallenge } from "@/lib/mfa.functions";
import { acceptPendingInvites } from "@/lib/accept-invite.functions";
import {
  PortalSessionDataProvider,
  type PortalSessionData,
} from "@/components/portal/portal-session-context";
import { PortalV2Shell } from "@/features/client-portal-v2/layouts/PortalV2Shell";

/**
 * Guarda de sessão da V2 — MESMA lógica de resolução de sessão/organização
 * ativa/MFA/must-change-password de `/portal-app/route.tsx` (autenticação é
 * uma das poucas coisas explicitamente reaproveitáveis, ver pedido do
 * usuário), porque reescrever essa parte do zero só reintroduziria bugs já
 * corrigidos ali (ordenação suspenso/pendente, cookie de ambiente ativo
 * nunca confiado sem revalidação, etc). O que É novo aqui é td o resto:
 * shell, navegação, layout, páginas — nenhum componente visual da V1 é
 * importado por esta árvore de rotas.
 */
async function checkMustChangePassword(userId: string): Promise<boolean> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("must_change_password")
    .eq("id", userId)
    .maybeSingle();
  return Boolean(profile?.must_change_password);
}

export const Route = createFileRoute("/portal-v2")({
  ssr: false,
  beforeLoad: async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
      throw redirect({ to: "/" });
    }

    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (shouldRequireMfaChallenge(aal?.currentLevel ?? null, aal?.nextLevel ?? null)) {
      throw redirect({ to: "/" });
    }

    const userId = sessionData.session.user.id;
    let env = await resolveUserEnvironment(supabase, userId);

    if (env.type === "pending") {
      try {
        const { activated } = await acceptPendingInvites();
        if (activated > 0) env = await resolveUserEnvironment(supabase, userId);
      } catch {
        /* segue com o env original (pending) */
      }
    }

    let organizationId: string | null = null;
    if (env.type === "client") {
      organizationId = env.organizationId;
    } else if (env.type === "multiple") {
      const { getActivePortalOrganization } = await import("@/lib/portal-auth.functions");
      const resolved = await getActivePortalOrganization();
      organizationId = resolved.organizationId;
    }

    if (!organizationId) {
      throw redirect({ to: env.redirectTo });
    }

    const mustChangePassword = await checkMustChangePassword(userId);
    if (mustChangePassword) {
      throw redirect({ to: "/criar-senha" });
    }

    return { userId, organizationId };
  },
  loader: async () => {
    const data = (await getPortalDataForSession()) as PortalSessionData;
    return { clienteData: data };
  },
  component: PortalV2Layout,
});

function PortalV2Layout() {
  const { clienteData } = Route.useLoaderData();
  return (
    <PortalSessionDataProvider initialData={clienteData}>
      <PortalV2Shell>
        <Outlet />
      </PortalV2Shell>
    </PortalSessionDataProvider>
  );
}
