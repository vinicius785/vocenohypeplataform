import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Settings, LogOut, ShieldCheck, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const CLIENT_ROLE_LABEL: Record<string, string> = {
  client_admin: "Administrador",
  client_standard: "Membro",
  client_viewer: "Visualizador",
};

/**
 * Rodapé da sidebar — representa a PESSOA autenticada (nunca a empresa,
 * que já está no cabeçalho). Sem foto disponível hoje pra usuários do
 * portal (nenhum campo de avatar no dado da sessão) — o fallback de
 * iniciais é sempre usado, honestamente, em vez de inventar uma URL de
 * imagem. Cargo (`role`) ou, na ausência dele, e-mail — nunca hardcoded.
 */
export function ClientSidebarProfile({
  name,
  secondary,
  collapsed,
}: {
  name: string;
  secondary: string;
  collapsed: boolean;
}) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const initials =
    name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase())
      .join("") || "?";

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={collapsed ? name : undefined}
        className={`flex w-full items-center gap-2.5 rounded-md p-1.5 text-left transition-colors hover:bg-muted/60 ${
          collapsed ? "justify-center" : ""
        }`}
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-muted text-[11px] font-semibold text-muted-foreground">
          {initials}
        </div>
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-foreground">{name || "Sem nome"}</p>
            <p className="truncate text-xs text-muted-foreground">{secondary}</p>
          </div>
        )}
      </button>

      {open && (
        <div
          className={`absolute bottom-full z-20 mb-1 w-48 overflow-hidden rounded-md border border-border bg-popover p-1 shadow-lg ${
            collapsed ? "left-full ml-1" : "left-0"
          }`}
        >
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              navigate({ to: "/portal-v2/conta" });
            }}
            className="flex w-full items-center gap-2 rounded-sm px-2.5 py-2 text-left text-sm text-foreground hover:bg-muted"
          >
            <User className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            Minha conta
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              navigate({ to: "/portal-v2/conta" });
            }}
            className="flex w-full items-center gap-2 rounded-sm px-2.5 py-2 text-left text-sm text-foreground hover:bg-muted"
          >
            <ShieldCheck className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            Segurança
          </button>
          <div className="my-1 border-t border-border" />
          <button
            type="button"
            onClick={handleSignOut}
            className="flex w-full items-center gap-2 rounded-sm px-2.5 py-2 text-left text-sm text-foreground hover:bg-muted"
          >
            <LogOut className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            Sair
          </button>
        </div>
      )}
    </div>
  );
}

export function ClientSidebarSettingsLink({
  collapsed,
  onClick,
}: {
  collapsed: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={collapsed ? "Configurações" : undefined}
      className={`flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left text-sm text-muted-foreground transition-colors pill-nav-item ${
        collapsed ? "justify-center" : ""
      }`}
    >
      <Settings className="h-4 w-4 shrink-0" aria-hidden="true" />
      {!collapsed && "Configurações"}
    </button>
  );
}
