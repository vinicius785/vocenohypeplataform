import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import type { Lead, PropostaSnapshot } from "@/lib/comercial";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  listLeads,
  upsertLead as upsertLeadFn,
  updateLeadStage,
  deleteLead as deleteLeadFn,
  runOpportunityAction,
} from "@/lib/comercial.functions";
import { type OpportunityActionKind, type OpportunityStage } from "@/lib/comercial-engine";
import { rangeForComercialPeriod, type ComercialPeriodMode } from "@/lib/comercial-metrics";
import { loadTeamMembers, type TeamMemberLite } from "@/lib/projetos";
import { supabase } from "@/integrations/supabase/client";
import { useConfirm } from "@/hooks/use-confirm";
import { ComercialHeader } from "./comercial/ComercialHeader";
import {
  LeadFiltersBar,
  useLeadFilters,
  applyLeadFilters,
  sortLeads,
  DEFAULT_LEAD_FILTERS,
  type LeadFiltersState,
} from "./comercial/LeadFiltersBar";
import { PipelineBoard } from "./comercial/PipelineBoard";
import { LeadDrawer, type OpportunityActionInput } from "./comercial/LeadDrawer";
import { ComercialOverviewView } from "./comercial/ComercialOverviewView";

/**
 * Central de vendas (Comercial) — shell: dados (React Query + realtime
 * Supabase, inalterados) + navegação entre as visões + o drawer da
 * oportunidade. Cada visão vive no seu próprio componente em
 * `src/components/comercial/`; este arquivo só orquestra.
 */

type ComercialView = "visao-geral" | "pipeline";

export function ComercialSection() {
  const [view, setView] = useState<ComercialView>("pipeline");
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
  /** Indicador/etapa clicado na Visão geral — troca pro Pipeline já com o
   * filtro correspondente aplicado (nunca um filtro "parecido": os dois
   * lugares leem os mesmos `applyLeadFilters`/`isOpportunityStale` etc,
   * então o número que a pessoa clicou é exatamente o que ela vê a seguir). */
  const goToPipelineWithFilter = (patch: Partial<LeadFiltersState>) => {
    setFilters({ ...DEFAULT_LEAD_FILTERS, ...patch });
    setView("pipeline");
  };
  const handleDeleteFromDrawer = async () => {
    if (!editing) return;
    const ok = await confirmDelete("Excluir esta oportunidade?");
    if (!ok) return;
    deleteMutation.mutate(editing.id);
    closeDrawer();
  };

  return (
    <section className="mx-auto w-full max-w-[1600px] space-y-4">
      <ComercialHeader
        query={query}
        onQueryChange={setQuery}
        period={period}
        onPeriodChange={setPeriod}
        onNewLead={() => openNewLead()}
      />

      <Tabs value={view} onValueChange={(v) => setView(v as ComercialView)}>
        <TabsList>
          <TabsTrigger value="visao-geral">Visão geral</TabsTrigger>
          <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
        </TabsList>
      </Tabs>

      {isError ? (
        <div className="rounded-2xl border border-dashed border-border bg-background p-10 text-center">
          <p className="text-sm text-muted-foreground">
            Não foi possível carregar as oportunidades.
          </p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="mt-3 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
          >
            Tentar novamente
          </button>
        </div>
      ) : view === "pipeline" ? (
        <div className="space-y-3">
          <LeadFiltersBar filters={filters} onChange={setFilters} team={team} />
          {isLoading ? (
            <div className="flex gap-3 overflow-x-auto pb-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="h-64 w-[300px] shrink-0 animate-pulse rounded-xl border border-border bg-muted/30"
                />
              ))}
            </div>
          ) : boardLeads.length === 0 && leads.length > 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-background p-10 text-center">
              <p className="text-sm text-muted-foreground">
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
      ) : (
        <ComercialOverviewView
          leads={searched}
          range={range}
          onOpenLead={openLead}
          onFilterPipeline={goToPipelineWithFilter}
        />
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
    </section>
  );
}
