import { useMemo, useState } from "react";
import { createFileRoute, Outlet } from "@tanstack/react-router";
import { DemoLinkInvalid } from "@/components/demo/DemoLinkInvalid";
import { PortalSessionDataProvider } from "@/components/portal/portal-session-context";
import { PortalV2ShellInner } from "@/features/client-portal-v2/layouts/PortalV2Shell";
import { DemoPortalRuntime } from "@/features/client-portal-v2/runtime/demo-runtime";
import { getDemoPortalData } from "@/lib/demo-public.functions";
import { DEMO_LINK_INVALID_MESSAGE } from "@/lib/demo/demo-types";

/**
 * Portal do cliente da DEMONSTRAÇÃO — `/demo/$token`. Mesmas páginas do Portal V2, sem login:
 * o token do link é a credencial, e o servidor o valida a cada chamada (existe, ativa, não
 * expirada, não revogada, não encerrada). Qualquer falha mostra a MESMA tela.
 *
 * `ssr: false`: tudo roda no navegador (como o `/portal-v2`). A página não é indexada e não
 * envia o endereço (que contém o token) como `referer`.
 */
export const Route = createFileRoute("/demo/$token")({
  ssr: false,
  loader: async ({ params }) => ({
    data: await getDemoPortalData({ data: { token: params.token } }),
  }),
  head: () => ({
    meta: [
      { title: "Demonstração · Hype" },
      { name: "robots", content: "noindex, nofollow" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  errorComponent: () => <DemoLinkInvalid />,
  component: DemoLayout,
});

function DemoLayout() {
  const { token } = Route.useParams();
  const { data } = Route.useLoaderData();
  const [revoked, setRevoked] = useState(false);

  const source = useMemo(
    () => ({
      load: () => getDemoPortalData({ data: { token } }),
      // O link foi revogado/expirou/encerrado durante a sessão: mostra a tela de link inválido
      // em vez de deixar dados velhos parados na tela.
      onError: (error: unknown) => {
        if (error instanceof Error && error.message === DEMO_LINK_INVALID_MESSAGE) {
          setRevoked(true);
        }
      },
    }),
    [token],
  );

  if (revoked) return <DemoLinkInvalid />;

  return (
    <DemoPortalRuntime token={token}>
      <PortalSessionDataProvider initialData={data} source={source}>
        <PortalV2ShellInner>
          <Outlet />
        </PortalV2ShellInner>
      </PortalSessionDataProvider>
    </DemoPortalRuntime>
  );
}
