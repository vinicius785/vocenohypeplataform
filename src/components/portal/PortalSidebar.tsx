import { useState } from "react";
import { Link, useParams, useRouterState } from "@tanstack/react-router";
import {
  CheckCircle2,
  ChevronDown,
  FileBarChart,
  LayoutGrid,
  Megaphone,
  MessageSquareText,
} from "lucide-react";
import { campanhaStatus } from "@/components/campanhas/campanha-ui";
import { t, type PortalLang } from "@/lib/portal-i18n";
import type { PublicCampanha } from "@/lib/portal-types";

/**
 * Navegação lateral do portal (Etapa 2) — reusa a MESMA `campanhaStatus()`
 * (`src/components/campanhas/campanha-ui.ts`) e o mesmo padrão de
 * disclosure "ocultar encerradas por padrão, com contagem" já construído
 * pra Campanhas internas (`CampanhasSection.tsx`) — nenhuma lógica de
 * status nova. `PublicCampanha` não carrega todos os campos que
 * `campanhaStatus` espera de `Campaign` (ex.: `pagClienteTipo` completo),
 * então usamos um objeto-adaptador mínimo só com os campos que a função
 * realmente lê (`prazo`, `pagClienteTipo`) — a lógica em si não é
 * reimplementada, só chamada com um shape compatível.
 */
function toStatusShim(c: PublicCampanha) {
  return {
    prazo: c.prazo,
    pagClienteTipo: c.isRecorrente ? ("Recorrente" as const) : undefined,
  } as Parameters<typeof campanhaStatus>[0];
}

function NavLink({
  to,
  params,
  active,
  icon,
  label,
  badge,
}: {
  to: string;
  params: Record<string, string>;
  active: boolean;
  icon: React.ReactNode;
  label: string;
  badge?: number;
}) {
  return (
    <Link
      to={to}
      params={params}
      className={`flex min-h-11 w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm font-medium transition-colors ${
        active ? "bg-muted" : "hover:bg-muted/60"
      }`}
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-foreground">
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate text-foreground">{label}</span>
      {!!badge && (
        <span className="ml-auto inline-flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded-full bg-amber-500/15 px-1 text-[10px] font-semibold text-amber-700 dark:text-amber-400">
          {badge}
        </span>
      )}
    </Link>
  );
}

export function PortalSidebar({
  token,
  campanhas,
  totalAguardando,
  aguardandoPorCampanha,
  lang,
}: {
  token: string;
  campanhas: PublicCampanha[];
  totalAguardando: number;
  aguardandoPorCampanha: (c: PublicCampanha) => number;
  lang: PortalLang;
}) {
  const params = useParams({ strict: false });
  const activeCampanhaId = (params as { campanhaId?: string }).campanhaId;
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [showEncerradas, setShowEncerradas] = useState(false);
  const today = new Date();

  const ativas = campanhas.filter((c) => campanhaStatus(toStatusShim(c), today) !== "encerrada");
  const encerradas = campanhas.filter(
    (c) => campanhaStatus(toStatusShim(c), today) === "encerrada",
  );

  const campanhaItem = (c: PublicCampanha) => (
    <NavLink
      key={c.id}
      to="/portal/$token/campanhas/$campanhaId"
      params={{ token, campanhaId: c.id }}
      active={activeCampanhaId === c.id}
      icon={<Megaphone className="h-3.5 w-3.5" />}
      label={c.nome}
      badge={aguardandoPorCampanha(c)}
    />
  );

  return (
    <nav className="flex flex-col overflow-hidden">
      <NavLink
        to="/portal/$token/inicio"
        params={{ token }}
        active={!activeCampanhaId}
        icon={<LayoutGrid className="h-3.5 w-3.5" />}
        label={t(lang, "navInicio")}
      />
      <NavLink
        to="/portal/$token/aprovacoes"
        params={{ token }}
        active={pathname.endsWith("/aprovacoes")}
        icon={<CheckCircle2 className="h-3.5 w-3.5" />}
        label="Aprovações"
        badge={totalAguardando}
      />

      <p className="border-t border-border px-3.5 pb-1.5 pt-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        {t(lang, "statCampanhas")}
      </p>
      {ativas.length === 0 && encerradas.length === 0 && (
        <p className="px-3.5 py-2.5 text-xs text-muted-foreground">{t(lang, "navNoCampanhas")}</p>
      )}
      {ativas.map(campanhaItem)}

      {encerradas.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setShowEncerradas((v) => !v)}
            className="flex min-h-11 items-center gap-1.5 px-3.5 py-2.5 text-left text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronDown
              className={`h-3.5 w-3.5 transition-transform ${showEncerradas ? "rotate-180" : ""}`}
            />
            {showEncerradas
              ? t(lang, "ocultarEncerradas")
              : t(lang, "verEncerradas", { n: encerradas.length })}
          </button>
          {showEncerradas && encerradas.map(campanhaItem)}
        </>
      )}

      <div className="border-t border-border" />
      <NavLink
        to="/portal/$token/relatorios"
        params={{ token }}
        active={pathname.endsWith("/relatorios")}
        icon={<FileBarChart className="h-3.5 w-3.5" />}
        label={t(lang, "navRelatorios")}
      />
      <NavLink
        to="/portal/$token/solicitacoes"
        params={{ token }}
        active={pathname.endsWith("/solicitacoes")}
        icon={<MessageSquareText className="h-3.5 w-3.5" />}
        label={t(lang, "navSolicitacoes")}
      />
    </nav>
  );
}
