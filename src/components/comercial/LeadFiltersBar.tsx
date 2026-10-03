import {
  FilterChips,
  FilterGroup,
  FilterPill,
  FilterPopover,
  SortMenu,
} from "@/components/shared/FilterToolbar";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import {
  OPPORTUNITY_STAGES,
  OPPORTUNITY_STAGE_LABEL,
  type OpportunityStage,
} from "@/lib/comercial-engine";
import {
  LEAD_QUICK_SORTS,
  EMPTY_LEAD_FILTERS,
  countActiveLeadFilters,
  type LeadSortField,
  type LeadSortDirection,
  type LeadFilters,
  type LeadActivityFilterKey,
} from "@/lib/comercial-filters";
import { formatBRL } from "@/lib/comercial";
import type { TeamMemberLite } from "@/lib/projetos";

/**
 * Filtros + ordenação do Pipe Comercial no padrão da plataforma: o botão
 * "Filtros" abre um popover com as dimensões (aplicação imediata, sem botão
 * "Aplicar"), "Ordenar" é um menu à parte e os filtros ativos aparecem como
 * chips removíveis. Toda a allowlist/query real continua em
 * `comercial-filters.ts`/`comercial.functions.ts`, intocada.
 */

const SOURCES = ["Indicação", "Instagram", "Google", "LinkedIn", "Site", "Evento", "Outro"];

/** Situação — single-select, mapeada para 0 ou 1 elemento do array `activity`. */
const SITUACAO_OPTIONS: { key: LeadActivityFilterKey; label: string }[] = [
  { key: "com_proxima_acao", label: "Com próxima ação" },
  { key: "sem_proxima_acao", label: "Sem próxima ação" },
  { key: "acao_vencida", label: "Ação vencida" },
  { key: "sem_contato_7d", label: "Sem contato há mais de 7 dias" },
];

function toggleIn<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

const SORT_OPTIONS = Object.fromEntries(LEAD_QUICK_SORTS.map((o) => [o.key, o.label])) as Record<
  string,
  string
>;

/** "Ordenar" — só as opções prontas. Se a combinação atual (ex.: vinda de uma
 * URL antiga) não bater com nenhuma, cai visualmente na 1ª sem alterar nada. */
export function SortSelect({
  sort,
  direction,
  onChange,
}: {
  sort: LeadSortField;
  direction: LeadSortDirection;
  onChange: (sort: LeadSortField, direction: LeadSortDirection) => void;
}) {
  const current =
    LEAD_QUICK_SORTS.find((o) => o.sort === sort && o.direction === direction) ??
    LEAD_QUICK_SORTS[0];
  return (
    <SortMenu
      value={current.key}
      options={SORT_OPTIONS}
      onChange={(key) => {
        const o = LEAD_QUICK_SORTS.find((x) => x.key === key);
        if (o) onChange(o.sort, o.direction);
      }}
    />
  );
}

/** Painel de filtros — dimensões essenciais, aplicação imediata. */
export function FilterPanel({
  filters,
  onChange,
  team,
}: {
  filters: LeadFilters;
  onChange: (f: LeadFilters) => void;
  team: TeamMemberLite[];
}) {
  const situacaoAtual = filters.activity[0] ?? null;

  const responsavelAtual = filters.noResponsible
    ? "sem_responsavel"
    : (filters.responsibles[0] ?? "todos");
  const setResponsavel = (v: string) => {
    if (v === "todos") onChange({ ...filters, responsibles: [], noResponsible: false });
    else if (v === "sem_responsavel")
      onChange({ ...filters, responsibles: [], noResponsible: true });
    else onChange({ ...filters, responsibles: [v], noResponsible: false });
  };

  const numOrUndef = (v: string) => (v.trim() ? Number(v) : undefined);

  return (
    <FilterPopover
      title="Filtrar oportunidades"
      activeCount={countActiveLeadFilters(filters)}
      onClear={() => onChange(EMPTY_LEAD_FILTERS)}
    >
      <div>
        <p className="mb-1.5 text-[11px] font-medium text-text-secondary">Responsável</p>
        <NativeSelect
          aria-label="Filtrar por responsável"
          value={responsavelAtual}
          onChange={(e) => setResponsavel(e.target.value)}
        >
          <option value="todos">Todos</option>
          {team.map((m) => (
            <option key={m.id} value={m.name}>
              {m.name}
            </option>
          ))}
          <option value="sem_responsavel">Sem responsável</option>
        </NativeSelect>
      </div>

      <FilterGroup label="Etapa">
        {OPPORTUNITY_STAGES.map((s: OpportunityStage) => (
          <FilterPill
            key={s}
            active={filters.stages.includes(s)}
            onClick={() => onChange({ ...filters, stages: toggleIn(filters.stages, s) })}
          >
            {OPPORTUNITY_STAGE_LABEL[s]}
          </FilterPill>
        ))}
      </FilterGroup>

      <FilterGroup label="Situação">
        {SITUACAO_OPTIONS.map((o) => (
          <FilterPill
            key={o.key}
            active={situacaoAtual === o.key}
            onClick={() =>
              onChange({ ...filters, activity: situacaoAtual === o.key ? [] : [o.key] })
            }
          >
            {o.label}
          </FilterPill>
        ))}
      </FilterGroup>

      <FilterGroup label="Origem">
        {SOURCES.map((o) => (
          <FilterPill
            key={o}
            active={filters.origins.includes(o)}
            onClick={() => onChange({ ...filters, origins: toggleIn(filters.origins, o) })}
          >
            {o}
          </FilterPill>
        ))}
      </FilterGroup>

      <div>
        <p className="mb-1.5 text-[11px] font-medium text-text-secondary">Valor (R$)</p>
        <div className="flex items-center gap-2">
          <Input
            inputMode="decimal"
            aria-label="Valor mínimo"
            value={filters.minValue ?? ""}
            onChange={(e) => onChange({ ...filters, minValue: numOrUndef(e.target.value) })}
            placeholder="Mín."
          />
          <span className="text-text-secondary">–</span>
          <Input
            inputMode="decimal"
            aria-label="Valor máximo"
            value={filters.maxValue ?? ""}
            onChange={(e) => onChange({ ...filters, maxValue: numOrUndef(e.target.value) })}
            placeholder="Máx."
          />
        </div>
      </div>
    </FilterPopover>
  );
}

/** Filtros ativos como chips removíveis + contagem de resultados. Os chips
 * são neutros; o contador some junto com eles só quando não há `resultCount`. */
export function LeadFiltersSummary({
  filters,
  onChange,
  resultCount,
}: {
  filters: LeadFilters;
  onChange: (f: LeadFilters) => void;
  resultCount?: number;
}) {
  const chips: { id: string; label: string; onRemove: () => void }[] = [
    ...filters.responsibles.map((r) => ({
      id: `resp-${r}`,
      label: `Responsável: ${r}`,
      onRemove: () =>
        onChange({ ...filters, responsibles: filters.responsibles.filter((x) => x !== r) }),
    })),
    ...(filters.noResponsible
      ? [
          {
            id: "sem-resp",
            label: "Sem responsável",
            onRemove: () => onChange({ ...filters, noResponsible: false }),
          },
        ]
      : []),
    ...filters.stages.map((s) => ({
      id: `stage-${s}`,
      label: `Etapa: ${OPPORTUNITY_STAGE_LABEL[s]}`,
      onRemove: () => onChange({ ...filters, stages: filters.stages.filter((x) => x !== s) }),
    })),
    ...filters.activity.map((a) => ({
      id: `act-${a}`,
      label: SITUACAO_OPTIONS.find((o) => o.key === a)?.label ?? a,
      onRemove: () => onChange({ ...filters, activity: filters.activity.filter((x) => x !== a) }),
    })),
    ...filters.origins.map((o) => ({
      id: `orig-${o}`,
      label: `Origem: ${o}`,
      onRemove: () => onChange({ ...filters, origins: filters.origins.filter((x) => x !== o) }),
    })),
    ...(filters.minValue !== undefined || filters.maxValue !== undefined
      ? [
          {
            id: "valor",
            label: `Valor: ${filters.minValue !== undefined ? formatBRL(filters.minValue) : "—"} a ${
              filters.maxValue !== undefined ? formatBRL(filters.maxValue) : "—"
            }`,
            onRemove: () => onChange({ ...filters, minValue: undefined, maxValue: undefined }),
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-2">
      <FilterChips chips={chips} onClear={() => onChange(EMPTY_LEAD_FILTERS)} />
      {resultCount !== undefined && (
        <p className="text-[11px] text-text-secondary">
          {resultCount} oportunidade{resultCount === 1 ? "" : "s"} encontrada
          {resultCount === 1 ? "" : "s"}
        </p>
      )}
    </div>
  );
}
