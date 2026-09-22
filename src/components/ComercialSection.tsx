import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { Plus, Search, X, BookmarkPlus, Bookmark, Trash2 } from "lucide-react";
import { type Lead, type PropostaSnapshot } from "@/lib/comercial";
import {
  listLeads,
  upsertLead as upsertLeadFn,
  updateLeadStage,
  deleteLead as deleteLeadFn,
  runOpportunityAction,
  listSavedViews,
  upsertSavedView,
  deleteSavedView,
} from "@/lib/comercial.functions";
import { type OpportunityActionKind, type OpportunityStage } from "@/lib/comercial-engine";
import {
  rangeForComercialPeriod,
  computeComercialKpis,
  COMERCIAL_PERIOD_OPTIONS,
  type ComercialPeriodMode,
} from "@/lib/comercial-metrics";
import {
  EMPTY_LEAD_FILTERS,
  DEFAULT_LEAD_SORT,
  DEFAULT_LEAD_DIRECTION,
  type LeadFilters,
  type LeadSortField,
  type LeadSortDirection,
} from "@/lib/comercial-filters";
import { loadTeamMembers, type TeamMemberLite } from "@/lib/projetos";
import { supabase } from "@/integrations/supabase/client";
import { useConfirm } from "@/hooks/use-confirm";
import { PageContainer } from "@/components/shared/PageContainer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { PipelineSummary } from "./comercial/PipelineSummary";
import { SortControl, FilterPanel, LeadFiltersChips } from "./comercial/LeadFiltersBar";
import { PipelineBoard } from "./comercial/PipelineBoard";
import { LeadDrawer, type OpportunityActionInput } from "./comercial/LeadDrawer";

/** Debounce simples — evita 1 request por tecla na busca. */
function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

/**
 * Central de vendas (Comercial) — dados (React Query + realtime Supabase)
 * + drawer da oportunidade. Filtro/ordenação/busca são aplicados no
 * SERVIDOR (`listLeads`, allowlist em `comercial-filters.ts`) e
 * persistidos na URL da rota `time.tsx` (`cSort`/`cDir`/`cQ`/`cf`/
 * `cPeriod`/`cView`) — sobrevivem a refresh e a compartilhar o link,
 * nunca em localStorage. O período ("Este mês" etc) só afeta os
 * indicadores históricos (ganho/perdido no período) — NUNCA esconde
 * oportunidades abertas do Kanban, que sempre mostra todas as que
 * atendem aos filtros explícitos.
 */
export function ComercialSection() {
  const [team, setTeam] = useState<TeamMemberLite[]>(() => loadTeamMembers());
  const [showDrawer, setShowDrawer] = useState(false);
  const [editing, setEditing] = useState<Lead | null>(null);
  const [createInStage, setCreateInStage] = useState<OpportunityStage | undefined>(undefined);

  const search = useSearch({ from: "/_authenticated/time" });
  const navigate = useNavigate();

  const sort: LeadSortField = search.cSort ?? DEFAULT_LEAD_SORT;
  const direction: LeadSortDirection = search.cDir ?? DEFAULT_LEAD_DIRECTION;
  const filters: LeadFilters = search.cf ?? EMPTY_LEAD_FILTERS;
  const period: ComercialPeriodMode = search.cPeriod ?? "mes";
  const [searchText, setSearchText] = useState(search.cQ ?? "");
  const debouncedSearch = useDebouncedValue(searchText, 300);

  const patchSearch = (
    patch: Partial<{
      cSort: LeadSortField;
      cDir: LeadSortDirection;
      cQ: string | undefined;
      cf: LeadFilters;
      cPeriod: ComercialPeriodMode;
      cView: string | undefined;
    }>,
  ) => {
    void navigate({
      to: ".",
      search: (prev: Record<string, unknown>) => {
        const next: Record<string, unknown> = { ...prev };
        for (const [k, v] of Object.entries(patch)) {
          if (
            v === undefined ||
            (k === "cf" && JSON.stringify(v) === JSON.stringify(EMPTY_LEAD_FILTERS))
          ) {
            delete next[k];
          } else if (k === "cf") {
            next[k] = JSON.stringify(v);
          } else {
            next[k] = v;
          }
        }
        return next as never;
      },
      replace: true,
    });
  };

  useEffect(() => {
    patchSearch({ cQ: debouncedSearch.trim() || undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const queryClient = useQueryClient();
  const listLeadsFn = useServerFn(listLeads);
  const upsertFn = useServerFn(upsertLeadFn);
  const stageFn = useServerFn(updateLeadStage);
  const deleteFn = useServerFn(deleteLeadFn);
  const runActionFn = useServerFn(runOpportunityAction);
  const listViewsFn = useServerFn(listSavedViews);
  const upsertViewFn = useServerFn(upsertSavedView);
  const deleteViewFn = useServerFn(deleteSavedView);

  const listParams = useMemo(
    () => ({ sort, direction, search: debouncedSearch.trim() || undefined, filters }),
    [sort, direction, debouncedSearch, filters],
  );

  const {
    data: leads = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["leads", listParams],
    queryFn: () => listLeadsFn({ data: listParams as never }),
    refetchInterval: 15000,
    placeholderData: (prev) => prev,
  });

  const { data: savedViews = [] } = useQuery({
    queryKey: ["comercial-saved-views"],
    queryFn: () => listViewsFn(),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["leads"] });
  const invalidateViews = () =>
    queryClient.invalidateQueries({ queryKey: ["comercial-saved-views"] });

  useEffect(() => {
    const channel = supabase
      .channel(`rt-leads-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, () => invalidate())
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    const onStorage = () => setTeam(loadTeamMembers());
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const upsertMutation = useMutation({
    mutationFn: (lead: Lead) => {
      const existing = leads.some((l) => l.id === lead.id);
      const payload = existing ? lead : { ...lead, id: undefined };
      return upsertFn({ data: payload as never });
    },
    onSuccess: invalidate,
  });
  const stageMutation = useMutation({
    mutationFn: (v: { id: string; stage: string }) => stageFn({ data: v }),
    onMutate: async (v) => {
      await queryClient.cancelQueries({ queryKey: ["leads"] });
      const prev = queryClient.getQueryData<Lead[]>(["leads", listParams]);
      queryClient.setQueryData<Lead[]>(["leads", listParams], (old) =>
        (old ?? []).map((l) => (l.id === v.id ? { ...l, stage: v.stage } : l)),
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(["leads", listParams], ctx.prev);
    },
    onSettled: invalidate,
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: invalidate,
  });
  const actionMutation = useMutation({
    mutationFn: (input: {
      id: string;
      action: OpportunityActionKind;
      data?: string;
      proposta?: PropostaSnapshot;
      nota?: string;
      novoValor?: number;
      valorFinal?: number;
      motivo?: string;
      toStage?: OpportunityStage;
    }) => runActionFn({ data: input as never }),
    onSuccess: invalidate,
  });
  const saveViewMutation = useMutation({
    mutationFn: (v: { name: string; isDefault?: boolean }) =>
      upsertViewFn({
        data: { name: v.name, filters, sort, direction, isDefault: v.isDefault } as never,
      }),
    onSuccess: invalidateViews,
  });
  const deleteViewMutation = useMutation({
    mutationFn: (id: string) => deleteViewFn({ data: { id } }),
    onSuccess: invalidateViews,
  });

  const range = useMemo(() => rangeForComercialPeriod(period), [period]);

  const { confirm: confirmDelete, confirmDialog } = useConfirm();

  const openLead = (lead: Lead) => {
    setEditing(lead);
    setCreateInStage(undefined);
    setShowDrawer(true);
  };
  const openNewLead = (stage?: OpportunityStage) => {
    setEditing(null);
    setCreateInStage(stage);
    setShowDrawer(true);
  };
  const closeDrawer = () => {
    setShowDrawer(false);
    setEditing(null);
    setCreateInStage(undefined);
  };
  const moveTo = (id: string, stage: string) => stageMutation.mutate({ id, stage });
  /** Indicador clicado na faixa compacta do topo — aplica o filtro
   * correspondente direto no Pipeline. */
  const goToPipelineWithFilter = (patch: Partial<LeadFilters>) => {
    patchSearch({ cf: { ...EMPTY_LEAD_FILTERS, ...patch } });
  };
  const handleDeleteFromDrawer = async () => {
    if (!editing) return;
    const ok = await confirmDelete("Excluir esta oportunidade?");
    if (!ok) return;
    deleteMutation.mutate(editing.id);
    closeDrawer();
  };

  const kpis = computeComercialKpis(leads, range);
  const openLeads = useMemo(
    () => leads.filter((l) => l.stage !== "GANHO" && l.stage !== "PERDIDO"),
    [leads],
  );

  const applySavedView = (v: (typeof savedViews)[number]) => {
    patchSearch({
      cSort: v.sort as LeadSortField,
      cDir: v.direction as LeadSortDirection,
      cf: (v.filters ?? EMPTY_LEAD_FILTERS) as LeadFilters,
      cView: v.id,
    });
  };

  return (
    <div className="-m-4 min-h-full bg-muted p-4 dark:bg-transparent md:-m-8 md:p-8">
      <PageContainer variant="wide" className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[36px] font-bold leading-[1.05] tracking-tight text-foreground md:text-[42px]">
              Comercial
            </p>
            <p className="mt-1.5 text-sm text-text-secondary">
              Pipeline e acompanhamento de oportunidades.
            </p>
          </div>
          <Button variant="primary" size="comfortable" onClick={() => openNewLead()}>
            <Plus className="h-4 w-4" /> Novo lead
          </Button>
        </div>

        {/* Toolbar: Período · Busca · Filtros · Ordenação · Visualizações
         * salvas — 5 controles genuinamente separados (pedido explícito),
         * nunca ordenação/direção combinadas num só menu. */}
        <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-card p-2 dark:shadow-none">
          <select
            value={period}
            onChange={(e) => patchSearch({ cPeriod: e.target.value as ComercialPeriodMode })}
            className="h-9 shrink-0 cursor-pointer rounded-md border border-border bg-background px-2.5 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            {COMERCIAL_PERIOD_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <div className="relative min-w-40 flex-1 sm:max-w-72">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary" />
            <Input
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Buscar por empresa, contato, e-mail, telefone, responsável..."
              className="h-9 pl-8 pr-8 text-sm"
            />
            {searchText && (
              <button
                type="button"
                onClick={() => setSearchText("")}
                aria-label="Limpar busca"
                className="absolute right-2 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full text-text-secondary hover:bg-muted hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <FilterPanel filters={filters} onApply={(f) => patchSearch({ cf: f })} team={team} />
          <SortControl
            sort={sort}
            direction={direction}
            onChange={(s, d) => patchSearch({ cSort: s, cDir: d })}
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5">
                <Bookmark className="h-3.5 w-3.5" />
                Visualizações
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              {savedViews.length === 0 && (
                <p className="px-2 py-1.5 text-xs text-muted-foreground">
                  Nenhuma visualização salva ainda.
                </p>
              )}
              {savedViews.map((v) => (
                <DropdownMenuItem
                  key={v.id}
                  className="flex items-center justify-between gap-2"
                  onSelect={() => applySavedView(v)}
                >
                  <span className="truncate">
                    {v.name}
                    {v.is_default ? " · padrão" : ""}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteViewMutation.mutate(v.id);
                    }}
                    aria-label={`Excluir visualização ${v.name}`}
                    className="text-muted-foreground hover:text-danger"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => {
                  const name = window.prompt("Nome da visualização:");
                  if (name?.trim()) saveViewMutation.mutate({ name: name.trim() });
                }}
              >
                <BookmarkPlus className="mr-2 h-3.5 w-3.5" />
                Salvar visualização atual
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <LeadFiltersChips
          filters={filters}
          onChange={(f) => patchSearch({ cf: f })}
          resultCount={leads.length}
        />

        <PipelineSummary
          kpis={kpis}
          openLeads={openLeads}
          filters={filters}
          onFilter={goToPipelineWithFilter}
        />

        {isError ? (
          <div className="rounded-[24px] bg-card p-10 text-center dark:shadow-none">
            <p className="text-sm text-text-secondary">
              Não foi possível carregar as oportunidades.
            </p>
            <button
              type="button"
              onClick={() => void refetch()}
              className="mt-3 rounded-full border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
            >
              Tentar novamente
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {isLoading ? (
              <div className="flex gap-3 overflow-x-auto pb-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-64 w-[300px] shrink-0 animate-pulse rounded-[20px] bg-card/60"
                  />
                ))}
              </div>
            ) : leads.length === 0 ? (
              <div className="rounded-[24px] bg-card p-10 text-center dark:shadow-none">
                <p className="text-sm text-text-secondary">
                  Nenhuma oportunidade encontrada com esses filtros.
                </p>
              </div>
            ) : (
              <PipelineBoard
                leads={leads}
                onOpenLead={openLead}
                onMoveLead={moveTo}
                onCreateInStage={openNewLead}
              />
            )}
          </div>
        )}

        {showDrawer && (
          <LeadDrawer
            initial={editing}
            initialStage={createInStage}
            open={showDrawer}
            team={team}
            onClose={closeDrawer}
            onSave={(lead) => {
              upsertMutation.mutate(lead);
              closeDrawer();
            }}
            onRunAction={(input: OpportunityActionInput) => actionMutation.mutateAsync(input)}
            onAutosave={(lead) => upsertMutation.mutateAsync(lead)}
            onDelete={editing ? handleDeleteFromDrawer : undefined}
          />
        )}
        {confirmDialog}
      </PageContainer>
    </div>
  );
}
