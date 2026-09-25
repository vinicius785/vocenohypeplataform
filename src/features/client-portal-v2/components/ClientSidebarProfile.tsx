import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { LogOut, Settings } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useClientProfile, initialsFromName } from "../lib/client-profile";

export const CLIENT_ROLE_LABEL: Record<string, string> = {
  client_admin: "Administrador",
  client_standard: "Administrador",
  client_approver: "Aprovador",
  client_viewer: "Visualizador",
};

/**
 * Rodapé da sidebar — representa a PESSOA autenticada (nunca a empresa,
 * que já está no cabeçalho). Bloco clicável único: nome + cargo + avatar
 * real (`profiles.photo_url`, com fallback de iniciais honesto). Ao
 * clicar, abre um popover FECHADO POR PADRÃO com nome/e-mail/papel +
 * "Configurações" + "Sair" — só essa ÚNICA entrada de Configurações
 * existe no app (antes havia "Minha conta" E "Segurança" duplicadas
 * aqui dentro, mais um botão "Configurações" solto embaixo, todos
 * levando pro mesmo lugar).
 */
export function ClientSidebarProfile({
  name,
  secondary,
  email,
  collapsed,
}: {
  name: string;
  secondary: string;
  email: string;
  collapsed: boolean;
}) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const { data: profile } = useClientProfile();

  const initials = initialsFromName(name);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={collapsed ? name : undefined}
          className={`flex w-full items-center gap-2.5 rounded-md p-1.5 text-left transition-colors hover:bg-muted/60 ${
            collapsed ? "justify-center" : ""
          }`}
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-muted text-[11px] font-semibold text-muted-foreground">
            {profile?.photoUrl ? (
              <img
                src={profile.photoUrl}
                alt=""
                className="h-full w-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              initials
            )}
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-foreground">{name || "Sem nome"}</p>
              <p className="truncate text-xs text-muted-foreground">{secondary}</p>
            </div>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent side={collapsed ? "right" : "top"} align="start" className="w-56 p-1.5">
        <div className="px-2 py-1.5">
          <p className="truncate text-sm font-medium text-foreground">{name || "Sem nome"}</p>
          <p className="truncate text-xs text-muted-foreground">{email}</p>
          {secondary && <p className="mt-0.5 text-xs text-muted-foreground">{secondary}</p>}
        </div>
        <div className="my-1 border-t border-border" />
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            navigate({ to: "/portal-v2/configuracoes" });
          }}
          className="flex w-full items-center gap-2 rounded-sm px-2.5 py-2 text-left text-sm text-foreground hover:bg-muted"
        >
          <Settings className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          Configurações
        </button>
        <button
          type="button"
          onClick={handleSignOut}
          className="flex w-full items-center gap-2 rounded-sm px-2.5 py-2 text-left text-sm text-foreground hover:bg-muted"
        >
          <LogOut className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          Sair
        </button>
      </PopoverContent>
    </Popover>
  );
}
