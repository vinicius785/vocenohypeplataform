import type { ReactNode } from "react";
import { Search, X } from "lucide-react";
import { NativeSelect } from "@/components/ui/native-select";
import { portalFieldBase } from "./portal-field-styles";

/** Toolbar de filtros compacta, compartilhada por Relatórios e Arquivos: uma linha no desktop
 * (busca larga + selects do tamanho do conteúdo), quebra natural no mobile. Sem caixas em volta. */
export function PortalFilterToolbar({
  children,
  onClear,
}: {
  children: ReactNode;
  /** Presente só quando há filtro ativo — mostra "Limpar filtros" discreto. */
  onClear?: () => void;
}) {
  return (
    <div role="search" className="flex flex-wrap items-center gap-2">
      {children}
      {onClear && (
        <button
          type="button"
          onClick={onClear}
          className="inline-flex h-9 cursor-pointer items-center gap-1 rounded-md px-2 text-xs font-medium text-text-secondary hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
          Limpar filtros
        </button>
      )}
    </div>
  );
}

export function PortalSearchField({
  value,
  onChange,
  placeholder,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  label: string;
}) {
  return (
    <div className="relative w-full min-w-[12rem] sm:max-w-sm sm:flex-1">
      <Search
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary"
        aria-hidden="true"
      />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
        className={`${portalFieldBase} w-full pl-9 pr-3`}
      />
    </div>
  );
}

export function PortalFilterSelect({
  value,
  onChange,
  label,
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  children: ReactNode;
}) {
  return (
    <NativeSelect
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
      className="min-w-[9rem] max-w-full flex-1 sm:w-auto sm:max-w-[13rem] sm:flex-none"
      selectClassName="border-input bg-background shadow-none focus-visible:ring-2 focus-visible:ring-brand"
    >
      {children}
    </NativeSelect>
  );
}
