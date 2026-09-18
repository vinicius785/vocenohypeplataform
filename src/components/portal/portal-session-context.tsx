import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getPortalDataForSession } from "@/lib/portal-auth.functions";
import { usePortalLang, type PortalLang } from "@/lib/portal-i18n";
import type { ClienteLinkData } from "@/lib/portal-types";
import { supabase } from "@/integrations/supabase/client";

/**
 * Session-based counterpart of `src/components/portal/portal-context.tsx`
 * (`PortalDataProvider`/`usePortalData`), for the new `/portal-app/**`
 * route tree (Phase 2b). Same idea (holds the loaded data + polling +
 * `reload()` called after a mutation), but the data comes from
 * `getPortalDataForSession` (session + resolved active organization)
 * instead of `getClienteLinkData` (token) — no `token` field at all, since
 * nothing in this tree needs one.
 */
export type PortalSessionData = ClienteLinkData & { role: string };

export type PortalSessionContextValue = {
  data: PortalSessionData;
  reload: () => void;
  lang: PortalLang;
  setLang: (l: PortalLang) => void;
  /** true for `client_viewer` — every session mutation server-fn re-checks
   * this independently, this is only used to hide the buttons in the UI. */
  readOnly: boolean;
};

const PortalSessionContext = createContext<PortalSessionContextValue | null>(null);

export function usePortalSessionData(): PortalSessionContextValue {
  const ctx = useContext(PortalSessionContext);
  if (!ctx) throw new Error("usePortalSessionData() usado fora do PortalSessionDataProvider");
  return ctx;
}

export function PortalSessionDataProvider({
  initialData,
  children,
}: {
  initialData: PortalSessionData;
  children: React.ReactNode;
}) {
  const getDataFn = useServerFn(getPortalDataForSession);
  const [data, setData] = useState<PortalSessionData>(initialData);
  const [lang, setLang] = usePortalLang();
  const dataRef = useRef(data);
  dataRef.current = data;

  const reload = () => {
    getDataFn()
      .then((row) => {
        setData(row as PortalSessionData);
        document.title = `${(row as PortalSessionData).clienteNome || "Portal"} · Hype`;
      })
      .catch(() => {
        /* mantém os últimos dados bons em tela, mesma tolerância do
         * provider por token. */
      });
  };

  // Mesmo polling leve do provider por token — aqui a sessão já tem
  // realtime "de verdade" disponível (RLS libera `authenticated`), mas o
  // polling continua como rede de segurança simples, sem introduzir uma
  // segunda estratégia de sincronismo.
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
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel("rt-portal-app-campanha-influenciadores")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "campanha_influenciadores" },
        (payload) => {
          const row = payload.new as { campanha_id?: string } | undefined;
          if (!row?.campanha_id) return;
          if (!dataRef.current.campanhas.some((c) => c.id === row.campanha_id)) return;
          reload();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <PortalSessionContext.Provider
      value={{ data, reload, lang, setLang, readOnly: data.role === "client_viewer" }}
    >
      {children}
    </PortalSessionContext.Provider>
  );
}
