import { useMemo, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
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
  const value = useMemo<PortalRuntime>(() => {
    const api: PortalApi = {
      respondInflu: READ_ONLY,
      respondEntrega: READ_ONLY,
      addComentario: READ_ONLY,
      // Relatórios já vêm com URL assinada nos dados; renovar exigiria uma função por sessão.
      freshRelatorioUrl: READ_ONLY as PortalApi["freshRelatorioUrl"],
    };
    return {
      paths: makePortalPaths(`/preview-cliente/${clienteId}`),
      api,
      capabilities: { accountMenu: false, environmentSwitch: false },
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
  }, [clienteId]);
  return <PortalRuntimeProvider value={value}>{children}</PortalRuntimeProvider>;
}
