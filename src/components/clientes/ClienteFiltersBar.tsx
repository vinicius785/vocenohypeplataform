import { Search, Filter, ArrowUpDown, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  type ClienteFiltersState,
  CLIENTE_SORT_LABEL,
  DEFAULT_CLIENTE_FILTERS,
  countActiveClienteFilters,
} from "./cliente-ui";

const pillCls = (active: boolean) =>
  `rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
    active
      ? "border-foreground bg-foreground text-background"
      : "border-border text-text-secondary hover:bg-muted"
  }`;

function toggleIn<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

/**
 * Busca + filtros + ordenação unificados, todos operando sobre o mesmo
 * dataset já sincronizado (`useClientes()`), sem chamada remota nova —
 * mesma estrutura já aprovada em `LeadFiltersBar.tsx` (Comercial).
 */
export function ClienteFiltersBar({
  query,
  onQueryChange,
  filters,
  onFiltersChange,
  responsaveis,
}: {
  query: string;
  onQueryChange: (v: string) => void;
  filters: ClienteFiltersState;
  onFiltersChange: (f: ClienteFiltersState) => void;
  responsaveis: string[];
}) {
  const activeCount = countActiveClienteFilters(filters);

  return (
    <div className="rounded-2xl bg-card p-3 dark:shadow-none">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary" />
          <input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Buscar por empresa, contato, responsável ou campanha..."
            className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand"
          />
        </div>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5">
              <Filter className="h-3.5 w-3.5" />
              Filtros
              {activeCount > 0 && (
                <Badge variant="brand" className="px-1.5 py-0 text-[10px] leading-4">
                  {activeCount}
                </Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-72 space-y-3 p-3">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold text-foreground">Filtrar clientes</p>
              <button
                type="button"
                disabled={activeCount === 0}
                onClick={() => onFiltersChange(DEFAULT_CLIENTE_FILTERS)}
                className="text-[11px] text-text-secondary hover:text-foreground disabled:opacity-40"
              >
                Limpar
              </button>
            </div>

            <div>
              <p className="mb-1.5 text-[11px] font-medium text-text-secondary">Campanhas</p>
              <div className="flex flex-wrap gap-1">
                {(["todos", "com", "sem"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => onFiltersChange({ ...filters, campanha: v })}
                    className={pillCls(filters.campanha === v)}
                  >
                    {v === "todos" ? "Todos" : v === "com" ? "Com campanha" : "Sem campanha"}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-1.5 text-[11px] font-medium text-text-secondary">Contato</p>
              <div className="flex flex-wrap gap-1">
                {(["todos", "com", "sem"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => onFiltersChange({ ...filters, contato: v })}
                    className={pillCls(filters.contato === v)}
                  >
                    {v === "todos" ? "Todos" : v === "com" ? "Com contato" : "Sem contato"}
                  </button>
                ))}
              </div>
            </div>

            {responsaveis.length > 0 && (
              <div>
                <p className="mb-1.5 text-[11px] font-medium text-text-secondary">
                  Responsável interno
                </p>
                <div className="flex flex-wrap gap-1">
                  {responsaveis.map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() =>
                        onFiltersChange({
                          ...filters,
                          responsavelInterno: toggleIn(filters.responsavelInterno, r),
                        })
                      }
                      className={pillCls(filters.responsavelInterno.includes(r))}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </PopoverContent>
        </Popover>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5">
              <ArrowUpDown className="h-3.5 w-3.5" />
              {CLIENTE_SORT_LABEL[filters.sort]}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-56 space-y-1 p-2">
            {(Object.keys(CLIENTE_SORT_LABEL) as (keyof typeof CLIENTE_SORT_LABEL)[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => onFiltersChange({ ...filters, sort: k })}
                className={`block w-full rounded-md px-2 py-1.5 text-left text-xs ${
                  filters.sort === k
                    ? "bg-muted font-medium text-foreground"
                    : "text-text-secondary hover:bg-muted/60"
                }`}
              >
                {CLIENTE_SORT_LABEL[k]}
              </button>
            ))}
          </PopoverContent>
        </Popover>
      </div>

      <ClienteFilterChips filters={filters} onChange={onFiltersChange} />
    </div>
  );
}

function ClienteFilterChips({
  filters,
  onChange,
}: {
  filters: ClienteFiltersState;
  onChange: (f: ClienteFiltersState) => void;
}) {
  const chips: { id: string; label: string; onRemove: () => void }[] = [
    ...(filters.campanha !== "todos"
      ? [
          {
            id: "campanha",
            label: filters.campanha === "com" ? "Com campanha" : "Sem campanha",
            onRemove: () => onChange({ ...filters, campanha: "todos" as const }),
          },
        ]
      : []),
    ...(filters.contato !== "todos"
      ? [
          {
            id: "contato",
            label: filters.contato === "com" ? "Com contato" : "Sem contato",
            onRemove: () => onChange({ ...filters, contato: "todos" as const }),
          },
        ]
      : []),
    ...filters.responsavelInterno.map((r) => ({
      id: `resp-${r}`,
      label: `Responsável: ${r}`,
      onRemove: () =>
        onChange({
          ...filters,
          responsavelInterno: filters.responsavelInterno.filter((x) => x !== r),
        }),
    })),
  ];

  if (chips.length === 0) return null;

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      {chips.map((chip) => (
        <Badge key={chip.id} variant="brand" className="gap-1 py-1 pl-2.5 pr-1.5">
          {chip.label}
          <button
            type="button"
            onClick={chip.onRemove}
            aria-label={`Remover filtro ${chip.label}`}
            className="flex h-4 w-4 items-center justify-center rounded-full hover:bg-brand/20"
          >
            <X className="h-3 w-3" />
          </button>
        </Badge>
      ))}
      <button
        type="button"
        onClick={() => onChange(DEFAULT_CLIENTE_FILTERS)}
        className="text-[11px] font-medium text-text-secondary hover:text-foreground"
      >
        Limpar filtros
      </button>
    </div>
  );
}
