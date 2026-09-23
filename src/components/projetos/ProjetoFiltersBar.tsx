import { Search, Filter, ArrowUpDown, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FEATURES } from "@/lib/projetos";
import {
  type ProjectFiltersState,
  type ProjectStatusFilter,
  PROJECT_SORT_LABEL,
  PROJECT_STATUS_FILTER_LABEL,
  DEFAULT_PROJECT_FILTERS,
  countActiveProjectFilters,
} from "./projeto-ui";

const pillCls = (active: boolean) =>
  `rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
    active
      ? "border-foreground bg-foreground text-background"
      : "border-border text-muted-foreground hover:bg-muted"
  }`;

const STATUS_OPTIONS: ProjectStatusFilter[] = [
  "todos",
  "ativo",
  "em_risco",
  "pausado",
  "concluido",
  "arquivado",
];

/**
 * Busca + filtros + ordenação da listagem de Projetos, unificados numa
 * barra compacta — mesma estrutura já aprovada em `ClienteFiltersBar`/
 * `CampanhaFiltersBar` (Popover de filtros com badge de contagem, Popover
 * de ordenação, chips removíveis abaixo só quando há filtro ativo).
 */
export function ProjetoFiltersBar({
  query,
  onQueryChange,
  filters,
  onFiltersChange,
  responsaveis,
}: {
  query: string;
  onQueryChange: (v: string) => void;
  filters: ProjectFiltersState;
  onFiltersChange: (f: ProjectFiltersState) => void;
  responsaveis: string[];
}) {
  const activeCount = countActiveProjectFilters(filters);

  return (
    <div className="rounded-2xl bg-card p-3 dark:shadow-none">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Buscar por nome ou descrição"
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
              <p className="text-[11px] font-semibold text-foreground">Filtrar projetos</p>
              <button
                type="button"
                disabled={activeCount === 0}
                onClick={() => onFiltersChange(DEFAULT_PROJECT_FILTERS)}
                className="text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-40"
              >
                Limpar
              </button>
            </div>

            <div>
              <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">Status</p>
              <div className="flex flex-wrap gap-1">
                {STATUS_OPTIONS.map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => onFiltersChange({ ...filters, status: v })}
                    className={pillCls(filters.status === v)}
                  >
                    {PROJECT_STATUS_FILTER_LABEL[v]}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">Funcionalidade</p>
              <div className="flex max-h-32 flex-wrap gap-1 overflow-y-auto">
                <button
                  type="button"
                  onClick={() => onFiltersChange({ ...filters, feature: "todas" })}
                  className={pillCls(filters.feature === "todas")}
                >
                  Todas
                </button>
                {FEATURES.map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => onFiltersChange({ ...filters, feature: f.key })}
                    className={pillCls(filters.feature === f.key)}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {responsaveis.length > 0 && (
              <div>
                <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">Responsável</p>
                <div className="flex max-h-32 flex-wrap gap-1 overflow-y-auto">
                  <button
                    type="button"
                    onClick={() => onFiltersChange({ ...filters, responsavel: "todos" })}
                    className={pillCls(filters.responsavel === "todos")}
                  >
                    Todos
                  </button>
                  {responsaveis.map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => onFiltersChange({ ...filters, responsavel: r })}
                      className={pillCls(filters.responsavel === r)}
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
              {PROJECT_SORT_LABEL[filters.sort]}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-56 space-y-1 p-2">
            {(Object.keys(PROJECT_SORT_LABEL) as (keyof typeof PROJECT_SORT_LABEL)[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => onFiltersChange({ ...filters, sort: k })}
                className={`block w-full rounded-md px-2 py-1.5 text-left text-xs ${
                  filters.sort === k
                    ? "bg-muted font-medium text-foreground"
                    : "text-muted-foreground hover:bg-muted/60"
                }`}
              >
                {PROJECT_SORT_LABEL[k]}
              </button>
            ))}
          </PopoverContent>
        </Popover>
      </div>

      <ProjetoFilterChips filters={filters} onChange={onFiltersChange} />
    </div>
  );
}

function ProjetoFilterChips({
  filters,
  onChange,
}: {
  filters: ProjectFiltersState;
  onChange: (f: ProjectFiltersState) => void;
}) {
  const chips: { id: string; label: string; onRemove: () => void }[] = [
    ...(filters.status !== "todos"
      ? [
          {
            id: "status",
            label: PROJECT_STATUS_FILTER_LABEL[filters.status],
            onRemove: () => onChange({ ...filters, status: "todos" as const }),
          },
        ]
      : []),
    ...(filters.feature !== "todas"
      ? [
          {
            id: "feature",
            label: FEATURES.find((f) => f.key === filters.feature)?.label ?? filters.feature,
            onRemove: () => onChange({ ...filters, feature: "todas" as const }),
          },
        ]
      : []),
    ...(filters.responsavel !== "todos"
      ? [
          {
            id: "responsavel",
            label: `Responsável: ${filters.responsavel}`,
            onRemove: () => onChange({ ...filters, responsavel: "todos" as const }),
          },
        ]
      : []),
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
        onClick={() => onChange(DEFAULT_PROJECT_FILTERS)}
        className="text-[11px] font-medium text-muted-foreground hover:text-foreground"
      >
        Limpar filtros
      </button>
    </div>
  );
}
