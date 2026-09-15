import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import type { ConfigTab } from "@/lib/section-nav";
import type { LucideIcon } from "lucide-react";

export type ConfigNavItem = {
  key: ConfigTab;
  label: string;
  icon: LucideIcon;
  /** Palavras-chave extras pra busca (ex.: sinônimos), além do próprio label. */
  keywords?: string[];
};

export type ConfigNavGroup = {
  label: string;
  items: ConfigNavItem[];
};

/**
 * Nova navegação interna de Configurações — grupos com títulos discretos,
 * item ativo `brand-subtle`/`brand` + indicador vertical (nunca mais a
 * cápsula sólida `pill-nav-item-active` da sidebar principal), busca local
 * que só filtra os próprios itens (sem virar uma busca global nova).
 */
export function SettingsNav({
  groups,
  activeKey,
  onSelect,
  className,
}: {
  groups: ConfigNavGroup[];
  activeKey: ConfigTab;
  onSelect: (key: ConfigTab) => void;
  className?: string;
}) {
  const [query, setQuery] = useState("");

  const filteredGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    return groups
      .map((group) => ({
        ...group,
        items: group.items.filter(
          (item) =>
            item.label.toLowerCase().includes(q) ||
            item.keywords?.some((k) => k.toLowerCase().includes(q)),
        ),
      }))
      .filter((group) => group.items.length > 0);
  }, [groups, query]);

  return (
    <nav className={cn("space-y-5", className)} aria-label="Navegação de configurações">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar configuração"
          aria-label="Buscar configuração"
          className="h-9 pl-8 text-sm"
        />
      </div>

      {filteredGroups.length === 0 && (
        <p className="px-1 text-xs text-muted-foreground">Nenhuma configuração encontrada.</p>
      )}

      {filteredGroups.map((group) => (
        <div key={group.label}>
          <p className="mb-1.5 px-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {group.label}
          </p>
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const isActive = item.key === activeKey;
              const Icon = item.icon;
              return (
                <li key={item.key}>
                  <button
                    type="button"
                    onClick={() => onSelect(item.key)}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "relative flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1 focus-visible:ring-offset-background",
                      isActive
                        ? "bg-brand-subtle font-medium text-brand"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    {isActive && (
                      <span
                        aria-hidden="true"
                        className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-brand"
                      />
                    )}
                    <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span className="truncate">{item.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
