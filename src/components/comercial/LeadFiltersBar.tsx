import { useEffect, useState } from "react";
import { Filter, X, ArrowUpDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { Lead } from "@/lib/comercial";
import {
  OPPORTUNITY_STAGES,
  OPPORTUNITY_STAGE_LABEL,
  legacyStage,
  deriveOpportunityNextStep,
  daysSinceLastStageChange,
  isOpportunityStale,
  type OpportunityStage,
} from "@/lib/comercial-engine";
import type { TeamMemberLite } from "@/lib/projetos";

/**
 * Filtros/ordenação do pipeline — mesmo padrão visual/estrutural do
 * "Filtrar" de `TaskBoard.tsx` (popover com contador + chips removíveis +
 * "Limpar tudo"), persistido em localStorage (`usePersistedState`, mesma
 * técnica local já usada lá) em vez de sincronizado com a URL — não há
 * nenhum precedente de filtro-de-lista em URL neste repo (só `?section=`
 * de navegação entre módulos).
 */

export type LeadNextActionFilter = "todas" | "com" | "sem";
export type LeadSortKey = "valor" | "proxima_acao" | "tempo_parado";
export type LeadSortDir = "asc" | "desc";

export type LeadFiltersState = {
  responsibles: string[];
  stages: OpportunityStage[];
  origins: string[];
  nextAction: LeadNextActionFilter;
  overdueOnly: boolean;
  staleOnly: boolean;
  minValue: string;
  maxValue: string;
  sort: LeadSortKey;
  sortDir: LeadSortDir;
};

export const DEFAULT_LEAD_FILTERS: LeadFiltersState = {
  responsibles: [],
  stages: [],
  origins: [],
  nextAction: "todas",
  overdueOnly: false,
  staleOnly: false,
  minValue: "",
  maxValue: "",
  sort: "tempo_parado",
  sortDir: "desc",
};

function usePersistedState<T>(key: string, initial: T): [T, (v: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw !== null ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* ignore */
    }
  }, [key, value]);
  return [value, setValue];
}

export function useLeadFilters(): [LeadFiltersState, (v: LeadFiltersState) => void] {
  return usePersistedState("comercial:filters", DEFAULT_LEAD_FILTERS);
}

/** Pura e testável — nunca duplicada entre o board e qualquer outra tela
 * que precise da mesma lista filtrada. */
export function applyLeadFilters(leads: Lead[], f: LeadFiltersState): Lead[] {
  const min = f.minValue.trim() ? Number(f.minValue) : null;
  const max = f.maxValue.trim() ? Number(f.maxValue) : null;
  return leads.filter((l) => {
    if (f.responsibles.length > 0 && !f.responsibles.includes(l.responsible ?? "")) return false;
    if (f.stages.length > 0 && !f.stages.includes(legacyStage(l.stage))) return false;
    if (f.origins.length > 0 && !f.origins.includes(l.source ?? "")) return false;
    if (f.nextAction !== "todas") {
      const hasAction = deriveOpportunityNextStep(l).action !== null;
      if (f.nextAction === "com" && !hasAction) return false;
      if (f.nextAction === "sem" && hasAction) return false;
    }
    if (f.overdueOnly) {
      const overdue = !!l.nextMeeting && new Date(l.nextMeeting).getTime() < Date.now();
      if (!overdue) return false;
    }
    if (f.staleOnly && !isOpportunityStale(l)) return false;
    if (min !== null && (l.value || 0) < min) return false;
    if (max !== null && (l.value || 0) > max) return false;
    return true;
  });
}

export function sortLeads(leads: Lead[], sort: LeadSortKey, dir: LeadSortDir): Lead[] {
  const mul = dir === "asc" ? 1 : -1;
  const sorted = [...leads];
  sorted.sort((a, b) => {
    if (sort === "valor") return ((a.value || 0) - (b.value || 0)) * mul;
    if (sort === "tempo_parado") {
      return (daysSinceLastStageChange(a) - daysSinceLastStageChange(b)) * mul;
    }
    // proxima_acao: reuniões marcadas primeiro (por data), sem prazo por último
    const am = a.nextMeeting ? new Date(a.nextMeeting).getTime() : Infinity;
    const bm = b.nextMeeting ? new Date(b.nextMeeting).getTime() : Infinity;
    return (am - bm) * mul;
  });
  return sorted;
}

export function countActiveFilters(f: LeadFiltersState): number {
  let n = 0;
  if (f.responsibles.length) n += 1;
  if (f.stages.length) n += 1;
  if (f.origins.length) n += 1;
  if (f.nextAction !== "todas") n += 1;
  if (f.overdueOnly) n += 1;
  if (f.staleOnly) n += 1;
  if (f.minValue.trim() || f.maxValue.trim()) n += 1;
  return n;
}

const SOURCES = ["Indicação", "Instagram", "Google", "LinkedIn", "Site", "Evento", "Outro"];
const SORT_LABEL: Record<LeadSortKey, string> = {
  valor: "Valor",
  proxima_acao: "Próxima ação",
  tempo_parado: "Tempo parado",
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

export function LeadFiltersBar({
  filters,
  onChange,
  team,
}: {
  filters: LeadFiltersState;
  onChange: (f: LeadFiltersState) => void;
  team: TeamMemberLite[];
}) {
  const [open, setOpen] = useState(false);
  const activeCount = countActiveFilters(filters);

  const clearAll = () => onChange(DEFAULT_LEAD_FILTERS);

  const chips: { id: string; label: string; onRemove: () => void }[] = [
    ...filters.responsibles.map((r) => ({
      id: `resp-${r}`,
      label: `Responsável: ${r || "(sem responsável)"}`,
      onRemove: () => onChange({ ...filters, responsibles: toggleIn(filters.responsibles, r) }),
    })),
    ...filters.stages.map((s) => ({
      id: `stage-${s}`,
      label: OPPORTUNITY_STAGE_LABEL[s],
      onRemove: () => onChange({ ...filters, stages: toggleIn(filters.stages, s) }),
    })),
    ...filters.origins.map((o) => ({
      id: `origin-${o}`,
      label: `Origem: ${o}`,
      onRemove: () => onChange({ ...filters, origins: toggleIn(filters.origins, o) }),
    })),
    ...(filters.nextAction !== "todas"
      ? [
          {
            id: "next-action",
            label: filters.nextAction === "com" ? "Com próxima ação" : "Sem próxima ação",
            onRemove: () => onChange({ ...filters, nextAction: "todas" as const }),
          },
        ]
      : []),
    ...(filters.overdueOnly
      ? [
          {
            id: "overdue",
            label: "Ação vencida",
            onRemove: () => onChange({ ...filters, overdueOnly: false }),
          },
        ]
      : []),
    ...(filters.staleOnly
      ? [
          {
            id: "stale",
            label: "Parado 5+ dias",
            onRemove: () => onChange({ ...filters, staleOnly: false }),
          },
        ]
      : []),
    ...(filters.minValue.trim() || filters.maxValue.trim()
      ? [
          {
            id: "value-range",
            label: `Valor: ${filters.minValue || "0"} – ${filters.maxValue || "∞"}`,
            onRemove: () => onChange({ ...filters, minValue: "", maxValue: "" }),
          },
        ]
      : []),
  ];

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={`inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted/40 ${
              activeCount > 0 ? "text-foreground" : "text-muted-foreground"
            }`}
          >
            <Filter className="h-3.5 w-3.5" />
            Filtrar
            {activeCount > 0 && (
              <span className="rounded-full bg-foreground px-1.5 text-[10px] text-background">
                {activeCount}
              </span>
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="max-h-[70vh] w-80 space-y-3 overflow-y-auto p-3">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold text-foreground">Filtrar oportunidades</p>
            <button
              type="button"
              disabled={activeCount === 0}
              onClick={clearAll}
              className="text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-40"
            >
              Limpar
            </button>
          </div>

          <div>
            <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">Responsável</p>
            <div className="flex flex-wrap gap-1">
              {team.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() =>
                    onChange({ ...filters, responsibles: toggleIn(filters.responsibles, m.name) })
                  }
                  className={pillCls(filters.responsibles.includes(m.name))}
                >
                  {m.name}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">Etapa</p>
            <div className="flex flex-wrap gap-1">
              {OPPORTUNITY_STAGES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => onChange({ ...filters, stages: toggleIn(filters.stages, s) })}
                  className={pillCls(filters.stages.includes(s))}
                >
                  {OPPORTUNITY_STAGE_LABEL[s]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">Origem</p>
            <div className="flex flex-wrap gap-1">
              {SOURCES.map((o) => (
                <button
                  key={o}
                  type="button"
                  onClick={() => onChange({ ...filters, origins: toggleIn(filters.origins, o) })}
                  className={pillCls(filters.origins.includes(o))}
                >
                  {o}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">Próxima ação</p>
            <div className="flex gap-1">
              {(["todas", "com", "sem"] as LeadNextActionFilter[]).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => onChange({ ...filters, nextAction: v })}
                  className={pillCls(filters.nextAction === v)}
                >
                  {v === "todas" ? "Todas" : v === "com" ? "Com ação" : "Sem ação"}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-1">
            <button
              type="button"
              onClick={() => onChange({ ...filters, overdueOnly: !filters.overdueOnly })}
              className={pillCls(filters.overdueOnly)}
            >
              Ação vencida
            </button>
            <button
              type="button"
              onClick={() => onChange({ ...filters, staleOnly: !filters.staleOnly })}
              className={pillCls(filters.staleOnly)}
            >
              Parado 5+ dias
            </button>
          </div>

          <div>
            <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">
              Faixa de valor (R$)
            </p>
            <div className="flex items-center gap-2">
              <input
                inputMode="decimal"
                value={filters.minValue}
                onChange={(e) => onChange({ ...filters, minValue: e.target.value })}
                placeholder="Mín."
                className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs outline-none focus:ring-2 focus:ring-ring"
              />
              <span className="text-muted-foreground">–</span>
              <input
                inputMode="decimal"
                value={filters.maxValue}
                onChange={(e) => onChange({ ...filters, maxValue: e.target.value })}
                placeholder="Máx."
                className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>
        </PopoverContent>
      </Popover>

      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted/40"
          >
            <ArrowUpDown className="h-3.5 w-3.5" />
            Ordenar: {SORT_LABEL[filters.sort]}
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-56 space-y-1 p-2">
          {(Object.keys(SORT_LABEL) as LeadSortKey[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => onChange({ ...filters, sort: k })}
              className={`block w-full rounded-md px-2 py-1.5 text-left text-xs ${
                filters.sort === k
                  ? "bg-muted font-medium text-foreground"
                  : "text-muted-foreground hover:bg-muted/60"
              }`}
            >
              {SORT_LABEL[k]}
            </button>
          ))}
          <div className="mt-1 flex gap-1 border-t border-border pt-1">
            <button
              type="button"
              onClick={() => onChange({ ...filters, sortDir: "desc" })}
              className={pillCls(filters.sortDir === "desc")}
            >
              Maior/mais antigo primeiro
            </button>
            <button
              type="button"
              onClick={() => onChange({ ...filters, sortDir: "asc" })}
              className={pillCls(filters.sortDir === "asc")}
            >
              Inverter
            </button>
          </div>
        </PopoverContent>
      </Popover>

      {chips.length > 0 && (
        <>
          {chips.map((chip) => (
            <span
              key={chip.id}
              className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
            >
              {chip.label}
              <button
                type="button"
                onClick={chip.onRemove}
                aria-label={`Remover filtro ${chip.label}`}
                className="hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          <button
            type="button"
            onClick={clearAll}
            className="text-[11px] text-muted-foreground hover:text-foreground"
          >
            Limpar tudo
          </button>
        </>
      )}
    </div>
  );
}
