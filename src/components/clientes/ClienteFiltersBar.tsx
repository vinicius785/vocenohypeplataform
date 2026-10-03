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
  type ClienteFiltersState,
  type ClienteStatusFilter,
  CLIENTE_SORT_LABEL,
  CLIENTE_STATUS_FILTER_LABEL,
  DEFAULT_CLIENTE_FILTERS,
  countActiveClienteFilters,
} from "./cliente-ui";

function toggleIn<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

/**
 * Busca + Filtros + Ordenar, e abaixo os chips dos filtros ativos — o padrão
 * único de listagem (Design System §8.5). Tudo opera sobre o dataset já
 * sincronizado (`useClientes()`), sem chamada remota nova.
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
    <FilterToolbar>
      <FilterRow>
        <FilterSearch
          value={query}
          onChange={onQueryChange}
          placeholder="Buscar por empresa, contato, responsável ou campanha..."
        />

        <FilterPopover
          title="Filtrar clientes"
          activeCount={activeCount}
          onClear={() => onFiltersChange({ ...DEFAULT_CLIENTE_FILTERS, sort: filters.sort })}
        >
          <FilterGroup label="Status">
            {(Object.keys(CLIENTE_STATUS_FILTER_LABEL) as ClienteStatusFilter[]).map((s) => (
              <FilterPill
                key={s}
                active={filters.status === s}
                onClick={() => onFiltersChange({ ...filters, status: s })}
              >
                {CLIENTE_STATUS_FILTER_LABEL[s]}
              </FilterPill>
            ))}
          </FilterGroup>

          <FilterGroup label="Campanhas">
            {(["todos", "com", "sem"] as const).map((v) => (
              <FilterPill
                key={v}
                active={filters.campanha === v}
                onClick={() => onFiltersChange({ ...filters, campanha: v })}
              >
                {v === "todos" ? "Todos" : v === "com" ? "Com campanha" : "Sem campanha"}
              </FilterPill>
            ))}
          </FilterGroup>

          <FilterGroup label="Contato">
            {(["todos", "com", "sem"] as const).map((v) => (
              <FilterPill
                key={v}
                active={filters.contato === v}
                onClick={() => onFiltersChange({ ...filters, contato: v })}
              >
                {v === "todos" ? "Todos" : v === "com" ? "Com contato" : "Sem contato"}
              </FilterPill>
            ))}
          </FilterGroup>

          {responsaveis.length > 0 && (
            <FilterGroup label="Responsável interno">
              {responsaveis.map((r) => (
                <FilterPill
                  key={r}
                  active={filters.responsavelInterno.includes(r)}
                  onClick={() =>
                    onFiltersChange({
                      ...filters,
                      responsavelInterno: toggleIn(filters.responsavelInterno, r),
                    })
                  }
                >
                  {r}
                </FilterPill>
              ))}
            </FilterGroup>
          )}
        </FilterPopover>

        <SortMenu
          value={filters.sort}
          options={CLIENTE_SORT_LABEL}
          onChange={(sort) => onFiltersChange({ ...filters, sort })}
        />
      </FilterRow>

      <ClienteFilterChips filters={filters} onChange={onFiltersChange} />
    </FilterToolbar>
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
    ...(filters.status !== "operacao"
      ? [
          {
            id: "status",
            label: `Status: ${CLIENTE_STATUS_FILTER_LABEL[filters.status]}`,
            onRemove: () => onChange({ ...filters, status: "operacao" as const }),
          },
        ]
      : []),
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

  return (
    <FilterChips
      chips={chips}
      onClear={() => onChange({ ...DEFAULT_CLIENTE_FILTERS, sort: filters.sort })}
    />
  );
}
