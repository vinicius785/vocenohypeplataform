import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getClienteLinkData } from "@/lib/cliente-link.functions";
import { usePortalLang, type PortalLang } from "@/lib/portal-i18n";
import type { Workspace } from "@/lib/workspace-store";
import type { ClienteLinkData } from "@/lib/portal-types";

/**
 * Estado compartilhado do Portal do Cliente entre a rota-pai
 * (`routes/portal.$token/route.tsx`, dona do loader) e todas as rotas-filha
 * (início, campanha, relatórios, solicitações). Centraliza aqui o que antes
 * vivia solto dentro do componente único de `portal.$token.tsx`: os dados
 * carregados, o polling de atualização, e o `reload()` chamado depois de
 * cada mutação (aprovar/reprovar, salvar briefing, etc) — nada disso mudou
 * de comportamento, só de lugar.
 */
export type PortalContextValue = {
  token: string;
  data: ClienteLinkData;
  reload: () => void;
  lang: PortalLang;
  setLang: (l: PortalLang) => void;
  ws: Workspace;
};

const PortalContext = createContext<PortalContextValue | null>(null);

export function usePortalData(): PortalContextValue {
  const ctx = useContext(PortalContext);
  if (!ctx) throw new Error("usePortalData() usado fora do PortalDataProvider");
  return ctx;
}

export function PortalDataProvider({
  token,
  initialData,
  ws,
  children,
}: {
  token: string;
  initialData: ClienteLinkData;
  ws: Workspace;
  children: React.ReactNode;
}) {
  const getDataFn = useServerFn(getClienteLinkData);
  const [data, setData] = useState<ClienteLinkData>(initialData);
  const [lang, setLang] = usePortalLang();
  const dataRef = useRef(data);
  dataRef.current = data;

  // Recarrega os dados depois de uma ação do cliente (aprovar/reprovar,
  // salvar briefing, etc) — o carregamento inicial já veio pronto do
  // servidor via loader, isso aqui só refresca em resposta a mutações.
  const reload = () => {
    getDataFn({ data: { token } })
      .then((row) => {
        setData(row as ClienteLinkData);
        document.title = `${(row as ClienteLinkData).clienteNome || "Portal"} · Hype`;
      })
      .catch(() => {
        /* mantém os últimos dados bons em tela — mesma tolerância a falha
         * de rede intermitente que o polling abaixo já tinha. */
      });
  };

  // Sem sessão/realtime nesse link público, então mudanças feitas pelo time
  // (ex.: apagar um relatório mensal na VI) só chegariam na VC no próximo
  // F5. Faz um polling leve (só com a aba visível, pra não gastar egress
  // à toa em background) pra refletir isso sozinho, sem o cliente precisar
  // atualizar a página.
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") reload();
    };
    const id = window.setInterval(tick, 20_000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <PortalContext.Provider value={{ token, data, reload, lang, setLang, ws }}>
      {children}
    </PortalContext.Provider>
  );
}
