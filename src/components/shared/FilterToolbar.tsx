import type { ReactNode } from "react";
import { ArrowUpDown, Filter, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ResponsivePopover } from "@/components/ui/responsive-popover";

/**
 * Barra de busca + filtros — o padrão ÚNICO das listagens (Clientes,
 * Campanhas, Projetos, Influenciadores, Metas, Financeiro): CONTEXTO (fora
 * daqui) → BUSCA → FILTROS (um só botão "Filtros" com um popover) →
 * RESULTADOS, com os filtros ativos como chips removíveis logo abaixo.
 * Sem card em volta: é só uma linha sobre o fundo da página.
 */
export function FilterToolbar({ children }: { children: ReactNode }) {
  return <div className="space-y-2">{children}</div>;
}

/** Linha dos controles (busca, Filtros, ordenação) dentro do `FilterToolbar`. */
export function FilterRow({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2">{children}</div>;
}

export function FilterSearch({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative w-full min-w-0 sm:w-auto sm:min-w-[200px] sm:flex-1">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-9 pl-9 text-sm"
      />
    </div>
  );
}

export type FilterChip = {
  id: string;
  label: string;
  onRemove: () => void;
  /** Classe de cor (bg-*) de um marcador antes do rótulo — ex.: cor do status. O texto continua. */
  dotClass?: string;
};

/** Filtros ativos: cada um removível, mais "Limpar filtros". Neutros — cor
 * é reservada pra estado, não pra "tem filtro ligado". */
export function FilterChips({ chips, onClear }: { chips: FilterChip[]; onClear: () => void }) {
  if (chips.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {chips.map((chip) => (
        <span
          key={chip.id}
          className="inline-flex items-center gap-1 rounded-full bg-muted py-1 pl-2.5 pr-1.5 text-xs font-medium text-foreground"
        >
          {chip.dotClass && (
            <span
              aria-hidden="true"
              className={cn("h-1.5 w-1.5 shrink-0 rounded-full", chip.dotClass)}
            />
          )}
          {chip.label}
          <button
            type="button"
            onClick={chip.onRemove}
            aria-label={`Remover filtro ${chip.label}`}
            className="flex h-4 w-4 items-center justify-center rounded-full hover:bg-foreground/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <button
        type="button"
        onClick={onClear}
        className="rounded text-xs font-medium text-text-secondary underline underline-offset-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        Limpar filtros
      </button>
    </div>
  );
}

/** Botão "Filtros ▾ (contador)" + popover. Dentro dele ficam só as DIMENSÕES
 * de filtro (`FilterGroup`), com aplicação imediata — sem botão "Aplicar" e
 * sem o contexto global (período, mês), que fica fora do popover. */
export function FilterPopover({
  title,
  activeCount,
  onClear,
  children,
}: {
  title: string;
  activeCount: number;
  onClear: () => void;
  children: ReactNode;
}) {
  return (
    <ResponsivePopover
      title={title}
      contentClassName="max-h-[min(70vh,28rem)] w-72 space-y-3 overflow-y-auto p-3"
      trigger={
        <Button variant="outline" size="sm" className="gap-1.5">
          <Filter className="h-3.5 w-3.5" />
          Filtros
          {activeCount > 0 && (
            <Badge variant="secondary" size="sm" className="px-1.5 py-0 leading-4">
              {activeCount}
            </Badge>
          )}
        </Button>
      }
    >
      <>
        <div className="flex items-center justify-between">
          <p className="hidden text-sm font-semibold text-foreground md:block">{title}</p>
          <button
            type="button"
            disabled={activeCount === 0}
            onClick={onClear}
            className="text-xs text-text-secondary hover:text-foreground disabled:opacity-40"
          >
            Limpar
          </button>
        </div>
        {children}
      </>
    </ResponsivePopover>
  );
}

/** Uma dimensão do popover: rótulo + opções em pills. */
export function FilterGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={label}>
      <p className="mb-1.5 text-[11px] font-medium text-text-secondary">{label}</p>
      <div className="flex flex-wrap gap-1">{children}</div>
    </div>
  );
}

/** Opção de uma dimensão. Selecionada = neutro invertido (cor é reservada
 * para estado, não para "filtro ligado"). */
export function FilterPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "min-h-9 rounded-full border px-3 py-1 text-xs font-medium transition-colors md:min-h-0 md:px-2.5 md:text-[11px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active
          ? "border-foreground bg-foreground text-background"
          : "border-border text-text-secondary hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}

/** Botão "Ordenar" com o critério atual + lista de critérios. */
export function SortMenu<K extends string>({
  value,
  options,
  onChange,
}: {
  value: K;
  options: Record<K, string>;
  onChange: (k: K) => void;
}) {
  return (
    <ResponsivePopover
      title="Ordenar por"
      contentClassName="w-56 space-y-1 p-2"
      trigger={
        <Button variant="outline" size="sm" className="gap-1.5" aria-label="Ordenar">
          <ArrowUpDown className="h-3.5 w-3.5" />
          {options[value]}
        </Button>
      }
    >
      {(close) =>
        (Object.keys(options) as K[]).map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={value === k}
            onClick={() => {
              onChange(k);
              close();
            }}
            className={cn(
              "flex min-h-11 w-full items-center rounded-md px-2 text-left text-sm md:min-h-0 md:py-1.5 md:text-xs",
              value === k
                ? "bg-muted font-medium text-foreground"
                : "text-text-secondary hover:bg-muted/60",
            )}
          >
            {options[k]}
          </button>
        ))
      }
    </ResponsivePopover>
  );
}
