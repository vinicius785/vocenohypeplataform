import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  formatBRL,
  loadStages,
  type Lead,
  type Stage,
  type StageKey,
  type PropostaSnapshot,
} from "@/lib/comercial";
import { SimuladorPropostaDialog } from "@/components/comercial/SimuladorPropostaDialog";
import {
  listLeads,
  upsertLead as upsertLeadFn,
  updateLeadStage,
  deleteLead as deleteLeadFn,
  runOpportunityAction,
} from "@/lib/comercial.functions";
import {
  deriveOpportunityNextStep,
  daysSinceLastStageChange,
  legacyStage,
  OPPORTUNITY_STAGES,
  OPPORTUNITY_STAGE_LABEL,
  OPPORTUNITY_STAGE_TONE,
  OPPORTUNITY_ACTOR_LABEL,
  type OpportunityActionKind,
  type OpportunityStage,
} from "@/lib/comercial-engine";
import {
  loadTeamMembers,
  type TeamMemberLite,
  DEFAULT_FEATURES,
  upsertProjeto,
} from "@/lib/projetos";
import { clientesStore } from "@/lib/clientes-store";
import { supabase } from "@/integrations/supabase/client";
import { useConfirm } from "@/hooks/use-confirm";
import {
  Plus,
  Search,
  X,
  Trash2,
  Pencil,
  Building2,
  User,
  Mail,
  Phone,
  DollarSign,
  Tag,
  UserCircle2,
  FileText,
  Star,
  Briefcase,
  CheckCircle2,
  Clock,
  History,
  Calculator,
  MoreHorizontal,
  ArrowRight,
  Loader2,
} from "lucide-react";
import { linkifyText } from "@/lib/linkify";

const STALE_DAYS = 5;
function daysSince(ms: number): number {
  return Math.floor((Date.now() - ms) / 86_400_000);
}
function isStale(lead: Lead): boolean {
  const stage = legacyStage(lead.stage);
  return stage !== "GANHO" && stage !== "PERDIDO" && daysSince(lead.updatedAt) >= STALE_DAYS;
}

function convertLeadToClienteEProjeto(lead: Lead): { clienteId: string; projectId: string } {
  const clienteId = crypto.randomUUID();
  const projectId = crypto.randomUUID();
  clientesStore.set((prev) => [
    ...prev,
    {
      id: clienteId,
      empresa: lead.company || lead.name,
      responsavel: lead.contact || "",
      responsavelInterno: lead.responsible || "",
      email: lead.email || "",
      whatsapp: lead.phone || "",
      clienteDesde: new Date().toISOString().slice(0, 10),
      campanhas: [],
      orcamentoSugerido: lead.proposta?.precoFinal ?? (lead.value > 0 ? lead.value : undefined),
    },
  ]);
  upsertProjeto({
    id: projectId,
    name: lead.company || lead.name,
    description: lead.notes || "",
    features: DEFAULT_FEATURES,
    createdAt: Date.now(),
    milestones: [],
    tasks: [],
    docs: [],
  });
  return { clienteId, projectId };
}

const inputCls =
  "h-9 w-full rounded-md border border-border bg-background px-2.5 text-sm outline-none focus:ring-2 focus:ring-ring";
const labelCls = "block space-y-1 text-xs font-medium text-muted-foreground";

const SOURCES = ["Indicação", "Instagram", "Google", "LinkedIn", "Site", "Evento", "Outro"];

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

export function ComercialSection() {
  const [stages] = useState<Stage[]>(() => loadStages());
  const [team, setTeam] = useState<TeamMemberLite[]>(() => loadTeamMembers());
  const [query, setQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Lead | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  const queryClient = useQueryClient();
  const listLeadsFn = useServerFn(listLeads);
  const upsertFn = useServerFn(upsertLeadFn);
  const stageFn = useServerFn(updateLeadStage);
  const deleteFn = useServerFn(deleteLeadFn);
  const runActionFn = useServerFn(runOpportunityAction);

  const { data: leads = [] } = useQuery({
    queryKey: ["leads"],
    queryFn: () => listLeadsFn(),
    refetchInterval: 15000,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["leads"] });

  // Além do polling de 15s, escuta mudanças em tempo real na tabela `leads`
  // (ex.: um lead novo chegando pelo webhook do Make) para atualizar o board
  // na hora, sem precisar esperar o próximo tick nem dar refresh na página.
  useEffect(() => {
    const channel = supabase
      .channel(`rt-leads-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, () => invalidate())
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  const upsertMutation = useMutation({
    mutationFn: (lead: Lead) => {
      const existing = (queryClient.getQueryData<Lead[]>(["leads"]) ?? []).some(
        (l) => l.id === lead.id,
      );
      const payload = existing ? lead : { ...lead, id: undefined };
      const stageLabel = stages.find((s) => s.key === lead.stage)?.label;
      return upsertFn({ data: { ...payload, stageLabel } as never });
    },
    onSuccess: invalidate,
  });
  const stageMutation = useMutation({
    mutationFn: (v: { id: string; stage: string }) =>
      stageFn({ data: { ...v, stageLabel: stages.find((s) => s.key === v.stage)?.label } }),
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

  // AÇÃO → SISTEMA ATUALIZA O ESTADO — único caminho de escrita orientada
  // por ação (registrar contato, agendar reunião, enviar proposta, marcar
  // ganho/perdido, alterar etapa manualmente...). Nunca monta o patch na
  // mão aqui: o servidor sempre passa pelo `comercial-engine.ts`.
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

  useEffect(() => {
    const onStorage = () => setTeam(loadTeamMembers());
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return leads;
    return leads.filter(
      (l) =>
        l.name.toLowerCase().includes(q) ||
        (l.company ?? "").toLowerCase().includes(q) ||
        (l.contact ?? "").toLowerCase().includes(q),
    );
  }, [leads, query]);

  const byStage = useMemo(() => {
    const map: Record<StageKey, Lead[]> = {};
    stages.forEach((s) => (map[s.key] = []));
    filtered.forEach((l) => {
      // Bucket pela etapa NORMALIZADA (via legacyStage), nunca pela string
      // crua — um lead com um dos 6 valores antigos ("lead", "proposta"...)
      // não bate com nenhuma coluna do novo pipeline por igualdade direta,
      // e sumiria silenciosamente do board sem isso.
      const key = legacyStage(l.stage);
      if (!map[key]) map[key] = [];
      map[key].push(l);
    });
    return map;
  }, [filtered, stages]);

  const totals = useMemo(() => {
    const total = leads.reduce((sum, l) => sum + (l.value || 0), 0);
    const ganho = leads
      .filter((l) => legacyStage(l.stage) === "GANHO")
      .reduce((s, l) => s + (l.value || 0), 0);
    const abertos = leads.filter((l) => {
      const s = legacyStage(l.stage);
      return s !== "GANHO" && s !== "PERDIDO";
    }).length;
    const parados = leads.filter(isStale).length;
    const pendenciasHype = leads.filter(
      (l) => deriveOpportunityNextStep(l).actor === "HYPE",
    ).length;
    const aguardandoCliente = leads.filter(
      (l) => deriveOpportunityNextStep(l).actor === "CLIENTE",
    ).length;
    return {
      total,
      ganho,
      abertos,
      count: leads.length,
      parados,
      pendenciasHype,
      aguardandoCliente,
    };
  }, [leads]);

  const upsertLead = (lead: Lead) => {
    upsertMutation.mutate(lead);
  };

  const { confirm: confirmDelete, confirmDialog } = useConfirm();

  const deleteLead = async (id: string) => {
    const ok = await confirmDelete("Excluir este lead?");
    if (!ok) return;
    deleteMutation.mutate(id);
  };

  const moveTo = (id: string, stage: StageKey) => {
    stageMutation.mutate({ id, stage });
  };

  return (
    <section className="mx-auto w-full max-w-6xl space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Comercial</h2>
          <p className="text-sm text-muted-foreground">
            Pipeline de vendas — arraste os cards entre as colunas para mover.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar lead..."
              className={`${inputCls} w-56 pl-8`}
            />
          </div>
          <button
            onClick={() => {
              setEditing(null);
              setShowForm(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90"
          >
            <Plus className="h-3.5 w-3.5" /> Novo lead
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="flex gap-x-6 overflow-x-auto whitespace-nowrap pb-1">
        <Kpi label="Leads" value={String(totals.count)} />
        <Kpi label="Em aberto" value={String(totals.abertos)} />
        <Kpi label="Ganhos" value={formatBRL(totals.ganho)} />
        <Kpi label="Pipeline total" value={formatBRL(totals.total)} />
        <Kpi label={`Parados (${STALE_DAYS}+ dias)`} value={String(totals.parados)} />
        <Kpi label="Minhas pendências" value={String(totals.pendenciasHype)} />
        <Kpi label="Aguardando cliente" value={String(totals.aguardandoCliente)} />
      </div>

      {/* Board */}
      <div className="overflow-x-auto">
        <div className="flex min-w-max gap-3 pb-2">
          {stages.map((s) => {
            const items = byStage[s.key] ?? [];
            const sum = items.reduce((acc, l) => acc + (l.value || 0), 0);
            return (
              <div
                key={s.key}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (dragId) moveTo(dragId, s.key);
                  setDragId(null);
                }}
                className="flex w-72 shrink-0 flex-col rounded-lg border border-border bg-card"
              >
                <div className={`h-1 rounded-t-lg ${s.color}`} />
                <div className="flex items-center justify-between px-3 py-2">
                  <div>
                    <div className="text-sm font-medium">{s.label}</div>
                    <div className="text-xs text-muted-foreground">
                      {items.length} • {formatBRL(sum)}
                    </div>
                  </div>
                </div>
                <div className="flex-1 space-y-2 px-2 pb-2">
                  {items.length === 0 ? (
                    <div className="rounded-md border border-dashed border-border py-6 text-center text-xs text-muted-foreground">
                      Sem leads
                    </div>
                  ) : (
                    items.map((l) => (
                      <LeadCard
                        key={l.id}
                        lead={l}
                        onDragStart={() => setDragId(l.id)}
                        onEdit={() => {
                          setEditing(l);
                          setShowForm(true);
                        }}
                        onDelete={() => deleteLead(l.id)}
                      />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {showForm && (
        <LeadForm
          initial={editing}
          stages={stages}
          team={team}
          onClose={() => {
            setShowForm(false);
            setEditing(null);
          }}
          onSave={(lead) => {
            upsertLead(lead);
            setShowForm(false);
            setEditing(null);
          }}
          onRunAction={(input) => actionMutation.mutateAsync(input)}
        />
      )}
      {confirmDialog}
    </section>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex shrink-0 items-baseline gap-2 border-l border-border pl-6 first:border-l-0 first:pl-0">
      <span className="text-xl font-semibold tabular-nums text-foreground">{value}</span>
      <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
    </div>
  );
}

function LeadCard({
  lead,
  onEdit,
  onDelete,
  onDragStart,
}: {
  lead: Lead;
  onEdit: () => void;
  onDelete: () => void;
  onDragStart: () => void;
}) {
  const meta = [lead.role, lead.vertical].filter(Boolean).join(" · ");
  const step = deriveOpportunityNextStep(lead);

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onClick={onEdit}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onEdit();
        }
      }}
      className={`group cursor-pointer rounded-lg border bg-background p-3 shadow-sm transition-colors hover:border-foreground/30 active:cursor-grabbing ${
        isStale(lead) ? "border-amber-500/50" : "border-border"
      }`}
    >
      {/* Header: nome + ações */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-foreground">{lead.name}</div>
          {lead.company && (
            <div className="truncate text-xs text-muted-foreground">{lead.company}</div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
          <button
            onClick={onEdit}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            title="Editar"
            type="button"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-rose-500"
            title="Excluir"
            type="button"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Cargo/setor — uma linha só, sem repetir o valor (já aparece embaixo) */}
      {meta && (
        <div className="mt-1.5 flex items-center gap-1 truncate text-[11px] text-muted-foreground">
          <Briefcase className="h-3 w-3 shrink-0" />
          <span className="truncate">{meta}</span>
        </div>
      )}

      {/* Avisos: urgência e parado há X dias */}
      {(lead.urgency || isStale(lead)) && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {lead.urgency && (
            <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400">
              Urgência: {lead.urgency}
            </span>
          )}
          {isStale(lead) && (
            <span className="inline-flex items-center gap-1 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400">
              <Clock className="h-3 w-3" /> Parado há {daysSince(lead.updatedAt)}d
            </span>
          )}
        </div>
      )}

      {/* Próxima ação — o que precisa acontecer agora, separado do valor/responsável da oportunidade */}
      {step.actionLabel && (
        <div className="mt-1.5 flex items-center gap-1 truncate text-[11px] font-medium text-foreground">
          <span
            className={`h-1.5 w-1.5 shrink-0 rounded-full ${step.actor === "CLIENTE" ? "bg-sky-500" : "bg-amber-500"}`}
          />
          <span className="truncate">{step.actionLabel}</span>
        </div>
      )}
      {!step.actionLabel && step.actor === "CLIENTE" && (
        <div className="mt-1.5 flex items-center gap-1 truncate text-[11px] text-sky-600 dark:text-sky-400">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-sky-500" />
          Aguardando cliente
        </div>
      )}

      {/* Rodapé: valor + responsável */}
      <div className="mt-2 flex items-center justify-between gap-2 border-t border-border/60 pt-2">
        <span className="text-sm font-semibold text-foreground">{formatBRL(lead.value || 0)}</span>
        {lead.responsible && (
          <span className="truncate rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            {lead.responsible}
          </span>
        )}
      </div>
    </div>
  );
}

type OpportunityActionInput = {
  id: string;
  action: OpportunityActionKind;
  data?: string;
  proposta?: PropostaSnapshot;
  nota?: string;
  novoValor?: number;
  valorFinal?: number;
  motivo?: string;
  toStage?: OpportunityStage;
};

const PERDIDO_MOTIVOS = [
  "Sem orçamento",
  "Escolheu concorrente",
  "Sem resposta do cliente",
  "Fora do escopo/ICP",
  "Timing ruim",
];

function LeadForm({
  initial,
  stages,
  team,
  onClose,
  onSave,
  onRunAction,
}: {
  initial: Lead | null;
  stages: Stage[];
  team: TeamMemberLite[];
  onClose: () => void;
  onSave: (l: Lead) => void;
  onRunAction: (input: OpportunityActionInput) => Promise<Lead>;
}) {
  // `liveLead` acompanha o resultado de cada ação do motor (etapa, histórico,
  // valor) sem fechar o drawer — os campos do formulário abaixo continuam
  // como estado local separado, só sincronizado na abertura/criação.
  const [liveLead, setLiveLead] = useState<Lead | null>(initial);
  const [name, setName] = useState(initial?.name ?? "");
  const [company, setCompany] = useState(initial?.company ?? "");
  const [contact, setContact] = useState(initial?.contact ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [role, setRole] = useState(initial?.role ?? "");
  const [vertical, setVertical] = useState(initial?.vertical ?? "");
  const [budget, setBudget] = useState<string>(initial?.budget ? String(initial.budget) : "");
  const [urgency, setUrgency] = useState<string>(initial?.urgency ?? "");
  const [experience, setExperience] = useState(initial?.experience ?? "");
  const [value, setValue] = useState<string>(initial ? String(initial.value ?? "") : "");
  const [proposta, setProposta] = useState<PropostaSnapshot | undefined>(initial?.proposta);
  const [showSimulador, setShowSimulador] = useState(false);
  const [stage, setStage] = useState<OpportunityStage>(legacyStage(initial?.stage));
  const [source, setSource] = useState(initial?.source ?? "");
  const [responsible, setResponsible] = useState(initial?.responsible ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [score, setScore] = useState<number>(initial?.score ?? 0);
  const [error, setError] = useState("");
  const [showEtapaMenu, setShowEtapaMenu] = useState(false);
  const [runningAction, setRunningAction] = useState<OpportunityActionKind | null>(null);
  const [showAgendar, setShowAgendar] = useState(false);
  const [dataReuniao, setDataReuniao] = useState("");
  const [showNegociacao, setShowNegociacao] = useState(false);
  const [notaNegociacao, setNotaNegociacao] = useState("");
  const [novoValorNegociacao, setNovoValorNegociacao] = useState("");
  const [showGanho, setShowGanho] = useState(false);
  const [valorGanho, setValorGanho] = useState(String(liveLead?.value ?? value ?? ""));
  const [showPerdido, setShowPerdido] = useState(false);
  const [motivoPerdido, setMotivoPerdido] = useState("");

  const parsedValue = Number(value.replace(/[^\d.,]/g, "").replace(",", ".")) || 0;
  const stageMeta = stages.find((s) => s.key === stage);
  const nextStep = liveLead ? deriveOpportunityNextStep(liveLead) : null;

  const runAction = async (
    action: OpportunityActionKind,
    opts: Partial<OpportunityActionInput> = {},
  ) => {
    if (!liveLead) return;
    setRunningAction(action);
    setError("");
    try {
      const updated = await onRunAction({ id: liveLead.id, action, ...opts });
      setLiveLead(updated);
      setStage(legacyStage(updated.stage));
      setValue(String(updated.value ?? ""));
      if (updated.proposta) setProposta(updated.proposta);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível executar a ação.");
    } finally {
      setRunningAction(null);
    }
  };

  const submit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const n = name.trim();
    if (!n) {
      setError("Informe o nome da oportunidade.");
      return;
    }
    const now = Date.now();
    const lead: Lead = {
      id: initial?.id ?? uid(),
      name: n,
      company: company.trim() || undefined,
      contact: contact.trim() || undefined,
      email: email.trim() || undefined,
      phone: phone.trim() || undefined,
      role: role.trim() || undefined,
      vertical: vertical.trim() || undefined,
      budget: budget.trim() ? Number(budget.replace(/[^\d.,]/g, "").replace(",", ".")) : undefined,
      urgency: (urgency.trim() || undefined) as Lead["urgency"],
      experience: experience.trim() || undefined,
      value: parsedValue,
      proposta,
      stage,
      tags: initial?.tags ?? [],
      source: source || undefined,
      responsible: responsible || undefined,
      notes: notes.trim() || undefined,
      score,
      activities: initial?.activities ?? [],
      createdAt: initial?.createdAt ?? now,
      updatedAt: now,
      clienteId: initial?.clienteId,
      projectId: initial?.projectId,
    };
    onSave(lead);
  };

  const handleConvert = () => {
    if (!liveLead || liveLead.clienteId) return;
    const { clienteId, projectId } = convertLeadToClienteEProjeto(liveLead);
    onSave({ ...liveLead, clienteId, projectId });
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-4xl flex-col bg-background shadow-2xl md:border-l md:border-border"
      >
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3.5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-foreground text-background">
              <Briefcase className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <h3 className="truncate text-base font-semibold">
                {initial ? "Editar oportunidade" : "Nova oportunidade"}
              </h3>
              <p className="text-xs text-muted-foreground">
                Preencha as informações — o resumo é atualizado em tempo real.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-muted"
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {liveLead && nextStep && (
          <div className="relative border-b border-border bg-muted/30 px-5 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${OPPORTUNITY_STAGE_TONE[nextStep.stage]}`}
                >
                  {nextStep.stageLabel}
                </span>
                {nextStep.actionLabel ? (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <ArrowRight className="h-3 w-3" />
                    Próxima ação:{" "}
                    <span className="font-medium text-foreground">{nextStep.actionLabel}</span>
                    {nextStep.actor && (
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium">
                        {OPPORTUNITY_ACTOR_LABEL[nextStep.actor]}
                      </span>
                    )}
                  </span>
                ) : nextStep.actor === "CLIENTE" ? (
                  <span className="text-xs text-sky-600 dark:text-sky-400">
                    Aguardando resposta do cliente
                  </span>
                ) : null}
              </div>

              <div className="flex items-center gap-2">
                {nextStep.action === "registrar_contato" && (
                  <ActionButton
                    label="Registrar contato"
                    busy={runningAction === "registrar_contato"}
                    onClick={() => runAction("registrar_contato")}
                  />
                )}
                {nextStep.action === "agendar_reuniao" && (
                  <ActionButton
                    label="Agendar reunião"
                    busy={runningAction === "agendar_reuniao"}
                    onClick={() => setShowAgendar(true)}
                  />
                )}
                {nextStep.action === "registrar_reuniao" && (
                  <ActionButton
                    label="Registrar reunião realizada"
                    busy={runningAction === "registrar_reuniao"}
                    onClick={() => runAction("registrar_reuniao")}
                  />
                )}
                {nextStep.action === "criar_proposta" && (
                  <ActionButton
                    label="Criar proposta"
                    icon={<Calculator className="h-3.5 w-3.5" />}
                    busy={runningAction === "criar_proposta"}
                    onClick={() => setShowSimulador(true)}
                  />
                )}
                {nextStep.action === "enviar_proposta" && (
                  <ActionButton
                    label="Enviar proposta"
                    busy={runningAction === "enviar_proposta"}
                    onClick={() => runAction("enviar_proposta")}
                  />
                )}
                {nextStep.action === "registrar_negociacao" && (
                  <ActionButton
                    label="Registrar atualização"
                    busy={runningAction === "registrar_negociacao"}
                    onClick={() => {
                      setNovoValorNegociacao(String(liveLead.value ?? ""));
                      setShowNegociacao(true);
                    }}
                  />
                )}
                {nextStep.stage === "PROPOSTA_ENVIADA" && (
                  <button
                    type="button"
                    onClick={() => runAction("revisar_proposta")}
                    className="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-muted"
                  >
                    Revisar proposta
                  </button>
                )}
                {nextStep.stage !== "GANHO" && nextStep.stage !== "PERDIDO" && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setValorGanho(String(proposta?.precoFinal ?? liveLead.value ?? ""));
                        setShowGanho(true);
                      }}
                      className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1.5 text-xs font-medium text-emerald-600 hover:bg-emerald-500/20"
                    >
                      Marcar ganho
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowPerdido(true)}
                      className="rounded-md border border-rose-500/40 bg-rose-500/10 px-2.5 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-500/20"
                    >
                      Marcar perdido
                    </button>
                  </>
                )}

                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowEtapaMenu((v) => !v)}
                    className="rounded-md border border-border p-1.5 text-muted-foreground hover:bg-muted"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                  {showEtapaMenu && (
                    <div className="absolute right-0 top-full z-10 mt-1 w-64 rounded-md border border-border bg-background p-2 shadow-lg">
                      <p className="mb-1.5 px-1 text-[11px] font-medium text-muted-foreground">
                        Alterar etapa manualmente
                      </p>
                      <select
                        value={nextStep.stage}
                        onChange={(e) => {
                          setShowEtapaMenu(false);
                          void runAction("alterar_etapa_manual", {
                            toStage: e.target.value as OpportunityStage,
                          });
                        }}
                        className={inputCls}
                      >
                        {OPPORTUNITY_STAGES.map((s) => (
                          <option key={s} value={s}>
                            {OPPORTUNITY_STAGE_LABEL[s]}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col md:flex-row">
          <div className="flex-1 overflow-y-auto bg-muted/20 p-5">
            <Section title="Oportunidade" icon={<Tag className="h-4 w-4" />}>
              <label className={labelCls}>
                <span>Nome da oportunidade *</span>
                <input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={inputCls}
                  placeholder="Ex: Website institucional Acme"
                  maxLength={120}
                />
              </label>

              <div className="rounded-lg border border-primary/25 bg-primary/[0.04] p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-medium text-muted-foreground">Valor (R$)</span>
                  <button
                    type="button"
                    onClick={() => setShowSimulador(true)}
                    className="inline-flex items-center gap-1.5 rounded-full bg-foreground px-3 py-1.5 text-xs font-semibold text-background shadow-sm transition-transform hover:scale-[1.03] hover:opacity-90"
                  >
                    <Calculator className="h-3.5 w-3.5" />
                    Simular proposta
                  </button>
                </div>
                <input
                  inputMode="decimal"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  className="mt-2 h-11 w-full rounded-md border border-border bg-background px-3 text-lg font-semibold outline-none focus:ring-2 focus:ring-ring"
                  placeholder="0"
                />
                {proposta && (
                  <p className="mt-1.5 text-[11px] text-muted-foreground">
                    Calculado no simulador: custo {formatBRL(proposta.custoTotal)} → preço{" "}
                    <span className="font-medium text-foreground">
                      {formatBRL(proposta.precoFinal)}
                    </span>
                    {proposta.ajustadoManualmente && proposta.precoCalculado !== undefined && (
                      <span className="text-amber-600">
                        {" "}
                        (ajustado manualmente — calculado era {formatBRL(proposta.precoCalculado)})
                      </span>
                    )}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {!liveLead && (
                  <label className={labelCls}>
                    <span>Etapa inicial</span>
                    <select
                      value={stage}
                      onChange={(e) => setStage(e.target.value as OpportunityStage)}
                      className={inputCls}
                    >
                      {stages.map((s) => (
                        <option key={s.key} value={s.key}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <div className={labelCls}>
                  <span>Qualificação</span>
                  <div className="flex h-9 items-center gap-1">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setScore(score === n ? 0 : n)}
                        className="rounded p-0.5 hover:bg-muted"
                      >
                        <Star
                          className={`h-5 w-5 ${
                            n <= score ? "fill-amber-400 text-amber-400" : "text-muted-foreground"
                          }`}
                        />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </Section>

            <Section title="Contato" icon={<User className="h-4 w-4" />}>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className={labelCls}>
                  <span>Nome</span>
                  <input
                    value={contact}
                    onChange={(e) => setContact(e.target.value)}
                    className={inputCls}
                    maxLength={120}
                  />
                </label>
                <label className={labelCls}>
                  <span>Cargo</span>
                  <input
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    className={inputCls}
                    maxLength={120}
                  />
                </label>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className={labelCls}>
                  <span>E-mail</span>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={inputCls}
                    maxLength={255}
                  />
                </label>
                <label className={labelCls}>
                  <span>Telefone</span>
                  <input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className={inputCls}
                    maxLength={40}
                  />
                </label>
              </div>
            </Section>

            <Section title="Empresa" icon={<Building2 className="h-4 w-4" />}>
              <label className={labelCls}>
                <span>Nome da empresa</span>
                <input
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  className={inputCls}
                  maxLength={120}
                />
              </label>
            </Section>

            <Section title="Qualificação" icon={<Star className="h-4 w-4" />}>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className={labelCls}>
                  <span>Setor</span>
                  <input
                    value={vertical}
                    onChange={(e) => setVertical(e.target.value)}
                    className={inputCls}
                    maxLength={120}
                  />
                </label>
                <label className={labelCls}>
                  <span>Orçamento mensal</span>
                  <input
                    value={budget}
                    onChange={(e) => setBudget(e.target.value)}
                    className={inputCls}
                    placeholder="R$"
                  />
                </label>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className={labelCls}>
                  <span>Urgência</span>
                  <input
                    value={urgency}
                    onChange={(e) => setUrgency(e.target.value)}
                    className={inputCls}
                    maxLength={60}
                  />
                </label>
              </div>
              <label className={labelCls}>
                <span>Experiência com agência</span>
                <textarea
                  value={experience}
                  onChange={(e) => setExperience(e.target.value)}
                  className={`${inputCls} h-16 resize-none py-2`}
                  maxLength={500}
                />
              </label>
            </Section>

            <Section title="Detalhes" icon={<FileText className="h-4 w-4" />}>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className={labelCls}>
                  <span>Origem</span>
                  <select
                    value={source}
                    onChange={(e) => setSource(e.target.value)}
                    className={inputCls}
                  >
                    <option value="">Selecione...</option>
                    {SOURCES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={labelCls}>
                  <span>Responsável</span>
                  <select
                    value={responsible}
                    onChange={(e) => setResponsible(e.target.value)}
                    className={inputCls}
                  >
                    <option value="">Selecione...</option>
                    {team.map((m) => (
                      <option key={m.id} value={m.name}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className={labelCls}>
                <span>Observações</span>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className={`${inputCls} h-24 resize-none py-2`}
                  maxLength={1000}
                />
              </label>
            </Section>

            {error && (
              <div className="mt-3 rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-600">
                {error}
              </div>
            )}
          </div>

          <aside className="w-full shrink-0 overflow-y-auto border-t border-border bg-muted/30 p-5 md:w-80 md:border-l md:border-t-0">
            <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Resumo ao vivo
            </div>
            <div className="overflow-hidden rounded-lg border border-border bg-background shadow-sm">
              <div className={`h-1 ${stageMeta?.color ?? "bg-muted"}`} />
              <div className="space-y-2 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">
                      {name.trim() || "Nova oportunidade"}
                    </div>
                    {company && (
                      <div className="truncate text-xs text-muted-foreground">{company}</div>
                    )}
                  </div>
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium">
                    {stageMeta?.label ?? "—"}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-sm">
                  <DollarSign className="h-3.5 w-3.5 text-emerald-500" />
                  <span className="font-semibold">{formatBRL(parsedValue)}</span>
                </div>
                {score > 0 && (
                  <div className="flex gap-0.5">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <Star
                        key={n}
                        className={`h-3 w-3 ${
                          n <= score ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40"
                        }`}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>

            <dl className="mt-4 space-y-2 text-xs">
              <SummaryRow
                icon={<User className="h-3.5 w-3.5" />}
                label="Contato"
                value={contact}
                extra={role}
              />
              <SummaryRow icon={<Mail className="h-3.5 w-3.5" />} label="E-mail" value={email} />
              <SummaryRow icon={<Phone className="h-3.5 w-3.5" />} label="Telefone" value={phone} />
              <SummaryRow
                icon={<Building2 className="h-3.5 w-3.5" />}
                label="Empresa"
                value={company}
              />
              <SummaryRow icon={<Tag className="h-3.5 w-3.5" />} label="Origem" value={source} />
              <SummaryRow
                icon={<UserCircle2 className="h-3.5 w-3.5" />}
                label="Responsável"
                value={responsible}
              />
              {nextStep?.actor && (
                <SummaryRow
                  icon={<ArrowRight className="h-3.5 w-3.5" />}
                  label="Próxima ação é de"
                  value={OPPORTUNITY_ACTOR_LABEL[nextStep.actor]}
                />
              )}
              {liveLead && (
                <SummaryRow
                  icon={<Clock className="h-3.5 w-3.5" />}
                  label="Parado há"
                  value={`${daysSinceLastStageChange(liveLead)} dia(s)`}
                />
              )}
            </dl>

            {notes.trim() && (
              <div className="mt-4 rounded-md border border-border bg-background p-2.5 text-xs">
                <div className="mb-1 flex items-center gap-1.5 font-medium">
                  <FileText className="h-3.5 w-3.5" /> Observações
                </div>
                <p className="line-clamp-6 whitespace-pre-wrap text-muted-foreground">{notes}</p>
              </div>
            )}

            {liveLead && (
              <div className="mt-4">
                <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <History className="h-3.5 w-3.5" /> Histórico
                </div>
                {(liveLead.history?.length ?? 0) === 0 ? (
                  <p className="text-[11px] text-muted-foreground">Sem eventos registrados.</p>
                ) : (
                  <ul className="space-y-2 border-l border-border pl-3">
                    {[...(liveLead.history ?? [])]
                      .sort((a, b) => b.createdAt - a.createdAt)
                      .map((h) => (
                        <li key={h.id} className="text-[11px] leading-relaxed">
                          <div className="min-w-0 break-words text-foreground [overflow-wrap:anywhere]">
                            {linkifyText(h.text)}
                          </div>
                          <div className="text-muted-foreground/70">
                            {new Date(h.createdAt).toLocaleString("pt-BR", {
                              day: "2-digit",
                              month: "2-digit",
                              year: "2-digit",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </div>
                        </li>
                      ))}
                  </ul>
                )}
              </div>
            )}
          </aside>
        </form>

        <div className="flex items-center justify-between gap-2 border-t border-border px-5 py-3">
          <div>
            {liveLead && legacyStage(liveLead.stage) === "GANHO" && (
              <>
                {liveLead.clienteId ? (
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Convertido em cliente/projeto
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={handleConvert}
                    className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-sm font-medium text-emerald-600 hover:bg-emerald-500/20"
                  >
                    <Briefcase className="h-3.5 w-3.5" /> Converter em cliente/projeto
                  </button>
                )}
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => submit()}
              className="rounded-md bg-foreground px-4 py-1.5 text-sm font-medium text-background hover:opacity-90"
            >
              {initial ? "Salvar alterações" : "Criar oportunidade"}
            </button>
          </div>
        </div>
      </div>

      <SimuladorPropostaDialog
        open={showSimulador}
        onClose={() => setShowSimulador(false)}
        onApply={(precoFinal, snapshot) => {
          setValue(String(Math.round(precoFinal)));
          setProposta(snapshot);
          // Aplicar o preço não avança a etapa por si só — só o gesto
          // explícito "criar proposta" (com oportunidade já existente) faz
          // o motor registrar a proposta e mover pra PROPOSTA_PREPARO.
          if (liveLead) void runAction("criar_proposta", { proposta: snapshot });
        }}
      />

      {showAgendar && (
        <MiniActionDialog
          title="Agendar reunião"
          busy={runningAction === "agendar_reuniao"}
          onClose={() => setShowAgendar(false)}
          onConfirm={async () => {
            await runAction("agendar_reuniao", { data: dataReuniao || undefined });
            setShowAgendar(false);
          }}
        >
          <label className={labelCls}>
            <span>Data da reunião</span>
            <input
              type="date"
              value={dataReuniao}
              onChange={(e) => setDataReuniao(e.target.value)}
              className={inputCls}
            />
          </label>
        </MiniActionDialog>
      )}

      {showNegociacao && (
        <MiniActionDialog
          title="Registrar atualização da negociação"
          busy={runningAction === "registrar_negociacao"}
          onClose={() => setShowNegociacao(false)}
          onConfirm={async () => {
            await runAction("registrar_negociacao", {
              nota: notaNegociacao.trim() || undefined,
              novoValor: novoValorNegociacao.trim() ? Number(novoValorNegociacao) : undefined,
            });
            setShowNegociacao(false);
            setNotaNegociacao("");
          }}
        >
          <label className={labelCls}>
            <span>Novo valor (opcional)</span>
            <input
              inputMode="decimal"
              value={novoValorNegociacao}
              onChange={(e) => setNovoValorNegociacao(e.target.value)}
              className={inputCls}
            />
          </label>
          <label className={labelCls}>
            <span>Nota</span>
            <textarea
              value={notaNegociacao}
              onChange={(e) => setNotaNegociacao(e.target.value)}
              className={`${inputCls} h-20 resize-none py-2`}
              placeholder="O que mudou na negociação?"
            />
          </label>
        </MiniActionDialog>
      )}

      {showGanho && (
        <MiniActionDialog
          title="Marcar oportunidade como ganha"
          confirmLabel="Confirmar ganho"
          busy={runningAction === "marcar_ganho"}
          onClose={() => setShowGanho(false)}
          onConfirm={async () => {
            await runAction("marcar_ganho", {
              valorFinal: valorGanho.trim() ? Number(valorGanho) : undefined,
            });
            setShowGanho(false);
          }}
        >
          <label className={labelCls}>
            <span>Valor final (R$)</span>
            <input
              inputMode="decimal"
              value={valorGanho}
              onChange={(e) => setValorGanho(e.target.value)}
              className={inputCls}
            />
          </label>
        </MiniActionDialog>
      )}

      {showPerdido && (
        <MiniActionDialog
          title="Marcar oportunidade como perdida"
          confirmLabel="Confirmar perda"
          busy={runningAction === "marcar_perdido"}
          onClose={() => setShowPerdido(false)}
          onConfirm={async () => {
            await runAction("marcar_perdido", { motivo: motivoPerdido.trim() || undefined });
            setShowPerdido(false);
            setMotivoPerdido("");
          }}
        >
          <label className={labelCls}>
            <span>Motivo</span>
            <input
              list="perdido-motivos"
              value={motivoPerdido}
              onChange={(e) => setMotivoPerdido(e.target.value)}
              className={inputCls}
              placeholder="Ex: Sem orçamento"
            />
            <datalist id="perdido-motivos">
              {PERDIDO_MOTIVOS.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </label>
        </MiniActionDialog>
      )}
    </div>
  );
}

function ActionButton({
  label,
  icon,
  busy,
  onClick,
}: {
  label: string;
  icon?: React.ReactNode;
  busy?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={busy}
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs font-semibold text-background shadow-sm transition-transform hover:scale-[1.02] hover:opacity-90 disabled:opacity-60"
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : icon}
      {label}
    </button>
  );
}

function MiniActionDialog({
  title,
  confirmLabel = "Confirmar",
  busy,
  children,
  onClose,
  onConfirm,
}: {
  title: string;
  confirmLabel?: string;
  busy?: boolean;
  children: React.ReactNode;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-lg border border-border bg-background p-4 shadow-2xl"
      >
        <h4 className="mb-3 text-sm font-semibold">{title}</h4>
        <div className="space-y-3">{children}</div>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs font-semibold text-background hover:opacity-90 disabled:opacity-60"
          >
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-4 space-y-3 rounded-xl border border-border bg-background p-4 shadow-sm">
      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-muted text-muted-foreground">
          {icon}
        </span>
        {title}
      </div>
      {children}
    </div>
  );
}

function SummaryRow({
  icon,
  label,
  value,
  extra,
}: {
  icon: React.ReactNode;
  label: string;
  value?: string;
  extra?: string;
}) {
  const has = !!value && value.trim().length > 0;
  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5 text-muted-foreground">{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className={`truncate text-xs ${has ? "" : "italic text-muted-foreground/60"}`}>
          {has ? value : "—"}
          {has && extra ? <span className="text-muted-foreground"> · {extra}</span> : null}
        </div>
      </div>
    </div>
  );
}

export default ComercialSection;
