import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/EmptyState";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { AlertTriangle, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { type Lead, type PropostaSnapshot } from "@/lib/comercial";
import {
  listLeads,
  upsertLead as upsertLeadFn,
  updateLeadStage,
  deleteLead as deleteLeadFn,
  runOpportunityAction,
} from "@/lib/comercial.functions";
import { registerFollowUp } from "@/lib/commercial-interactions.functions";
import { applyFollowUpToCaches } from "@/lib/comercial-followup-cache";
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
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { PipelineSummary } from "./comercial/PipelineSummary";
import { PeriodMenu } from "@/components/shared/PeriodMenu";
import { FilterRow, FilterSearch, FilterToolbar } from "@/components/shared/FilterToolbar";
import { SortSelect, FilterPanel, LeadFiltersSummary } from "./comercial/LeadFiltersBar";
import { ComercialRecursosMenu } from "./comercial/ComercialRecursosMenu";
import { ComercialTarefasBoard } from "./comercial/ComercialTarefasBoard";
import { PipelineBoard } from "./comercial/PipelineBoard";
import { LeadDrawer, type OpportunityActionInput } from "./comercial/LeadDrawer";
import { FollowUpDialog, type FollowUpInput } from "./comercial/FollowUpDialog";

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
  const [followUpLead, setFollowUpLead] = useState<Lead | null>(null);

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
  const registerFollowUpFn = useServerFn(registerFollowUp);

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
    // Sem polling: a lista se atualiza por `invalidate()` — evento Realtime em
    // `leads` (abaixo), mutações desta tela e os refetchs padrão do React Query
    // ao voltar o foco da aba e ao reconectar a rede.
    placeholderData: (prev) => prev,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["leads"] });

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
  const followUpMutation = useMutation({
    mutationFn: (input: FollowUpInput & { opportunityId: string }) =>
      registerFollowUpFn({ data: input as never }),
    onSuccess: (row, { opportunityId, ...input }) => {
      // Reflete NA HORA o que o servidor acabou de gravar (histórico da ficha,
      // próxima ação e último contato no lead); a releitura abaixo só confirma.
      applyFollowUpToCaches(queryClient, opportunityId, row, input);
      invalidate();
      void queryClient.invalidateQueries({ queryKey: ["commercial-interactions"] });
      toast.success("Follow-up registrado");
    },
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

  // A ficha recebe a versão mais recente do lead na lista (follow-ups e
  // reuniões mudam próxima ação/último contato por fora da ficha).
  const drawerLead = editing ? (leads.find((l) => l.id === editing.id) ?? editing) : null;

  const kpis = computeComercialKpis(leads, range);

  return (
    <>
      <PageContainer variant="wide" className="space-y-5 md:space-y-6">
        <div className="space-y-4">
          <PageHeader
            title="Comercial"
            description="Pipeline e acompanhamento de oportunidades."
            actionsSlot={
              <>
                <ComercialRecursosMenu />
                <Button variant="primary" size="comfortable" onClick={() => openNewLead()}>
                  <Plus className="h-4 w-4" /> Novo lead
                </Button>
              </>
            }
          />
        </div>

        <PipelineSummary kpis={kpis} filters={filters} onFilter={goToPipelineWithFilter} />

        {/* Busca + Filtros + Ordenar + Período; filtros ativos logo abaixo. O período
         * é contexto (vale para os KPIs e para o Kanban), não filtro: não gera chip. */}
        <FilterToolbar>
          <FilterRow>
            <FilterSearch
              value={searchText}
              onChange={setSearchText}
              placeholder="Buscar por empresa, contato, e-mail, telefone, responsável..."
            />
            <FilterPanel filters={filters} onChange={(f) => patchSearch({ cf: f })} team={team} />
            <SortSelect
              sort={sort}
              direction={direction}
              onChange={(s, d) => patchSearch({ cSort: s, cDir: d })}
            />
            <PeriodMenu
              value={period}
              options={COMERCIAL_PERIOD_OPTIONS}
              onChange={(v) => patchSearch({ cPeriod: v })}
            />
          </FilterRow>
          <LeadFiltersSummary
            filters={filters}
            onChange={(f) => patchSearch({ cf: f })}
            resultCount={leads.length}
          />
        </FilterToolbar>

        {isError ? (
          <Card>
            <EmptyState
              icon={<AlertTriangle className="h-5 w-5" />}
              title="Não foi possível carregar as oportunidades"
              description="Verifique a conexão e tente de novo."
              primaryAction={{ label: "Tentar novamente", onClick: () => void refetch() }}
            />
          </Card>
        ) : (
          <div className="space-y-3">
            {isLoading ? (
              <div className="flex gap-3 overflow-x-auto pb-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-64 w-[300px] shrink-0 animate-pulse rounded-2xl bg-card/60"
                  />
                ))}
              </div>
            ) : leads.length === 0 ? (
              <Card>
                <EmptyState
                  icon={<Search className="h-5 w-5" />}
                  title="Nenhuma oportunidade encontrada"
                  description="Ajuste a busca ou os filtros para ver outras oportunidades."
                />
              </Card>
            ) : (
              <PipelineBoard
                leads={leads}
                onOpenLead={openLead}
                onMoveLead={moveTo}
                onCreateInStage={openNewLead}
                onRegisterFollowUp={setFollowUpLead}
              />
            )}
          </div>
        )}

        <ComercialTarefasBoard />

        {followUpLead && (
          <FollowUpDialog
            lead={followUpLead}
            open={!!followUpLead}
            onOpenChange={(v) => {
              if (!v) setFollowUpLead(null);
            }}
            onSubmit={async (input) => {
              await followUpMutation.mutateAsync({ ...input, opportunityId: followUpLead.id });
            }}
          />
        )}

        {showDrawer && (
          <LeadDrawer
            initial={drawerLead}
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
            onRegisterFollowUp={editing ? () => setFollowUpLead(editing) : undefined}
          />
        )}
        {confirmDialog}
      </PageContainer>
    </>
  );
}
