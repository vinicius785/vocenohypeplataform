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
import {
  type CampanhaFiltersState,
  CAMPANHA_SORT_LABEL,
  CAMPANHA_STATUS_LABEL,
  DEFAULT_CAMPANHA_FILTERS,
  countActiveCampanhaFilters,
  type CampanhaStatus,
} from "./campanha-ui";

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
    <FilterToolbar>
      <FilterRow>
        <FilterSearch
          value={query}
          onChange={onQueryChange}
          placeholder="Buscar por campanha, cliente ou influenciador..."
        />

        <FilterPopover
          title="Filtrar campanhas"
          activeCount={activeCount}
          onClear={() => onFiltersChange(DEFAULT_CAMPANHA_FILTERS)}
        >
          <FilterGroup label="Status">
            {(["todos", "planning", "active", "completed", "archived"] as const).map((v) => (
              <FilterPill
                key={v}
                active={filters.status === v}
                onClick={() => onFiltersChange({ ...filters, status: v })}
              >
                {v === "todos" ? "Todos" : CAMPANHA_STATUS_LABEL[v as CampanhaStatus]}
              </FilterPill>
            ))}
          </FilterGroup>

          <FilterGroup label="Recorrência">
            {(["todos", "sim", "nao"] as const).map((v) => (
              <FilterPill
                key={v}
                active={filters.recorrente === v}
                onClick={() => onFiltersChange({ ...filters, recorrente: v })}
              >
                {v === "todos" ? "Todas" : v === "sim" ? "Recorrentes" : "Não recorrentes"}
              </FilterPill>
            ))}
          </FilterGroup>

          <FilterGroup label="Influenciadores">
            {(["todos", "com", "sem"] as const).map((v) => (
              <FilterPill
                key={v}
                active={filters.influenciadores === v}
                onClick={() => onFiltersChange({ ...filters, influenciadores: v })}
              >
                {v === "todos"
                  ? "Todas"
                  : v === "com"
                    ? "Com influenciadores"
                    : "Sem influenciadores"}
              </FilterPill>
            ))}
          </FilterGroup>

          {clientes.length > 0 && (
            <FilterGroup label="Cliente">
              {clientes.map((c) => (
                <FilterPill
                  key={c.id}
                  active={filters.clienteIds.includes(c.id)}
                  onClick={() =>
                    onFiltersChange({
                      ...filters,
                      clienteIds: toggleIn(filters.clienteIds, c.id),
                    })
                  }
                >
                  {c.empresa}
                </FilterPill>
              ))}
            </FilterGroup>
          )}
        </FilterPopover>

        <SortMenu
          value={filters.sort}
          options={CAMPANHA_SORT_LABEL}
          onChange={(k) => onFiltersChange({ ...filters, sort: k })}
        />
      </FilterRow>

      <CampanhaFilterChips filters={filters} onChange={onFiltersChange} clientes={clientes} />
    </FilterToolbar>
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

  return <FilterChips chips={chips} onClear={() => onChange(DEFAULT_CAMPANHA_FILTERS)} />;
}
