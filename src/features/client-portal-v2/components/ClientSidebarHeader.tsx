import { ChevronDown } from "lucide-react";

/**
 * Identidade no topo da sidebar — o CLIENTE ativo (logo/iniciais + nome +
 * "Portal do cliente"), nunca a marca Você no Hype. Único bloco (não há
 * um segundo bloco repetindo o cliente embaixo, como a versão anterior
 * tinha). `logoUrl`/`name` vêm de `ClienteLinkData` (`clienteFoto`/
 * `clienteNome`, já carregados pela sessão) — nunca hardcoded.
 */
export function ClientSidebarHeader({
  name,
  logoUrl,
  collapsed,
  showSwitch,
  onSwitchClick,
}: {
  name: string;
  logoUrl?: string;
  collapsed: boolean;
  showSwitch: boolean;
  onSwitchClick?: () => void;
}) {
  const initials =
    name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase())
      .join("") || "?";

  const content = (
    <div className={`flex items-center gap-3 ${collapsed ? "justify-center" : ""}`}>
      <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-foreground text-sm font-bold text-background">
        {logoUrl ? <img src={logoUrl} alt="" className="h-full w-full object-cover" /> : initials}
      </div>
      {!collapsed && (
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">{name || "Cliente"}</p>
          <p className="truncate text-xs text-muted-foreground">Portal do cliente</p>
        </div>
      )}
      {!collapsed && showSwitch && (
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      )}
    </div>
  );

  if (!showSwitch) {
    return (
      <div className={`px-5 py-5 ${collapsed ? "px-0" : ""}`} title={collapsed ? name : undefined}>
        {content}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onSwitchClick}
      title={collapsed ? name : "Trocar de empresa"}
      className={`w-full rounded-md px-5 py-5 text-left transition-colors hover:bg-muted/60 ${
        collapsed ? "px-0" : ""
      }`}
    >
      {content}
    </button>
  );
}
