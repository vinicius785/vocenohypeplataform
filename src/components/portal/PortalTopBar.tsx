import { useState } from "react";
import { Link, useParams, useRouterState } from "@tanstack/react-router";
import { Bell, Menu, PanelLeft } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { IconButton } from "@/components/ui/icon-button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { initialsOf, type ApprovalItem } from "./portal-widgets";
import { PORTAL_LANGS, type PortalLang } from "@/lib/portal-i18n";
import type { ClienteLinkData } from "@/lib/portal-types";
import type { Workspace } from "@/lib/workspace-store";

/**
 * Topbar fina do portal — correção estrutural: volta a ser só uma barra
 * de apoio (igual à topbar interna, `AppShell.tsx`'s `<header
 * className="flex h-16 items-center ...">`), sem navegação horizontal
 * (isso volta a viver na sidebar). Mantém: toggle de sidebar (recolher
 * no desktop / abrir drawer no mobile), título da página atual, sino de
 * pendências reais, idioma. Sem ícone de conta — não existe conta de
 * usuário nesse modelo anônimo (mesma decisão do rodapé da sidebar).
 */
export function PortalTopBar({
  ws,
  lang,
  onLangChange,
  token,
  data,
  pendingItems,
  collapsed,
  onToggleCollapsed,
  onOpenMobileSidebar,
}: {
  ws: Workspace;
  lang: PortalLang;
  onLangChange: (l: PortalLang) => void;
  token?: string;
  data?: ClienteLinkData;
  pendingItems?: ApprovalItem[];
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  onOpenMobileSidebar?: () => void;
}) {
  const [langOpen, setLangOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const params = useParams({ strict: false });
  const current = PORTAL_LANGS.find((l) => l.code === lang) ?? PORTAL_LANGS[0];

  const campanhaId = (params as { campanhaId?: string }).campanhaId;
  const pageTitle = campanhaId
    ? (data?.campanhas.find((c) => c.id === campanhaId)?.nome ?? "Campanha")
    : pathname.endsWith("/campanhas")
      ? "Campanhas"
      : "Início";

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-border bg-background px-4 sm:px-6">
      {token ? (
        <>
          <IconButton
            label={collapsed ? "Expandir menu" : "Recolher menu"}
            tone="neutral"
            onClick={onToggleCollapsed}
            className="hidden md:inline-flex"
          >
            <PanelLeft className="h-4.5 w-4.5" />
          </IconButton>
          <IconButton
            label="Abrir menu"
            tone="neutral"
            onClick={onOpenMobileSidebar}
            className="md:hidden"
          >
            <Menu className="h-4.5 w-4.5" />
          </IconButton>
        </>
      ) : (
        <div className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-md bg-foreground text-background">
          {ws.logo ? (
            <img src={ws.logo} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="text-[11px] font-bold">{ws.nome.charAt(0).toUpperCase()}</span>
          )}
        </div>
      )}

      <p className="min-w-0 truncate text-sm font-semibold text-foreground">{pageTitle}</p>

      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        {token && (
          <Popover>
            <PopoverTrigger asChild>
              <div className="relative">
                <IconButton label="Notificações" tone="neutral">
                  <Bell className="h-4.5 w-4.5" />
                </IconButton>
                {!!pendingItems?.length && (
                  <Badge
                    variant="warning"
                    className="absolute -right-1 -top-1 h-4 min-w-[16px] justify-center rounded-full px-1 text-[9px]"
                  >
                    {pendingItems.length}
                  </Badge>
                )}
              </div>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 p-0">
              <div className="border-b border-border px-3.5 py-2.5">
                <p className="text-sm font-semibold text-foreground">Hypito</p>
                <p className="text-xs text-muted-foreground">Pendências em suas campanhas</p>
              </div>
              {!pendingItems?.length ? (
                <p className="px-3.5 py-6 text-center text-xs text-muted-foreground">
                  Nenhuma pendência no momento.
                </p>
              ) : (
                <div className="max-h-80 divide-y divide-border overflow-y-auto">
                  {pendingItems.slice(0, 8).map((item) => (
                    <Link
                      key={
                        item.kind === "influ"
                          ? `influ:${item.inf.id}`
                          : `${item.kind}:${item.entrega.id}`
                      }
                      to="/portal/$token/campanhas/$campanhaId"
                      params={{ token, campanhaId: item.campanhaId }}
                      hash="aguardando-voce"
                      className="flex items-center gap-2.5 px-3.5 py-2.5 text-left transition-colors hover:bg-muted/40"
                    >
                      <Avatar className="h-8 w-8 shrink-0">
                        {item.inf.foto && <AvatarImage src={item.inf.foto} alt={item.inf.nome} />}
                        <AvatarFallback className="text-xs font-semibold">
                          {initialsOf(item.inf.nome)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium text-foreground">
                          {item.inf.nome}
                        </p>
                        <p className="truncate text-[11px] text-muted-foreground">
                          {item.campanhaNome}
                        </p>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </PopoverContent>
          </Popover>
        )}

        <div className="relative">
          <button
            type="button"
            onClick={() => setLangOpen((o) => !o)}
            className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-sm hover:bg-muted"
            aria-label="Idioma"
          >
            <span className="text-base leading-none">{current.flag}</span>
            <span className="hidden text-xs font-medium text-foreground sm:inline">
              {current.label}
            </span>
          </button>
          {langOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setLangOpen(false)} />
              <div className="absolute right-0 z-20 mt-1.5 w-40 overflow-hidden rounded-lg border border-border bg-popover shadow-md">
                {PORTAL_LANGS.map((l) => (
                  <button
                    key={l.code}
                    type="button"
                    onClick={() => {
                      onLangChange(l.code);
                      setLangOpen(false);
                    }}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted ${
                      l.code === lang ? "bg-muted font-medium" : ""
                    }`}
                  >
                    <span className="text-base leading-none">{l.flag}</span>
                    {l.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
