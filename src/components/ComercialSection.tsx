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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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
  XCircle,
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
          onAutosave={(lead) => upsertMutation.mutateAsync(lead)}
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
  onAutosave,
}: {
  initial: Lead | null;
  stages: Stage[];
  team: TeamMemberLite[];
  onClose: () => void;
  onSave: (l: Lead) => void;
  onRunAction: (input: OpportunityActionInput) => Promise<Lead>;
  onAutosave: (l: Lead) => Promise<Lead>;
}) {
  // `liveLead` acompanha o resultado de cada ação do motor (etapa, histórico,
  // valor) e de cada autosave, sem fechar a ficha — os campos abaixo
  // continuam como estado local separado, só sincronizado na abertura.
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
  // Etapa só é editável diretamente aqui para uma oportunidade NOVA (ainda
  // sem `liveLead`) — depois de criada, a etapa muda só via ação do motor
  // ou via "Alterar etapa manualmente" no menu "⋯".
  const [stage, setStage] = useState<OpportunityStage>(legacyStage(initial?.stage));
  const [source, setSource] = useState(initial?.source ?? "");
  const [responsible, setResponsible] = useState(initial?.responsible ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [score, setScore] = useState<number>(initial?.score ?? 0);
  const [tab, setTab] = useState("visao-geral");
  const [error, setError] = useState("");
  const [autosaveStatus, setAutosaveStatus] = useState<"idle" | "saving" | "saved">("idle");
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
  const nextStep = liveLead ? deriveOpportunityNextStep(liveLead) : null;
  const currentStageLabel = liveLead
    ? nextStep!.stageLabel
    : (stages.find((s) => s.key === stage)?.label ?? stage);

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

  // Monta o `Lead` completo a partir do estado atual dos campos — usado
  // tanto pela criação (submit) quanto pelo autosave de campo. A etapa
  // nunca vem do `<select>` de criação depois que a oportunidade já existe:
  // vem sempre de `liveLead.stage`, porque só o motor (ação/alteração
  // manual) pode mudá-la nesse ponto.
  const buildLead = (): Lead => {
    const now = Date.now();
    return {
      id: liveLead?.id ?? uid(),
      name: name.trim(),
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
      stage: liveLead ? liveLead.stage : stage,
      tags: liveLead?.tags ?? [],
      source: source || undefined,
      responsible: responsible || undefined,
      notes: notes.trim() || undefined,
      score,
      activities: liveLead?.activities ?? [],
      history: liveLead?.history,
      createdAt: liveLead?.createdAt ?? now,
      updatedAt: now,
      clienteId: liveLead?.clienteId,
      projectId: liveLead?.projectId,
    };
  };

  // Autosave de campo — só depois que a oportunidade já existe (criação
  // continua sendo uma transação única e explícita, via botão). Chamado no
  // blur de inputs de texto e no change de selects/estrelas.
  const autosaveField = async () => {
    if (!liveLead) return;
    const n = name.trim();
    if (!n) return;
    setAutosaveStatus("saving");
    setError("");
    try {
      const saved = await onAutosave(buildLead());
      setLiveLead(saved);
      setAutosaveStatus("saved");
      setTimeout(() => setAutosaveStatus((s) => (s === "saved" ? "idle" : s)), 1600);
    } catch (e) {
      setAutosaveStatus("idle");
      setError(e instanceof Error ? e.message : "Não foi possível salvar essa alteração.");
    }
  };

  const submit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const n = name.trim();
    if (!n) {
      setError("Informe o nome da oportunidade.");
      return;
    }
    onSave(buildLead());
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
        {/* Cabeçalho — ficha da oportunidade, não "editar formulário": quem é,
            quanto vale, em que etapa está e o que precisa acontecer agora. */}
        <div className="border-b border-border">
          <div className="flex items-start justify-between gap-3 px-5 pt-4">
            <div className="min-w-0">
              <h3 className="truncate text-xl font-light tracking-tight text-foreground">
                {name.trim() || "Nova oportunidade"}
              </h3>
              <p className="truncate text-sm text-muted-foreground">
                {company.trim() ? `${company} · ` : ""}
                {formatBRL(parsedValue)}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {autosaveStatus !== "idle" && (
                <span className="text-[11px] text-muted-foreground">
                  {autosaveStatus === "saving" ? "Salvando…" : "Salvo"}
                </span>
              )}
              <button
                onClick={onClose}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                type="button"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-end justify-between gap-3 px-5 pb-4 pt-3">
            <div className="min-w-0">
              <span className="inline-flex items-center rounded-full border border-border bg-muted px-2.5 py-1 text-[11px] font-medium text-foreground">
                {currentStageLabel}
              </span>
              {liveLead && nextStep && (
                <div className="mt-2">
                  <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    Próxima ação
                  </div>
                  <div className="text-sm font-medium text-foreground">
                    {nextStep.actionLabel ??
                      (nextStep.actor === "CLIENTE" ? "Aguardar retorno do cliente" : "Nenhuma")}
                  </div>
                  {nextStep.actor && (
                    <span className="mt-1 inline-block rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                      {OPPORTUNITY_ACTOR_LABEL[nextStep.actor]}
                    </span>
                  )}
                </div>
              )}
            </div>

            {liveLead && nextStep && (
              <div className="flex shrink-0 items-center gap-2">
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

                {/* Ações secundárias — nunca disputam espaço com o botão
                    principal: etapa manual, ganho, perdido e revisar
                    proposta vivem só aqui, atrás do "⋯". */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowEtapaMenu((v) => !v)}
                    className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                  {showEtapaMenu && (
                    <div className="absolute right-0 top-full z-10 mt-1 w-64 space-y-1 rounded-xl border border-border bg-background p-2 shadow-lg">
                      {nextStep.stage === "PROPOSTA_ENVIADA" && (
                        <button
                          type="button"
                          onClick={() => {
                            setShowEtapaMenu(false);
                            void runAction("revisar_proposta");
                          }}
                          className="w-full rounded-md px-2 py-1.5 text-left text-xs font-medium text-foreground hover:bg-muted"
                        >
                          Revisar proposta
                        </button>
                      )}
                      {nextStep.stage !== "GANHO" && (
                        <button
                          type="button"
                          onClick={() => {
                            setShowEtapaMenu(false);
                            setValorGanho(String(proposta?.precoFinal ?? liveLead.value ?? ""));
                            setShowGanho(true);
                          }}
                          className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-xs font-medium text-foreground hover:bg-muted"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" /> Marcar como ganho
                        </button>
                      )}
                      {nextStep.stage !== "PERDIDO" && (
                        <button
                          type="button"
                          onClick={() => {
                            setShowEtapaMenu(false);
                            setShowPerdido(true);
                          }}
                          className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-xs font-medium text-foreground hover:bg-muted"
                        >
                          <XCircle className="h-3.5 w-3.5" /> Marcar como perdido
                        </button>
                      )}
                      <div className="border-t border-border pt-1">
                        <p className="mb-1 px-2 text-[11px] font-medium text-muted-foreground">
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
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
            <TabsList className="mx-5 mt-3 w-fit shrink-0">
              <TabsTrigger value="visao-geral">Visão geral</TabsTrigger>
              <TabsTrigger value="contato">Contato</TabsTrigger>
              <TabsTrigger value="qualificacao">Qualificação</TabsTrigger>
              <TabsTrigger value="proposta">Proposta</TabsTrigger>
              {liveLead && <TabsTrigger value="historico">Histórico</TabsTrigger>}
            </TabsList>

            <div className="min-h-0 flex-1 overflow-y-auto bg-muted/20 p-5">
              <TabsContent value="visao-geral" className="mt-0 space-y-4">
                <Section title="Oportunidade" icon={<Tag className="h-4 w-4" />}>
                  <label className={labelCls}>
                    <span>Nome da oportunidade *</span>
                    <input
                      autoFocus={!liveLead}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      onBlur={autosaveField}
                      className={inputCls}
                      placeholder="Ex: Website institucional Acme"
                      maxLength={120}
                    />
                  </label>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className={labelCls}>
                      <span>Empresa</span>
                      <input
                        value={company}
                        onChange={(e) => setCompany(e.target.value)}
                        onBlur={autosaveField}
                        className={inputCls}
                        maxLength={120}
                      />
                    </label>
                    <label className={labelCls}>
                      <span>Valor (R$)</span>
                      <input
                        inputMode="decimal"
                        value={value}
                        onChange={(e) => setValue(e.target.value)}
                        onBlur={autosaveField}
                        className={inputCls}
                        placeholder="0"
                      />
                    </label>
                  </div>
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
                </Section>

                <Section title="Detalhes" icon={<FileText className="h-4 w-4" />}>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className={labelCls}>
                      <span>Origem</span>
                      <select
                        value={source}
                        onChange={(e) => setSource(e.target.value)}
                        onBlur={autosaveField}
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
                      <span>Responsável pela oportunidade</span>
                      <select
                        value={responsible}
                        onChange={(e) => setResponsible(e.target.value)}
                        onBlur={autosaveField}
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
                      onBlur={autosaveField}
                      className={`${inputCls} h-24 resize-none py-2`}
                      maxLength={1000}
                    />
                  </label>
                </Section>
              </TabsContent>

              <TabsContent value="contato" className="mt-0 space-y-4">
                <Section title="Contato" icon={<User className="h-4 w-4" />}>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className={labelCls}>
                      <span>Nome</span>
                      <input
                        value={contact}
                        onChange={(e) => setContact(e.target.value)}
                        onBlur={autosaveField}
                        className={inputCls}
                        maxLength={120}
                      />
                    </label>
                    <label className={labelCls}>
                      <span>Cargo</span>
                      <input
                        value={role}
                        onChange={(e) => setRole(e.target.value)}
                        onBlur={autosaveField}
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
                        onBlur={autosaveField}
                        className={inputCls}
                        maxLength={255}
                      />
                    </label>
                    <label className={labelCls}>
                      <span>Telefone</span>
                      <input
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        onBlur={autosaveField}
                        className={inputCls}
                        maxLength={40}
                      />
                    </label>
                  </div>
                  {(phone.trim() || email.trim()) && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {phone.trim() && (
                        <a
                          href={`tel:${phone.replace(/\D/g, "")}`}
                          className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
                        >
                          <Phone className="h-3.5 w-3.5" /> Ligar
                        </a>
                      )}
                      {phone.trim() && (
                        <a
                          href={`https://wa.me/${phone.replace(/\D/g, "")}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
                        >
                          WhatsApp
                        </a>
                      )}
                      {email.trim() && (
                        <a
                          href={`mailto:${email}`}
                          className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
                        >
                          <Mail className="h-3.5 w-3.5" /> E-mail
                        </a>
                      )}
                    </div>
                  )}
                </Section>
              </TabsContent>

              <TabsContent value="qualificacao" className="mt-0 space-y-4">
                <Section title="Qualificação" icon={<Star className="h-4 w-4" />}>
                  <div className={labelCls}>
                    <span>Qualificação</span>
                    <div className="flex h-9 items-center gap-1">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => {
                            setScore(score === n ? 0 : n);
                            setTimeout(autosaveField, 0);
                          }}
                          className="rounded p-0.5 hover:bg-muted"
                        >
                          <Star
                            className={`h-5 w-5 ${
                              n <= score
                                ? "fill-foreground text-foreground"
                                : "text-muted-foreground"
                            }`}
                          />
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className={labelCls}>
                      <span>Setor</span>
                      <input
                        value={vertical}
                        onChange={(e) => setVertical(e.target.value)}
                        onBlur={autosaveField}
                        className={inputCls}
                        maxLength={120}
                      />
                    </label>
                    <label className={labelCls}>
                      <span>Orçamento mensal</span>
                      <input
                        value={budget}
                        onChange={(e) => setBudget(e.target.value)}
                        onBlur={autosaveField}
                        className={inputCls}
                        placeholder="R$"
                      />
                    </label>
                  </div>
                  <label className={labelCls}>
                    <span>Urgência</span>
                    <input
                      value={urgency}
                      onChange={(e) => setUrgency(e.target.value)}
                      onBlur={autosaveField}
                      className={inputCls}
                      maxLength={60}
                    />
                  </label>
                  <label className={labelCls}>
                    <span>Experiência com agência</span>
                    <textarea
                      value={experience}
                      onChange={(e) => setExperience(e.target.value)}
                      onBlur={autosaveField}
                      className={`${inputCls} h-16 resize-none py-2`}
                      maxLength={500}
                    />
                  </label>
                </Section>
              </TabsContent>

              <TabsContent value="proposta" className="mt-0 space-y-4">
                <Section title="Proposta" icon={<Calculator className="h-4 w-4" />}>
                  <button
                    type="button"
                    onClick={() => setShowSimulador(true)}
                    className="inline-flex items-center gap-1.5 rounded-full border-2 border-foreground bg-foreground px-3.5 py-1.5 text-xs font-medium text-background transition-colors duration-200 hover:bg-transparent hover:text-foreground"
                  >
                    <Calculator className="h-3.5 w-3.5" />
                    {proposta ? "Recalcular proposta" : "Simular proposta"}
                  </button>

                  {proposta ? (
                    <div className="space-y-2 rounded-2xl border border-border bg-muted/40 p-3 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">
                          Custo dos influenciadores
                        </span>
                        <span className="font-medium text-foreground">
                          {formatBRL(proposta.custoTotal)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Preço calculado</span>
                        <span className="font-medium text-foreground">
                          {formatBRL(proposta.precoCalculado ?? proposta.precoFinal)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between border-t border-border pt-2">
                        <span className="text-xs text-muted-foreground">Preço comercial</span>
                        <span className="text-lg font-semibold text-foreground">
                          {formatBRL(proposta.precoFinal)}
                        </span>
                      </div>
                      {proposta.ajustadoManualmente && (
                        <p className="text-[11px] italic text-muted-foreground">
                          Ajustado manualmente
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Nenhuma proposta calculada ainda para esta oportunidade.
                    </p>
                  )}

                  {liveLead && nextStep?.action === "enviar_proposta" && (
                    <ActionButton
                      label="Enviar proposta"
                      busy={runningAction === "enviar_proposta"}
                      onClick={() => runAction("enviar_proposta")}
                    />
                  )}
                </Section>
              </TabsContent>

              {liveLead && (
                <TabsContent value="historico" className="mt-0 space-y-4">
                  <Section title="Histórico" icon={<History className="h-4 w-4" />}>
                    {(liveLead.history?.length ?? 0) === 0 ? (
                      <p className="text-xs text-muted-foreground">Sem eventos registrados.</p>
                    ) : (
                      <ul className="space-y-3 border-l border-border pl-3">
                        {[...(liveLead.history ?? [])]
                          .sort((a, b) => b.createdAt - a.createdAt)
                          .map((h) => (
                            <li key={h.id} className="text-xs leading-relaxed">
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
                  </Section>
                </TabsContent>
              )}

              {error && (
                <div className="mt-3 flex items-center gap-2 rounded-xl border border-border bg-muted px-3 py-2 text-xs text-foreground">
                  <XCircle className="h-3.5 w-3.5 shrink-0" />
                  {error}
                </div>
              )}
            </div>
          </Tabs>

          {/* Resumo — painel de contexto compacto, não um segundo formulário:
              só o que ajuda a decidir a próxima ação, sem repetir os campos
              que já estão nas abas ao lado. */}
          <aside className="w-full shrink-0 overflow-y-auto border-t border-border bg-muted/30 p-4 md:w-64 md:border-l md:border-t-0">
            <div className="mb-3 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Resumo
            </div>
            <dl className="space-y-3 text-xs">
              <div>
                <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">Valor</dt>
                <dd className="text-base font-semibold text-foreground">
                  {formatBRL(parsedValue)}
                </dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Status
                </dt>
                <dd className="mt-0.5">
                  <span className="inline-flex items-center rounded-full border border-border bg-background px-2 py-0.5 text-[10px] font-medium text-foreground">
                    {currentStageLabel}
                  </span>
                </dd>
              </div>
              {liveLead && nextStep && (
                <div>
                  <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Próxima ação
                  </dt>
                  <dd className="font-medium text-foreground">
                    {nextStep.actionLabel ??
                      (nextStep.actor === "CLIENTE" ? "Aguardar retorno do cliente" : "Nenhuma")}
                  </dd>
                </div>
              )}
              <SummaryRow
                icon={<UserCircle2 className="h-3.5 w-3.5" />}
                label="Responsável"
                value={responsible}
              />
              {liveLead && (
                <SummaryRow
                  icon={<Clock className="h-3.5 w-3.5" />}
                  label="Parado há"
                  value={`${daysSinceLastStageChange(liveLead)} dia(s)`}
                />
              )}
            </dl>

            {liveLead && (liveLead.history?.length ?? 0) > 0 && (
              <div className="mt-4">
                <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Histórico recente
                </div>
                <ul className="space-y-1.5">
                  {[...(liveLead.history ?? [])]
                    .sort((a, b) => b.createdAt - a.createdAt)
                    .slice(0, 3)
                    .map((h) => (
                      <li
                        key={h.id}
                        className="truncate text-[11px] text-muted-foreground"
                        title={h.text}
                      >
                        • {h.text}
                      </li>
                    ))}
                </ul>
              </div>
            )}
          </aside>
        </div>

        {liveLead && legacyStage(liveLead.stage) === "GANHO" && (
          <div className="border-t border-border px-5 py-3">
            {liveLead.clienteId ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground">
                <CheckCircle2 className="h-3.5 w-3.5" /> Convertido em cliente/projeto
              </span>
            ) : (
              <button
                type="button"
                onClick={handleConvert}
                className="inline-flex items-center gap-1.5 rounded-full border border-foreground px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted"
              >
                <Briefcase className="h-3.5 w-3.5" /> Converter em cliente/projeto
              </button>
            )}
          </div>
        )}

        {!liveLead && (
          <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => submit()}
              className="rounded-full border-2 border-foreground bg-foreground px-5 py-2 text-sm font-medium text-background transition-colors duration-200 hover:bg-transparent hover:text-foreground"
            >
              Criar oportunidade
            </button>
          </div>
        )}
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
      className="inline-flex items-center gap-1.5 rounded-full border-2 border-foreground bg-foreground px-3.5 py-1.5 text-xs font-medium text-background transition-colors duration-200 hover:bg-transparent hover:text-foreground disabled:opacity-60"
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
        className="w-full max-w-sm rounded-2xl border border-border bg-background p-4 shadow-2xl"
      >
        <h4 className="mb-3 text-sm font-medium text-foreground">{title}</h4>
        <div className="space-y-3">{children}</div>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-border px-3.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className="inline-flex items-center gap-1.5 rounded-full border-2 border-foreground bg-foreground px-3.5 py-1.5 text-xs font-medium text-background transition-colors duration-200 hover:bg-transparent hover:text-foreground disabled:opacity-60"
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
    <div className="mb-4 space-y-3 rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-muted-foreground ring-1 ring-border">
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
