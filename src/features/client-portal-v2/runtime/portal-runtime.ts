import { createContext, useCallback, useContext, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import type {
  AddComentarioInputT,
  ReportUrlInputT,
  RespondEntregaInputT,
  RespondInfluInputT,
} from "@/lib/demo/demo-public";

/**
 * Contexto de EXECUÇÃO do Portal V2: de onde vêm os caminhos, as ações e a identidade.
 *
 * O mesmo conjunto de páginas serve o portal real (`/portal-v2`, com sessão) e a Demo
 * (`/demo/$token`, sem sessão): o que muda é só este contexto. O portal real continua
 * exatamente como era — `paths.rebase` é a identidade e as ações são as funções `*Session`.
 */

export type PortalNavItem = "inicio" | "campanhas" | "relatorios" | "arquivos";

export type PortalPaths = {
  /** `/portal-v2` ou `/demo/<token>`. */
  base: string;
  /** Troca o prefixo `/portal-v2` de um caminho gerado pelo `derive.ts` pelo `base` atual. */
  rebase: (href: string) => string;
  inicio: () => string;
  campanhas: () => string;
  campanha: (id: string) => string;
  relatorios: () => string;
  arquivos: () => string;
  /** O caminho atual pertence ao item de navegação? */
  isActive: (pathname: string, item: PortalNavItem) => boolean;
};

const REAL_BASE = "/portal-v2";

export function makePortalPaths(base: string): PortalPaths {
  const rebase = (href: string) =>
    base === REAL_BASE
      ? href
      : href === REAL_BASE || href.startsWith(`${REAL_BASE}/`) || href.startsWith(`${REAL_BASE}?`)
        ? base + href.slice(REAL_BASE.length)
        : href;
  const paths: PortalPaths = {
    base,
    rebase,
    inicio: () => `${base}/inicio`,
    campanhas: () => `${base}/campanhas`,
    campanha: (id) => `${base}/campanhas/${id}`,
    relatorios: () => `${base}/relatorios`,
    arquivos: () => `${base}/arquivos`,
    isActive: (pathname, item) => pathname.startsWith(paths[item]()),
  };
  return paths;
}

export type PortalApi = {
  respondInflu: (input: RespondInfluInputT) => Promise<unknown>;
  respondEntrega: (input: RespondEntregaInputT) => Promise<unknown>;
  addComentario: (input: AddComentarioInputT) => Promise<unknown>;
  freshRelatorioUrl: (input: ReportUrlInputT) => Promise<{ url: string }>;
};

export type PortalCapabilities = {
  /** Menu da conta (Configurações, Sair). */
  accountMenu: boolean;
  /** Troca de ambiente (quem tem mais de uma organização). */
  environmentSwitch: boolean;
};

export type PortalIdentity = { name: string; secondary: string; email: string };

export type PortalRuntime = {
  paths: PortalPaths;
  api: PortalApi;
  capabilities: PortalCapabilities;
  /** Identidade fixa (Demo). Ausente = vem da sessão Supabase (portal real). */
  identity: PortalIdentity | null;
  /** Selo na barra superior (Demo). */
  banner: ReactNode;
};

export const PortalRuntimeContext = createContext<PortalRuntime | null>(null);

export function usePortalRuntime(): PortalRuntime {
  const ctx = useContext(PortalRuntimeContext);
  if (!ctx) throw new Error("usePortalRuntime() usado fora do PortalRuntimeProvider");
  return ctx;
}

/**
 * Navega para um caminho do portal. Aceita o caminho do portal REAL (`/portal-v2/...`, como o
 * `derive.ts` e as páginas já escrevem) e o reescreve para o prefixo do contexto atual.
 */
export function usePortalNavigate() {
  const navigate = useNavigate();
  const { paths } = usePortalRuntime();
  return useCallback(
    (opts: { to: string; search?: unknown; replace?: boolean }) =>
      navigate({ ...opts, to: paths.rebase(opts.to) } as never),
    [navigate, paths],
  );
}

/** Nome e papel de quem está vendo: da sessão (portal real) ou fixos (Demo). */
export function usePortalIdentity(roleLabel: string | null): PortalIdentity {
  const { identity } = usePortalRuntime();
  const { data: authUser } = useQuery({
    queryKey: ["portal-v2-user"],
    queryFn: async () => (await supabase.auth.getUser()).data.user,
    staleTime: 5 * 60 * 1000,
    enabled: !identity,
  });
  if (identity) return identity;
  const name = (authUser?.user_metadata?.full_name as string | undefined) || authUser?.email || "";
  return { name, secondary: roleLabel ?? "", email: authUser?.email ?? "" };
}
