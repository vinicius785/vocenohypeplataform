import { useMemo, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Badge } from "@/components/ui/badge";
import { getPortalPreviewArtigoEngagement } from "@/lib/portal-preview.functions";
import { PortalRuntimeProvider } from "./portal-runtime-provider";
import { makePortalPaths, type PortalApi, type PortalRuntime } from "./portal-runtime";

const READ_ONLY = () =>
  Promise.reject(
    new Error("Visualização do time: somente leitura. O cliente age pelo portal dele."),
  );

/**
 * Runtime da VISUALIZAÇÃO do time (`/preview-cliente/$clienteId`): o time vê o portal como o
 * cliente vê, sem credenciais do cliente. Somente leitura — toda ação de escrita é recusada
 * (e o papel `client_viewer` já esconde os botões).
 */
export function PreviewPortalRuntime({
  clienteId,
  children,
}: {
  clienteId: string;
  children: ReactNode;
}) {
  const loadEngagement = useServerFn(getPortalPreviewArtigoEngagement);
  const value = useMemo<PortalRuntime>(() => {
    const api: PortalApi = {
      respondInflu: READ_ONLY,
      respondEntrega: READ_ONLY,
      addComentario: READ_ONLY,
      // Relatórios já vêm com URL assinada nos dados; renovar exigiria uma função por sessão.
      freshRelatorioUrl: READ_ONLY as PortalApi["freshRelatorioUrl"],
      // Leitura: o time vê as curtidas/comentários reais do cliente. Escrever é recusado.
      loadArtigoEngagement: (postId) => loadEngagement({ data: { clienteId, postId } }),
      toggleArtigoLike: READ_ONLY,
      addArtigoComentario: READ_ONLY,
    };
    return {
      paths: makePortalPaths(`/preview-cliente/${clienteId}`),
      api,
      capabilities: { accountMenu: false, environmentSwitch: false, teamPreview: true },
      identity: { name: "Cliente", secondary: "Visualização do time", email: "" },
      banner: (
        <Badge
          variant="info"
          title="Você está vendo o portal como o cliente vê. Nada aqui altera dados."
        >
          Visualização do time · somente leitura
        </Badge>
      ),
    };
  }, [clienteId, loadEngagement]);
  return <PortalRuntimeProvider value={value}>{children}</PortalRuntimeProvider>;
}
