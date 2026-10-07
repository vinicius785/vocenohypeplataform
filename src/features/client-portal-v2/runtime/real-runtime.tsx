import { useMemo, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  addArtigoComentarioSession,
  addInfluClienteComentario,
  getFreshRelatorioUrlSession,
  loadArtigoEngagementSession,
  toggleArtigoLikeSession,
  respondCampanhaEntregaSession,
  respondCampanhaInfluSession,
} from "@/lib/portal-auth.functions";
import { PortalRuntimeProvider } from "./portal-runtime-provider";
import { makePortalPaths, type PortalApi, type PortalRuntime } from "./portal-runtime";

const REAL_PATHS = makePortalPaths("/portal-v2");

/** Runtime do portal REAL (`/portal-v2`): sessão Supabase, funções `*Session`. */
export function RealPortalRuntime({ children }: { children: ReactNode }) {
  const respondInflu = useServerFn(respondCampanhaInfluSession);
  const respondEntrega = useServerFn(respondCampanhaEntregaSession);
  const addComentario = useServerFn(addInfluClienteComentario);
  const freshRelatorioUrl = useServerFn(getFreshRelatorioUrlSession);
  const loadEngagement = useServerFn(loadArtigoEngagementSession);
  const toggleLike = useServerFn(toggleArtigoLikeSession);
  const addArtigoComment = useServerFn(addArtigoComentarioSession);

  const value = useMemo<PortalRuntime>(() => {
    const api: PortalApi = {
      respondInflu: (data) => respondInflu({ data }),
      respondEntrega: (data) => respondEntrega({ data }),
      addComentario: (data) => addComentario({ data }),
      freshRelatorioUrl: (data) => freshRelatorioUrl({ data }),
      loadArtigoEngagement: (postId) => loadEngagement({ data: { postId } }),
      toggleArtigoLike: (postId) => toggleLike({ data: { postId } }),
      addArtigoComentario: (postId, body) => addArtigoComment({ data: { postId, body } }),
    };
    return {
      paths: REAL_PATHS,
      api,
      capabilities: { accountMenu: true, environmentSwitch: true },
      identity: null,
      banner: null,
    };
  }, [
    respondInflu,
    respondEntrega,
    addComentario,
    freshRelatorioUrl,
    loadEngagement,
    toggleLike,
    addArtigoComment,
  ]);

  return <PortalRuntimeProvider value={value}>{children}</PortalRuntimeProvider>;
}
