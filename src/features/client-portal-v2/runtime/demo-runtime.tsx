import { useMemo, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { DemoChip } from "@/components/demo/DemoChip";
import {
  addDemoComentario,
  getDemoRelatorioUrl,
  respondDemoEntrega,
  respondDemoInflu,
} from "@/lib/demo-public.functions";
import { PortalRuntimeProvider } from "./portal-runtime-provider";
import { makePortalPaths, type PortalApi, type PortalRuntime } from "./portal-runtime";

/**
 * Runtime da DEMONSTRAÇÃO (`/demo/$token`): sem sessão — toda ação leva o token, e o servidor
 * deriva a campanha. Sem Configurações, sem sair, sem troca de ambiente; identidade fixa.
 */
export function DemoPortalRuntime({ token, children }: { token: string; children: ReactNode }) {
  const respondInflu = useServerFn(respondDemoInflu);
  const respondEntrega = useServerFn(respondDemoEntrega);
  const addComentario = useServerFn(addDemoComentario);
  const freshRelatorioUrl = useServerFn(getDemoRelatorioUrl);

  const value = useMemo<PortalRuntime>(() => {
    const noArtigos = () => Promise.reject(new Error("Conteúdos não fazem parte da demonstração."));
    const api: PortalApi = {
      respondInflu: (data) => respondInflu({ data: { token, ...data } }),
      respondEntrega: (data) => respondEntrega({ data: { token, ...data } }),
      addComentario: (data) => addComentario({ data: { token, ...data } }),
      freshRelatorioUrl: (data) =>
        freshRelatorioUrl({ data: { token, ...data } }) as Promise<{ url: string }>,
      // A Demo não tem artigos (`artigos: []`): nada a carregar nem a gravar.
      loadArtigoEngagement: noArtigos,
      toggleArtigoLike: noArtigos,
      addArtigoComentario: noArtigos,
    };
    return {
      paths: makePortalPaths(`/demo/${token}`),
      api,
      capabilities: { accountMenu: false, environmentSwitch: false },
      identity: { name: "Cliente", secondary: "Demonstração", email: "" },
      banner: <DemoChip />,
    };
  }, [token, respondInflu, respondEntrega, addComentario, freshRelatorioUrl]);

  return <PortalRuntimeProvider value={value}>{children}</PortalRuntimeProvider>;
}
