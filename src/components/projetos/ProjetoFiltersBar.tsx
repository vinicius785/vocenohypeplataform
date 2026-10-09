import {
  FilterChips,
  FilterGroup,
  FilterPill,
  FilterPopover,
  FilterRow,
  FilterSearch,
  FilterToolbar,
  SortMenu,
} from "@/components/shared/FilterToolbar";
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

        <FilterPopover
          title="Filtrar projetos"
          activeCount={activeCount}
          onClear={() => onFiltersChange(DEFAULT_PROJECT_FILTERS)}
        >
          <FilterGroup label="Status">
            {STATUS_OPTIONS.map((v) => (
              <FilterPill
                key={v}
                active={filters.status === v}
                onClick={() => onFiltersChange({ ...filters, status: v })}
              >
                {PROJECT_STATUS_FILTER_LABEL[v]}
              </FilterPill>
            ))}
          </FilterGroup>

          <FilterGroup label="Saúde">
            {HEALTH_OPTIONS.map((v) => (
              <FilterPill
                key={v}
                active={filters.health === v}
                onClick={() => onFiltersChange({ ...filters, health: v })}
              >
                {PROJECT_HEALTH_FILTER_LABEL[v]}
              </FilterPill>
            ))}
          </FilterGroup>

          <FilterGroup label="Funcionalidade">
            <FilterPill
              active={filters.feature === "todas"}
              onClick={() => onFiltersChange({ ...filters, feature: "todas" })}
            >
              Todas
            </FilterPill>
            {FEATURES.map((f) => (
              <FilterPill
                key={f.key}
                active={filters.feature === f.key}
                onClick={() => onFiltersChange({ ...filters, feature: f.key })}
              >
                {f.label}
              </FilterPill>
            ))}
          </FilterGroup>

          {responsaveis.length > 0 && (
            <FilterGroup label="Responsável">
              <FilterPill
                active={filters.responsavel === "todos"}
                onClick={() => onFiltersChange({ ...filters, responsavel: "todos" })}
              >
                Todos
              </FilterPill>
              {responsaveis.map((r) => (
                <FilterPill
                  key={r}
                  active={filters.responsavel === r}
                  onClick={() => onFiltersChange({ ...filters, responsavel: r })}
                >
                  {r}
                </FilterPill>
              ))}
            </FilterGroup>
          )}
        </FilterPopover>

        <SortMenu
          value={filters.sort}
          options={PROJECT_SORT_LABEL}
          onChange={(k) => onFiltersChange({ ...filters, sort: k })}
        />
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
