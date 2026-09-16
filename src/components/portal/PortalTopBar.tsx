import { useState } from "react";
import { Menu } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { IconButton } from "@/components/ui/icon-button";
import { PORTAL_LANGS, type PortalLang } from "@/lib/portal-i18n";
import type { Workspace } from "@/lib/workspace-store";

/**
 * Topbar compacta do portal — extraída do `TopBar` inline de
 * `routes/portal.$token.tsx` (Etapa 2, shell/navegação). Comportamento do
 * seletor de idioma preservado tal qual; ganha só a identidade do cliente
 * (antes vivia num card grande na sidebar) e o botão de menu mobile.
 */
export function PortalTopBar({
  ws,
  clienteNome,
  clienteFoto,
  lang,
  onLangChange,
  onOpenMenu,
}: {
  ws: Workspace;
  clienteNome?: string;
  clienteFoto?: string;
  lang: PortalLang;
  onLangChange: (l: PortalLang) => void;
  /** Só definido no layout mobile — abre a sidebar em `Sheet`. */
  onOpenMenu?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const current = PORTAL_LANGS.find((l) => l.code === lang) ?? PORTAL_LANGS[0];
  return (
    <header className="flex h-14 shrink-0 items-center gap-2.5 border-b border-border bg-background px-4 sm:px-5">
      {onOpenMenu && (
        <IconButton label="Menu" tone="neutral" onClick={onOpenMenu} className="-ml-1.5">
          <Menu className="h-4.5 w-4.5" />
        </IconButton>
      )}

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

      <div className="relative ml-auto">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-sm hover:bg-muted"
          aria-label="Idioma"
        >
          <span className="text-base leading-none">{current.flag}</span>
          <span className="hidden text-xs font-medium text-foreground sm:inline">
            {current.label}
          </span>
        </button>
        {open && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
            <div className="absolute right-0 z-20 mt-1.5 w-40 overflow-hidden rounded-lg border border-border bg-popover shadow-md">
              {PORTAL_LANGS.map((l) => (
                <button
                  key={l.code}
                  type="button"
                  onClick={() => {
                    onLangChange(l.code);
                    setOpen(false);
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
    </header>
  );
}
