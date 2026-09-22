import { useState } from "react";
import { ArrowDownUp, Check, Filter, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  OPPORTUNITY_STAGES,
  OPPORTUNITY_STAGE_LABEL,
  type OpportunityStage,
} from "@/lib/comercial-engine";
import {
  LEAD_SORT_FIELDS,
  LEAD_SORT_FIELD_LABEL,
  LEAD_SORT_DIRECTION_LABEL,
  LEAD_SORT_FIELD_GROUP,
  LEAD_QUICK_SORTS,
  LEAD_ACTIVITY_FILTER_LABEL,
  EMPTY_LEAD_FILTERS,
  countActiveLeadFilters,
  type LeadSortField,
  type LeadSortDirection,
  type LeadFilters,
  type LeadActivityFilterKey,
  type LeadStatusFilter,
} from "@/lib/comercial-filters";
import type { TeamMemberLite } from "@/lib/projetos";

/**
 * Filtros + ordenação do Pipe Comercial — reescrito pra virar 2 controles
 * genuinamente separados (nunca mais "Maior/mais antigo primeiro"
 * genérico misturando campo e direção). Filtro/ordenação real acontece no
 * SERVIDOR (`listLeads`, `comercial.functions.ts`) — este arquivo só
 * monta a UI e o objeto `LeadFilters`/`sort`/`direction`, persistidos na
 * URL por `ComercialSection.tsx` (nunca em localStorage).
 */

const SOURCES = ["Indicação", "Instagram", "Google", "LinkedIn", "Site", "Evento", "Outro"];

const STATUS_LABEL: Record<LeadStatusFilter, string> = {
  aberto: "Aberto",
  ganho: "Ganho",
  perdido: "Perdido",
};

function toggleIn<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

const pillCls = (active: boolean) =>
  `rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
    active
      ? "border-foreground bg-foreground text-background"
      : "border-border text-muted-foreground hover:bg-muted"
  }`;

/** Rótulo do botão principal de ordenação — sempre "Campo · direção
 * contextual", nunca texto genérico. */
export function sortSummaryLabel(sort: LeadSortField, direction: LeadSortDirection): string {
  return `${LEAD_SORT_FIELD_LABEL[sort]} · ${LEAD_SORT_DIRECTION_LABEL[sort][direction]}`;
}

/** Controle 1: "Ordenar por" + "Direção" — dois passos no mesmo popover,
 * mas duas escolhas independentes (nunca uma única lista campo+direção
 * combinados). Atalhos comerciais no topo só preenchem os dois campos
 * reais, nunca uma segunda lógica de ordenação. */
export function SortControl({
  sort,
  direction,
  onChange,
}: {
  sort: LeadSortField;
  direction: LeadSortDirection;
  onChange: (sort: LeadSortField, direction: LeadSortDirection) => void;
}) {
  const [open, setOpen] = useState(false);
  const groups: Record<string, LeadSortField[]> = {};
  for (const f of LEAD_SORT_FIELDS) {
    const g = LEAD_SORT_FIELD_GROUP[f];
    groups[g] = [...(groups[g] ?? []), f];
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <ArrowDownUp className="h-3.5 w-3.5" />
          {sortSummaryLabel(sort, direction)}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="max-h-[75vh] w-72 overflow-y-auto p-0">
        <div className="border-b border-border p-2">
          <p className="px-1 pb-1 text-[11px] font-semibold text-foreground">Atalhos</p>
          <div className="flex flex-col">
            {LEAD_QUICK_SORTS.map((qs) => {
              const active = sort === qs.sort && direction === qs.direction;
              return (
                <button
                  key={qs.key}
                  type="button"
                  onClick={() => {
                    onChange(qs.sort, qs.direction);
                    setOpen(false);
                  }}
                  className={`flex items-center justify-between rounded-md px-2 py-1.5 text-left text-xs ${
                    active
                      ? "bg-muted font-medium text-foreground"
                      : "text-muted-foreground hover:bg-muted/60"
                  }`}
                >
                  {qs.label}
                  {active && <Check className="h-3.5 w-3.5" />}
                </button>
              );
            })}
          </div>
        </div>

        <div className="p-2">
          <p className="px-1 pb-1 text-[11px] font-semibold text-foreground">Ordenar por</p>
          {Object.entries(groups).map(([group, fields]) => (
            <div key={group} className="mb-2">
              <p className="px-1 pb-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {group}
              </p>
              {fields.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() =>
                    onChange(
                      f,
                      sort === f
                        ? direction
                        : (Object.keys(LEAD_SORT_DIRECTION_LABEL[f])[0] as LeadSortDirection),
                    )
                  }
                  className={`block w-full rounded-md px-2 py-1.5 text-left text-xs ${
                    sort === f
                      ? "bg-muted font-medium text-foreground"
                      : "text-muted-foreground hover:bg-muted/60"
                  }`}
                >
                  {LEAD_SORT_FIELD_LABEL[f]}
                </button>
              ))}
            </div>
          ))}
        </div>

        <div className="border-t border-border p-2">
          <p className="px-1 pb-1 text-[11px] font-semibold text-foreground">Direção</p>
          <div className="flex gap-1 px-1">
            {(["asc", "desc"] as LeadSortDirection[]).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => onChange(sort, d)}
                className={pillCls(direction === d)}
              >
                {LEAD_SORT_DIRECTION_LABEL[sort][d]}
              </button>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

const ACTIVITY_GROUPS: { title: string; keys: LeadActivityFilterKey[] }[] = [
  { title: "Próxima ação", keys: ["com_proxima_acao", "sem_proxima_acao", "acao_vencida"] },
  { title: "Parado no funil", keys: ["parado_3d", "parado_5d", "parado_7d"] },
  {
    title: "Contato",
    keys: [
      "nunca_contatado",
      "contatado_hoje",
      "contatado_7d",
      "sem_contato_7d",
      "sem_contato_15d",
      "sem_contato_30d",
    ],
  },
];

/** Controle 2: "Filtros" — painel largo (2 colunas no desktop), estado
 * pendente só é confirmado em "Aplicar filtros" (nunca aplica parcial
 * enquanto o usuário edita, conforme pedido). "Limpar"/"Aplicar" sempre
 * visíveis (rodapé fixo, conteúdo rola). */
export function FilterPanel({
  filters,
  onApply,
  team,
}: {
  filters: LeadFilters;
  onApply: (f: LeadFilters) => void;
  team: TeamMemberLite[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<LeadFilters>(filters);
  const activeCount = countActiveLeadFilters(filters);

  const openPanel = (v: boolean) => {
    if (v) setPending(filters);
    setOpen(v);
  };

  return (
    <Popover open={open} onOpenChange={openPanel}>
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
      <PopoverContent
        align="start"
        className="flex max-h-[80vh] w-[92vw] flex-col p-0 sm:w-[560px] lg:w-[640px]"
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <p className="text-sm font-semibold text-foreground">Filtrar oportunidades</p>
          <button
            type="button"
            onClick={() => setPending(EMPTY_LEAD_FILTERS)}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Limpar
          </button>
        </div>

        <div className="grid flex-1 grid-cols-1 gap-5 overflow-y-auto p-4 sm:grid-cols-2">
          <div className="space-y-4">
            <div>
              <p className="mb-1.5 text-[11px] font-semibold text-foreground">Pessoas</p>
              <p className="mb-1 text-[10px] font-medium uppercase text-muted-foreground">
                Responsável
              </p>
              <div className="flex flex-wrap gap-1">
                {team.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() =>
                      setPending({
                        ...pending,
                        responsibles: toggleIn(pending.responsibles, m.name),
                      })
                    }
                    className={pillCls(pending.responsibles.includes(m.name))}
                  >
                    {m.name}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setPending({ ...pending, noResponsible: !pending.noResponsible })}
                  className={pillCls(pending.noResponsible)}
                >
                  Sem responsável
                </button>
              </div>
            </div>

            <div>
              <p className="mb-1.5 text-[11px] font-semibold text-foreground">Pipeline</p>
              <p className="mb-1 text-[10px] font-medium uppercase text-muted-foreground">Etapa</p>
              <div className="flex flex-wrap gap-1">
                {OPPORTUNITY_STAGES.map((s: OpportunityStage) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setPending({ ...pending, stages: toggleIn(pending.stages, s) })}
                    className={pillCls(pending.stages.includes(s))}
                  >
                    {OPPORTUNITY_STAGE_LABEL[s]}
                  </button>
                ))}
              </div>
              <p className="mb-1 mt-2 text-[10px] font-medium uppercase text-muted-foreground">
                Status
              </p>
              <div className="flex flex-wrap gap-1">
                {(["aberto", "ganho", "perdido"] as LeadStatusFilter[]).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setPending({ ...pending, status: toggleIn(pending.status, s) })}
                    className={pillCls(pending.status.includes(s))}
                  >
                    {STATUS_LABEL[s]}
                  </button>
                ))}
              </div>
              <p className="mb-1 mt-2 text-[10px] font-medium uppercase text-muted-foreground">
                Origem
              </p>
              <div className="flex flex-wrap gap-1">
                {SOURCES.map((o) => (
                  <button
                    key={o}
                    type="button"
                    onClick={() =>
                      setPending({ ...pending, origins: toggleIn(pending.origins, o) })
                    }
                    className={pillCls(pending.origins.includes(o))}
                  >
                    {o}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-1.5 text-[11px] font-semibold text-foreground">Valores</p>
              <div className="flex items-center gap-2">
                <input
                  inputMode="decimal"
                  value={pending.minValue ?? ""}
                  onChange={(e) =>
                    setPending({
                      ...pending,
                      minValue: e.target.value.trim() ? Number(e.target.value) : undefined,
                    })
                  }
                  placeholder="Valor mín. (R$)"
                  className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs outline-none focus:ring-2 focus:ring-ring"
                />
                <span className="text-muted-foreground">–</span>
                <input
                  inputMode="decimal"
                  value={pending.maxValue ?? ""}
                  onChange={(e) =>
                    setPending({
                      ...pending,
                      maxValue: e.target.value.trim() ? Number(e.target.value) : undefined,
                    })
                  }
                  placeholder="Valor máx. (R$)"
                  className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div className="mt-2 flex items-center gap-2">
                <input
                  inputMode="numeric"
                  value={pending.minProbability ?? ""}
                  onChange={(e) =>
                    setPending({
                      ...pending,
                      minProbability: e.target.value.trim() ? Number(e.target.value) : undefined,
                    })
                  }
                  placeholder="Probabilidade mín. (%)"
                  className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs outline-none focus:ring-2 focus:ring-ring"
                />
                <span className="text-muted-foreground">–</span>
                <input
                  inputMode="numeric"
                  value={pending.maxProbability ?? ""}
                  onChange={(e) =>
                    setPending({
                      ...pending,
                      maxProbability: e.target.value.trim() ? Number(e.target.value) : undefined,
                    })
                  }
                  placeholder="Probabilidade máx. (%)"
                  className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <p className="mb-1.5 text-[11px] font-semibold text-foreground">Atividade</p>
              {ACTIVITY_GROUPS.map((g) => (
                <div key={g.title} className="mb-2">
                  <p className="mb-1 text-[10px] font-medium uppercase text-muted-foreground">
                    {g.title}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {g.keys.map((k) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() =>
                          setPending({ ...pending, activity: toggleIn(pending.activity, k) })
                        }
                        className={pillCls(pending.activity.includes(k))}
                      >
                        {LEAD_ACTIVITY_FILTER_LABEL[k]}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-border px-4 py-3">
          <span className="text-[11px] text-muted-foreground">
            {countActiveLeadFilters(pending)} filtro
            {countActiveLeadFilters(pending) === 1 ? "" : "s"} selecionado
            {countActiveLeadFilters(pending) === 1 ? "" : "s"}
          </span>
          <Button
            size="sm"
            onClick={() => {
              onApply(pending);
              setOpen(false);
            }}
          >
            Aplicar filtros
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

type Chip = { id: string; label: string; onRemove: () => void };

function buildChips(filters: LeadFilters, onChange: (f: LeadFilters) => void): Chip[] {
  const chips: Chip[] = [];
  for (const r of filters.responsibles) {
    chips.push({
      id: `resp-${r}`,
      label: `Responsável: ${r}`,
      onRemove: () => onChange({ ...filters, responsibles: toggleIn(filters.responsibles, r) }),
    });
  }
  if (filters.noResponsible) {
    chips.push({
      id: "no-resp",
      label: "Sem responsável",
      onRemove: () => onChange({ ...filters, noResponsible: false }),
    });
  }
  for (const s of filters.stages) {
    chips.push({
      id: `stage-${s}`,
      label: OPPORTUNITY_STAGE_LABEL[s],
      onRemove: () => onChange({ ...filters, stages: toggleIn(filters.stages, s) }),
    });
  }
  for (const s of filters.status) {
    chips.push({
      id: `status-${s}`,
      label: `Status: ${STATUS_LABEL[s]}`,
      onRemove: () => onChange({ ...filters, status: toggleIn(filters.status, s) }),
    });
  }
  for (const o of filters.origins) {
    chips.push({
      id: `origin-${o}`,
      label: `Origem: ${o}`,
      onRemove: () => onChange({ ...filters, origins: toggleIn(filters.origins, o) }),
    });
  }
  for (const t of filters.tags) {
    chips.push({
      id: `tag-${t}`,
      label: `Tag: ${t}`,
      onRemove: () => onChange({ ...filters, tags: toggleIn(filters.tags, t) }),
    });
  }
  for (const a of filters.activity) {
    chips.push({
      id: `activity-${a}`,
      label: LEAD_ACTIVITY_FILTER_LABEL[a],
      onRemove: () => onChange({ ...filters, activity: toggleIn(filters.activity, a) }),
    });
  }
  if (filters.minValue !== undefined || filters.maxValue !== undefined) {
    chips.push({
      id: "value-range",
      label: `Valor: ${filters.minValue ?? "0"} – ${filters.maxValue ?? "∞"}`,
      onRemove: () => onChange({ ...filters, minValue: undefined, maxValue: undefined }),
    });
  }
  if (filters.minProbability !== undefined || filters.maxProbability !== undefined) {
    chips.push({
      id: "prob-range",
      label: `Probabilidade: ${filters.minProbability ?? "0"}–${filters.maxProbability ?? "100"}%`,
      onRemove: () =>
        onChange({ ...filters, minProbability: undefined, maxProbability: undefined }),
    });
  }
  return chips;
}

/** Chips dos filtros ativos — mostra os principais e agrupa o resto em
 * "+N filtros" pra nunca ocupar várias linhas desnecessárias. Mesma fonte
 * de verdade (`filters`) do contador do botão "Filtros" e dos indicadores
 * clicáveis do `PipelineSummary`. */
export function LeadFiltersChips({
  filters,
  onChange,
  resultCount,
}: {
  filters: LeadFilters;
  onChange: (f: LeadFilters) => void;
  resultCount?: number;
}) {
  const chips = buildChips(filters, onChange);
  const MAX_VISIBLE = 4;
  const visible = chips.slice(0, MAX_VISIBLE);
  const overflow = chips.length - visible.length;

  if (chips.length === 0) {
    return resultCount !== undefined ? (
      <p className="text-[11px] text-muted-foreground">
        {resultCount} oportunidade{resultCount === 1 ? "" : "s"} encontrada
        {resultCount === 1 ? "" : "s"}
      </p>
    ) : null;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {visible.map((chip) => (
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
      {overflow > 0 && (
        <Badge variant="secondary" className="py-1">
          +{overflow} filtro{overflow === 1 ? "" : "s"}
        </Badge>
      )}
      <button
        type="button"
        onClick={() => onChange(EMPTY_LEAD_FILTERS)}
        className="text-[11px] font-medium text-text-secondary hover:text-foreground"
      >
        Limpar tudo
      </button>
      {resultCount !== undefined && (
        <span className="ml-auto text-[11px] text-muted-foreground">
          {resultCount} oportunidade{resultCount === 1 ? "" : "s"} encontrada
          {resultCount === 1 ? "" : "s"}
        </span>
      )}
    </div>
  );
}
