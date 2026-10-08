import { createFileRoute, Outlet, redirect, useRouter } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { resolveUserEnvironment } from "@/lib/user-environment.server";
import {
  getPendingNpsSession,
  getPortalDataForSession,
  recordPortalAccess,
} from "@/lib/portal-auth.functions";
import { shouldRequireMfaChallenge } from "@/lib/mfa.functions";
import { acceptPendingInvites } from "@/lib/accept-invite.functions";
import {
  PortalSessionDataProvider,
  type PortalSessionData,
} from "@/components/portal/portal-session-context";
import { PortalV2Shell } from "@/features/client-portal-v2/layouts/PortalV2Shell";
import { RealPortalRuntime } from "@/features/client-portal-v2/runtime/real-runtime";
import { NpsForm, NpsGateError } from "@/features/client-portal-v2/components/PendingNpsGate";
import { decideNpsGuard, NPS_ROUTE } from "@/features/client-portal-v2/nps-guard";

const ACCESS_RECORD_TAB_MS = 30 * 60 * 1000;
const lastRecordedByOrg = new Map<string, number>();
function shouldRecordAccess(organizationId: string): boolean {
  const last = lastRecordedByOrg.get(organizationId) ?? 0;
  if (Date.now() - last < ACCESS_RECORD_TAB_MS) return false;
  lastRecordedByOrg.set(organizationId, Date.now());
  return true;
}

type NpsBlockedData = {
  npsBlocked: true;
  role: string;
  referenceMonth: string;
  pendentes: { campanhaId: string; nome: string }[];
};
type PortalLoaderData = PortalSessionData | NpsBlockedData;

function isNpsBlocked(d: PortalLoaderData): d is NpsBlockedData {
  return (d as NpsBlockedData).npsBlocked === true;
}

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
  beforeLoad: async ({ location }) => {
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

    // "Último acesso" real: a entrada no portal é registrada (no máx. 1x por 30 min por aba; o servidor
    // ainda limita a 1x/hora). Melhor esforço — nunca bloqueia nem derruba a navegação.
    if (shouldRecordAccess(organizationId)) {
      void recordPortalAccess({ data: { organizationId } }).catch(() => {});
    }

    const mustChangePassword = await checkMustChangePassword(userId);
    if (mustChangePassword) {
      throw redirect({ to: "/criar-senha" });
    }

    // NPS mensal obrigatório — checado no ROTEAMENTO, antes de qualquer
    // rota filha carregar. Pendência vem do servidor; se a consulta falhar
    // o erro propaga pro `errorComponent` (fail-closed: nunca libera o
    // portal sem saber o estado do NPS). Com pendência, qualquer rota
    // (inclusive URL digitada direto) vira `/portal-v2/nps?returnTo=...`.
    const { pendentes } = await getPendingNpsSession();
    const decision = decideNpsGuard({
      pathname: location.pathname,
      href: location.href,
      hasPending: pendentes.length > 0,
      returnTo: (location.search as { returnTo?: unknown }).returnTo,
    });
    if (decision.action === "toNps") {
      throw redirect({ to: NPS_ROUTE, search: { returnTo: decision.returnTo } });
    }
    if (decision.action === "leaveNps") {
      throw redirect({ href: decision.href });
    }

    return { userId, organizationId };
  },
  loader: async () => {
    // Defesa em profundidade: o próprio servidor não devolve dados do
    // portal enquanto houver NPS pendente (`npsBlocked`).
    const data = (await getPortalDataForSession()) as PortalLoaderData;
    return { clienteData: data };
  },
  errorComponent: PortalV2Error,
  component: PortalV2Layout,
});

function PortalV2Error({ error, reset }: { error: unknown; reset: () => void }) {
  const router = useRouter();
  return (
    <NpsGateError
      message={error instanceof Error ? error.message : undefined}
      onRetry={() => {
        reset();
        void router.invalidate();
      }}
    />
  );
}

function PortalV2Layout() {
  const { clienteData } = Route.useLoaderData();
  const router = useRouter();
  if (isNpsBlocked(clienteData)) {
    // Sem shell, sem sidebar, sem <Outlet/>: só o formulário. Depois de
    // enviar, `invalidate()` reexecuta o guard, que (sem pendência) manda
    // de volta pra rota original (`returnTo`).
    return <NpsForm pendentes={clienteData.pendentes} onSubmitted={() => router.invalidate()} />;
  }
  return (
    <RealPortalRuntime>
      <PortalSessionDataProvider initialData={clienteData}>
        <PortalV2Shell>
          <Outlet />
        </PortalV2Shell>
      </PortalSessionDataProvider>
    </RealPortalRuntime>
  );
}
