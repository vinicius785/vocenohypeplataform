import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Search, X } from "lucide-react";
import { type Lead, type PropostaSnapshot } from "@/lib/comercial";
import {
  listLeads,
  upsertLead as upsertLeadFn,
  updateLeadStage,
  deleteLead as deleteLeadFn,
  runOpportunityAction,
} from "@/lib/comercial.functions";
import { type OpportunityActionKind, type OpportunityStage } from "@/lib/comercial-engine";
import {
  rangeForComercialPeriod,
  computeComercialKpis,
  COMERCIAL_PERIOD_OPTIONS,
  type ComercialPeriodMode,
} from "@/lib/comercial-metrics";
import { loadTeamMembers, type TeamMemberLite } from "@/lib/projetos";
import { supabase } from "@/integrations/supabase/client";
import { useConfirm } from "@/hooks/use-confirm";
import { PageContainer } from "@/components/shared/PageContainer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PipelineSummary } from "./comercial/PipelineSummary";
import {
  LeadFiltersControls,
  LeadFiltersChips,
  useLeadFilters,
  applyLeadFilters,
  sortLeads,
  DEFAULT_LEAD_FILTERS,
  type LeadFiltersState,
} from "./comercial/LeadFiltersBar";
import { PipelineBoard } from "./comercial/PipelineBoard";
import { LeadDrawer, type OpportunityActionInput } from "./comercial/LeadDrawer";

/**
 * Central de vendas (Comercial) — shell: dados (React Query + realtime
 * Supabase, inalterados) + o drawer da oportunidade. Etapa 3: a barra
 * "Visão geral"/"Pipeline" foi removida — Comercial abre direto no
 * Pipeline, com uma faixa compacta dos 4 indicadores essenciais no topo
 * (mesmos `computeComercialKpis` que `ComercialOverviewView` usava;
 * esse componente não é mais importado aqui, mas continua no repo sem
 * consumidor — candidato a limpeza futura, não removido nesta etapa).
 */
export function ComercialSection() {
  const [team, setTeam] = useState<TeamMemberLite[]>(() => loadTeamMembers());
  const [query, setQuery] = useState("");
  const [period, setPeriod] = useState<ComercialPeriodMode>("mes");
  const [filters, setFilters] = useLeadFilters();
  const [showDrawer, setShowDrawer] = useState(false);
  const [editing, setEditing] = useState<Lead | null>(null);
  const [createInStage, setCreateInStage] = useState<OpportunityStage | undefined>(undefined);

  const queryClient = useQueryClient();
  const listLeadsFn = useServerFn(listLeads);
  const upsertFn = useServerFn(upsertLeadFn);
  const stageFn = useServerFn(updateLeadStage);
  const deleteFn = useServerFn(deleteLeadFn);
  const runActionFn = useServerFn(runOpportunityAction);

  const {
    data: leads = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["leads"],
    queryFn: () => listLeadsFn(),
    refetchInterval: 15000,
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
      const existing = (queryClient.getQueryData<Lead[]>(["leads"]) ?? []).some(
        (l) => l.id === lead.id,
      );
      const payload = existing ? lead : { ...lead, id: undefined };
      return upsertFn({ data: payload as never });
    },
    onSuccess: invalidate,
  });
  const stageMutation = useMutation({
    mutationFn: (v: { id: string; stage: string }) => stageFn({ data: v }),
    onMutate: async (v) => {
      await queryClient.cancelQueries({ queryKey: ["leads"] });
      const prev = queryClient.getQueryData<Lead[]>(["leads"]);
      queryClient.setQueryData<Lead[]>(["leads"], (old) =>
        (old ?? []).map((l) => (l.id === v.id ? { ...l, stage: v.stage } : l)),
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(["leads"], ctx.prev);
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

  const range = useMemo(() => rangeForComercialPeriod(period), [period]);

  const searched = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return leads;
    return leads.filter(
      (l) =>
        l.name.toLowerCase().includes(q) ||
        (l.company ?? "").toLowerCase().includes(q) ||
        (l.contact ?? "").toLowerCase().includes(q),
    );
  }, [leads, query]);

  const boardLeads = useMemo(() => {
    const filtered = applyLeadFilters(searched, filters);
    return sortLeads(filtered, filters.sort, filters.sortDir);
  }, [searched, filters]);

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
   * correspondente direto no Pipeline (só existe uma view agora, então
   * não precisa mais trocar de aba, só o filtro). */
  const goToPipelineWithFilter = (patch: Partial<LeadFiltersState>) => {
    setFilters({ ...DEFAULT_LEAD_FILTERS, ...patch });
  };
  const handleDeleteFromDrawer = async () => {
    if (!editing) return;
    const ok = await confirmDelete("Excluir esta oportunidade?");
    if (!ok) return;
    deleteMutation.mutate(editing.id);
    closeDrawer();
  };

  const kpis = computeComercialKpis(searched, range);
  const openLeads = useMemo(
    () => searched.filter((l) => l.stage !== "GANHO" && l.stage !== "PERDIDO"),
    [searched],
  );

  return (
    // Canvas experimental (mesma correção do Financeiro): `--background`
    // e `--card` globais são idênticos no claro, então sem isso os cards
    // do Comercial não se distinguiam do fundo.
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

        {/* Toolbar única do Pipeline (correção) — período, busca, filtros
         * e ordenação compartilham a mesma superfície visual, em vez de
         * dois centros de controle separados (período+busca acima dos
         * indicadores, filtros+ordenar abaixo do card protagonista). Cada
         * controle mantém sua própria função/estado — só o container é
         * compartilhado. */}
        <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-card p-2 dark:shadow-none">
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value as ComercialPeriodMode)}
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
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar oportunidade..."
              className="h-9 pl-8 pr-8 text-sm"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Limpar busca"
                className="absolute right-2 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full text-text-secondary hover:bg-muted hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <LeadFiltersControls filters={filters} onChange={setFilters} team={team} />
          </div>
        </div>
        <LeadFiltersChips filters={filters} onChange={setFilters} />

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
            ) : boardLeads.length === 0 && leads.length > 0 ? (
              <div className="rounded-[24px] bg-card p-10 text-center dark:shadow-none">
                <p className="text-sm text-text-secondary">
                  Nenhuma oportunidade com esses filtros.
                </p>
              </div>
            ) : (
              <PipelineBoard
                leads={boardLeads}
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
