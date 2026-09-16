import { useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Bell } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { IconButton } from "@/components/ui/icon-button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { initialsOf, type ApprovalItem } from "./portal-widgets";
import { PORTAL_LANGS, type PortalLang } from "@/lib/portal-i18n";
import type { Workspace } from "@/lib/workspace-store";

const NAV_ITEMS = [
  { to: "/portal/$token/inicio", label: "Início", match: "/inicio" },
  { to: "/portal/$token/campanhas", label: "Campanhas", match: "/campanhas" },
  { to: "/portal/$token/solicitacoes", label: "Solicitações", match: "/solicitacoes" },
] as const;

/**
 * Topbar do portal — correção visual/estrutural: identidade estática do
 * cliente (sem seletor — o modelo de acesso hoje é 1 token = 1 cliente,
 * sem noção de usuário/sessão, então nunca há "vários clientes" pra
 * trocar; se isso mudar no futuro, é aqui que entraria um `Popover`
 * pesquisável, não antes), nav central (Início/Campanhas/Solicitações,
 * estado ativo `bg-brand-subtle text-brand` — mesma classe usada pelo
 * item ativo da sidebar interna, `AppShell.tsx`), e um sino de
 * notificações à direita com as pendências REAIS já computadas em toda a
 * plataforma (nunca uma notificação inventada — mesmo critério de sempre,
 * `collectPendingApprovals`). Sem "conta do usuário": esse modelo
 * anônimo não tem conta alguma pra mostrar.
 */
export function PortalTopBar({
  ws,
  clienteNome,
  clienteFoto,
  lang,
  onLangChange,
  token,
  pendingItems,
}: {
  ws: Workspace;
  clienteNome?: string;
  clienteFoto?: string;
  lang: PortalLang;
  onLangChange: (l: PortalLang) => void;
  /** Só definido quando há dados carregados — habilita nav + sino. */
  token?: string;
  pendingItems?: ApprovalItem[];
}) {
  const [langOpen, setLangOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const current = PORTAL_LANGS.find((l) => l.code === lang) ?? PORTAL_LANGS[0];

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-border bg-background px-4 sm:px-6">
      <div className="flex min-w-0 items-center gap-2.5">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-md bg-foreground text-background">
          {ws.logo ? (
            <img src={ws.logo} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="text-[11px] font-bold">{ws.nome.charAt(0).toUpperCase()}</span>
          )}
        </div>
        <span className="hidden text-sm font-semibold text-foreground sm:inline">{ws.nome}</span>

        {clienteNome && (
          <div className="ml-1 flex min-w-0 items-center gap-1.5 border-l border-border pl-2.5 sm:ml-2 sm:pl-3">
            <Avatar className="h-6 w-6 shrink-0">
              {clienteFoto && <AvatarImage src={clienteFoto} alt={clienteNome} />}
              <AvatarFallback className="text-[10px] font-semibold">
                {clienteNome.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <span className="min-w-0 truncate text-sm font-medium text-foreground">
              {clienteNome}
            </span>
          </div>
        )}
      </div>

      {token && (
        <nav className="hidden items-center gap-1 md:flex">
          {NAV_ITEMS.map((item) => {
            const active = pathname.includes(item.match);
            return (
              <Link
                key={item.to}
                to={item.to}
                params={{ token }}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  active
                    ? "bg-brand-subtle text-brand"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      )}

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
