import { useMemo } from "react";
import { createFileRoute, Outlet } from "@tanstack/react-router";
import { PortalSessionDataProvider } from "@/components/portal/portal-session-context";
import { PortalV2ShellInner } from "@/features/client-portal-v2/layouts/PortalV2Shell";
import { PreviewPortalRuntime } from "@/features/client-portal-v2/runtime/preview-runtime";
import { getPortalPreviewData } from "@/lib/portal-preview.functions";

/**
 * Portal do cliente visto PELO TIME — `/preview-cliente/$clienteId`. Mesmas páginas do Portal
 * V2, sem credenciais do cliente: vale a sessão da equipe (sob `_authenticated`) e o servidor
 * confere a permissão a cada leitura. Somente leitura.
 */
export const Route = createFileRoute("/_authenticated/preview-cliente/$clienteId")({
  ssr: false,
  loader: async ({ params }) => ({
    data: await getPortalPreviewData({ data: { clienteId: params.clienteId } }),
  }),
  head: () => ({
    meta: [
      { title: "Portal do cliente · Visualização" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  errorComponent: ({ error }) => (
    <div className="mx-auto max-w-md p-10 text-center text-sm text-muted-foreground">
      {error instanceof Error ? error.message : "Não foi possível abrir o portal do cliente."}
    </div>
  ),
  component: PreviewLayout,
});

function PreviewLayout() {
  const { clienteId } = Route.useParams();
  const { data } = Route.useLoaderData();
  const source = useMemo(
    () => ({ load: () => getPortalPreviewData({ data: { clienteId } }) }),
    [clienteId],
  );
  return (
    <PreviewPortalRuntime clienteId={clienteId}>
      <PortalSessionDataProvider initialData={data} source={source}>
        <PortalV2ShellInner>
          <Outlet />
        </PortalV2ShellInner>
      </PortalSessionDataProvider>
    </PreviewPortalRuntime>
  );
}
