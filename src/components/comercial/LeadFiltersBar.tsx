import { useState } from "react";
import { Check, ChevronDown, Filter } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import type { TeamMemberLite } from "@/lib/projetos";

/**
 * Filtros + ordenação do Pipe Comercial — SIMPLIFICADO (correção pedida
 * explicitamente: a versão anterior tinha opções demais pra uma operação
 * comercial pequena). Só 5 ordenações prontas (nunca campo+direção
 * separados) e um painel de filtros com só 5 grupos essenciais. Toda a
 * allowlist/query real continua em `comercial-filters.ts`/`comercial.
 * functions.ts`, intocada — só a UI ficou mais enxuta.
 */

const SOURCES = ["Indicação", "Instagram", "Google", "LinkedIn", "Site", "Evento", "Outro"];

/** Situação — single-select (nunca múltiplas ao mesmo tempo), mapeado pra
 * 0 ou 1 elemento do array `activity` já existente no backend. */
const SITUACAO_OPTIONS: { key: LeadActivityFilterKey | "todos"; label: string }[] = [
  { key: "todos", label: "Todos" },
  { key: "com_proxima_acao", label: "Com próxima ação" },
  { key: "sem_proxima_acao", label: "Sem próxima ação" },
  { key: "acao_vencida", label: "Ação vencida" },
  { key: "sem_contato_7d", label: "Sem contato há mais de 7 dias" },
];

function toggleIn<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

/** Botão "Ordenar" — mostra só o rótulo da opção pronta selecionada, nunca
 * campo e direção separados. Se a combinação atual de sort/direction não
 * bater com nenhuma das 5 opções (ex.: veio de uma URL antiga com uma
 * ordenação removida da UI), cai visualmente na 1ª opção sem travar nada —
 * o valor real da URL continua o que já era até o usuário trocar. */
export function SortSelect({
  sort,
  direction,
  onChange,
}: {
  sort: LeadSortField;
  direction: LeadSortDirection;
  onChange: (sort: LeadSortField, direction: LeadSortDirection) => void;
}) {
  const [open, setOpen] = useState(false);
  const current =
    LEAD_QUICK_SORTS.find((o) => o.sort === sort && o.direction === direction) ??
    LEAD_QUICK_SORTS[0];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          Ordenar: {current.label}
          <ChevronDown className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-1">
        {LEAD_QUICK_SORTS.map((o) => {
          const active = o.sort === sort && o.direction === direction;
          return (
            <button
              key={o.key}
              type="button"
              onClick={() => {
                onChange(o.sort, o.direction);
                setOpen(false);
              }}
              className={`flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-sm ${
                active
                  ? "bg-muted font-medium text-foreground"
                  : "text-foreground hover:bg-muted/60"
              }`}
            >
              {o.label}
              {active && <Check className="h-3.5 w-3.5" />}
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}

const pillCls = (active: boolean) =>
  `rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
    active
      ? "border-foreground bg-foreground text-background"
      : "border-border text-muted-foreground hover:bg-muted"
  }`;

/** Painel de filtros — compacto, uma coluna, só os 5 grupos essenciais.
 * Estado pendente só é confirmado em "Aplicar filtros" (nunca aplica
 * parcial enquanto o usuário edita). */
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

  const situacaoAtual: (typeof SITUACAO_OPTIONS)[number]["key"] = pending.activity[0] ?? "todos";
  const setSituacao = (key: (typeof SITUACAO_OPTIONS)[number]["key"]) =>
    setPending({ ...pending, activity: key === "todos" ? [] : [key] });

  const responsavelAtual = pending.noResponsible
    ? "sem_responsavel"
    : (pending.responsibles[0] ?? "todos");
  const setResponsavel = (v: string) => {
    if (v === "todos") setPending({ ...pending, responsibles: [], noResponsible: false });
    else if (v === "sem_responsavel")
      setPending({ ...pending, responsibles: [], noResponsible: true });
    else setPending({ ...pending, responsibles: [v], noResponsible: false });
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
      <PopoverContent align="start" className="flex max-h-[75vh] w-[340px] flex-col p-0">
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

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <div>
            <p className="mb-1.5 text-[11px] font-semibold text-foreground">Responsável</p>
            <select
              value={responsavelAtual}
              onChange={(e) => setResponsavel(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="todos">Todos</option>
              {team.map((m) => (
                <option key={m.id} value={m.name}>
                  {m.name}
                </option>
              ))}
              <option value="sem_responsavel">Sem responsável</option>
            </select>
          </div>

          <div>
            <p className="mb-1.5 text-[11px] font-semibold text-foreground">Etapa</p>
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
          </div>

          <div>
            <p className="mb-1.5 text-[11px] font-semibold text-foreground">Situação</p>
            <select
              value={situacaoAtual}
              onChange={(e) =>
                setSituacao(e.target.value as (typeof SITUACAO_OPTIONS)[number]["key"])
              }
              className="h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
            >
              {SITUACAO_OPTIONS.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <p className="mb-1.5 text-[11px] font-semibold text-foreground">Origem</p>
            <div className="flex flex-wrap gap-1">
              {SOURCES.map((o) => (
                <button
                  key={o}
                  type="button"
                  onClick={() => setPending({ ...pending, origins: toggleIn(pending.origins, o) })}
                  className={pillCls(pending.origins.includes(o))}
                >
                  {o}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-[11px] font-semibold text-foreground">Valor (R$)</p>
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
                placeholder="Mín."
                className="h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
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
                placeholder="Máx."
                className="h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-border px-4 py-3">
          <span className="text-[11px] text-muted-foreground">
            {countActiveLeadFilters(pending)} filtro
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

/** Linha discreta abaixo da barra — nunca uma fileira grande de chips.
 * Some por completo quando não há filtro ativo. */
export function LeadFiltersSummary({
  filters,
  onClear,
  resultCount,
}: {
  filters: LeadFilters;
  onClear: () => void;
  resultCount?: number;
}) {
  const count = countActiveLeadFilters(filters);
  if (count === 0) {
    return resultCount !== undefined ? (
      <p className="text-[11px] text-muted-foreground">
        {resultCount} oportunidade{resultCount === 1 ? "" : "s"} encontrada
        {resultCount === 1 ? "" : "s"}
      </p>
    ) : null;
  }
  return (
    <p className="text-[11px] text-muted-foreground">
      {count} filtro{count === 1 ? "" : "s"} aplicado{count === 1 ? "" : "s"}
      {resultCount !== undefined
        ? ` · ${resultCount} resultado${resultCount === 1 ? "" : "s"}`
        : ""}
      {" · "}
      <button
        type="button"
        onClick={onClear}
        className="font-medium text-foreground hover:underline"
      >
        Limpar
      </button>
    </p>
  );
}
