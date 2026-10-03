import { Filter, ArrowUpDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  FilterChips,
  FilterRow,
  FilterSearch,
  FilterToolbar,
} from "@/components/shared/FilterToolbar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FEATURES } from "@/lib/projetos";
import {
  type ProjectFiltersState,
  type ProjectStatusFilter,
  type ProjectHealthFilter,
  PROJECT_SORT_LABEL,
  PROJECT_STATUS_FILTER_LABEL,
  PROJECT_HEALTH_FILTER_LABEL,
  DEFAULT_PROJECT_FILTERS,
  countActiveProjectFilters,
} from "./projeto-ui";

const pillCls = (active: boolean) =>
  `rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
    active
      ? "border-foreground bg-foreground text-background"
      : "border-border text-text-secondary hover:bg-muted"
  }`;

const STATUS_OPTIONS: ProjectStatusFilter[] = [
  "todos",
  "ativo",
  "pausado",
  "concluido",
  "arquivado",
];
const HEALTH_OPTIONS: ProjectHealthFilter[] = ["todos", "saudavel", "atencao", "em_risco"];

/**
 * Busca + filtros + ordenação da listagem de Projetos — mesma estrutura
 * já aprovada em `CampanhaFiltersBar`/`ClienteFiltersBar` (Popover de
 * filtros com badge de contagem, Popover de ordenação, chips removíveis
 * abaixo só quando há filtro ativo).
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
    <FilterToolbar>
      <FilterRow>
        <FilterSearch
          value={query}
          onChange={onQueryChange}
          placeholder="Buscar por projeto, descrição ou responsável..."
        />

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5">
              <Filter className="h-3.5 w-3.5" />
              Filtros
              {activeCount > 0 && (
                <Badge variant="secondary" className="px-1.5 py-0 text-[11px] leading-4">
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
                className="text-[11px] text-text-secondary hover:text-foreground disabled:opacity-40"
              >
                Limpar
              </button>
            </div>

            <div>
              <p className="mb-1.5 text-[11px] font-medium text-text-secondary">Status</p>
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
              <p className="mb-1.5 text-[11px] font-medium text-text-secondary">Saúde</p>
              <div className="flex flex-wrap gap-1">
                {HEALTH_OPTIONS.map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => onFiltersChange({ ...filters, health: v })}
                    className={pillCls(filters.health === v)}
                  >
                    {PROJECT_HEALTH_FILTER_LABEL[v]}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-1.5 text-[11px] font-medium text-text-secondary">Funcionalidade</p>
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
                <p className="mb-1.5 text-[11px] font-medium text-text-secondary">Responsável</p>
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
                    : "text-text-secondary hover:bg-muted/60"
                }`}
              >
                {PROJECT_SORT_LABEL[k]}
              </button>
            ))}
          </PopoverContent>
        </Popover>
      </FilterRow>

      <ProjetoFilterChips filters={filters} onChange={onFiltersChange} />
    </FilterToolbar>
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
    ...(filters.health !== "todos"
      ? [
          {
            id: "health",
            label: PROJECT_HEALTH_FILTER_LABEL[filters.health],
            onRemove: () => onChange({ ...filters, health: "todos" as const }),
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

  return <FilterChips chips={chips} onClear={() => onChange(DEFAULT_PROJECT_FILTERS)} />;
}
