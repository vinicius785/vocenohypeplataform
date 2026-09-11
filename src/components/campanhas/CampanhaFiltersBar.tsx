import { Search, Filter, ArrowUpDown, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  type CampanhaFiltersState,
  CAMPANHA_SORT_LABEL,
  CAMPANHA_STATUS_LABEL,
  DEFAULT_CAMPANHA_FILTERS,
  countActiveCampanhaFilters,
  type CampanhaStatus,
} from "./campanha-ui";

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
 * Busca + filtros + ordenação unificados da listagem de Campanhas — mesma
 * estrutura já aprovada em `clientes/ClienteFiltersBar.tsx`, operando
 * sobre o mesmo dataset já sincronizado (clientes + influenciadores por
 * campanha, ambos já carregados em memória), sem chamada remota nova.
 */
export function CampanhaFiltersBar({
  query,
  onQueryChange,
  filters,
  onFiltersChange,
  clientes,
}: {
  query: string;
  onQueryChange: (v: string) => void;
  filters: CampanhaFiltersState;
  onFiltersChange: (f: CampanhaFiltersState) => void;
  clientes: { id: string; empresa: string }[];
}) {
  const activeCount = countActiveCampanhaFilters(filters);

  return (
    <div className="rounded-2xl bg-card p-3 dark:shadow-none">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary" />
          <input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Buscar por campanha, cliente ou influenciador..."
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
              <p className="text-[11px] font-semibold text-foreground">Filtrar campanhas</p>
              <button
                type="button"
                disabled={activeCount === 0}
                onClick={() => onFiltersChange(DEFAULT_CAMPANHA_FILTERS)}
                className="text-[11px] text-text-secondary hover:text-foreground disabled:opacity-40"
              >
                Limpar
              </button>
            </div>

            <div>
              <p className="mb-1.5 text-[11px] font-medium text-text-secondary">Status</p>
              <div className="flex flex-wrap gap-1">
                {(["todos", "ativa", "encerrada", "sem_prazo"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => onFiltersChange({ ...filters, status: v })}
                    className={pillCls(filters.status === v)}
                  >
                    {v === "todos" ? "Todos" : CAMPANHA_STATUS_LABEL[v as CampanhaStatus]}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-1.5 text-[11px] font-medium text-text-secondary">Recorrência</p>
              <div className="flex flex-wrap gap-1">
                {(["todos", "sim", "nao"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => onFiltersChange({ ...filters, recorrente: v })}
                    className={pillCls(filters.recorrente === v)}
                  >
                    {v === "todos" ? "Todas" : v === "sim" ? "Recorrentes" : "Não recorrentes"}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-1.5 text-[11px] font-medium text-text-secondary">Influenciadores</p>
              <div className="flex flex-wrap gap-1">
                {(["todos", "com", "sem"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => onFiltersChange({ ...filters, influenciadores: v })}
                    className={pillCls(filters.influenciadores === v)}
                  >
                    {v === "todos"
                      ? "Todas"
                      : v === "com"
                        ? "Com influenciadores"
                        : "Sem influenciadores"}
                  </button>
                ))}
              </div>
            </div>

            {clientes.length > 0 && (
              <div>
                <p className="mb-1.5 text-[11px] font-medium text-text-secondary">Cliente</p>
                <div className="flex max-h-40 flex-wrap gap-1 overflow-y-auto">
                  {clientes.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() =>
                        onFiltersChange({
                          ...filters,
                          clienteIds: toggleIn(filters.clienteIds, c.id),
                        })
                      }
                      className={pillCls(filters.clienteIds.includes(c.id))}
                    >
                      {c.empresa}
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
              {CAMPANHA_SORT_LABEL[filters.sort]}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-56 space-y-1 p-2">
            {(Object.keys(CAMPANHA_SORT_LABEL) as (keyof typeof CAMPANHA_SORT_LABEL)[]).map((k) => (
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
                {CAMPANHA_SORT_LABEL[k]}
              </button>
            ))}
          </PopoverContent>
        </Popover>
      </div>

      <CampanhaFilterChips filters={filters} onChange={onFiltersChange} clientes={clientes} />
    </div>
  );
}

function CampanhaFilterChips({
  filters,
  onChange,
  clientes,
}: {
  filters: CampanhaFiltersState;
  onChange: (f: CampanhaFiltersState) => void;
  clientes: { id: string; empresa: string }[];
}) {
  const chips: { id: string; label: string; onRemove: () => void }[] = [
    ...(filters.status !== "todos"
      ? [
          {
            id: "status",
            label: CAMPANHA_STATUS_LABEL[filters.status as CampanhaStatus],
            onRemove: () => onChange({ ...filters, status: "todos" as const }),
          },
        ]
      : []),
    ...(filters.recorrente !== "todos"
      ? [
          {
            id: "recorrente",
            label: filters.recorrente === "sim" ? "Recorrentes" : "Não recorrentes",
            onRemove: () => onChange({ ...filters, recorrente: "todos" as const }),
          },
        ]
      : []),
    ...(filters.influenciadores !== "todos"
      ? [
          {
            id: "influenciadores",
            label:
              filters.influenciadores === "com" ? "Com influenciadores" : "Sem influenciadores",
            onRemove: () => onChange({ ...filters, influenciadores: "todos" as const }),
          },
        ]
      : []),
    ...filters.clienteIds.map((id) => ({
      id: `cliente-${id}`,
      label: clientes.find((c) => c.id === id)?.empresa ?? "Cliente",
      onRemove: () =>
        onChange({ ...filters, clienteIds: filters.clienteIds.filter((x) => x !== id) }),
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
        onClick={() => onChange(DEFAULT_CAMPANHA_FILTERS)}
        className="text-[11px] font-medium text-text-secondary hover:text-foreground"
      >
        Limpar filtros
      </button>
    </div>
  );
}
