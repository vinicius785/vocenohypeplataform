import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { formatBRL, loadStages, type Lead, type Stage, type StageKey } from "@/lib/comercial";
import {
  listLeads,
  upsertLead as upsertLeadFn,
  updateLeadStage,
  deleteLead as deleteLeadFn,
} from "@/lib/comercial.functions";
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
} from "lucide-react";
import { linkifyText } from "@/lib/linkify";

const STALE_DAYS = 5;
function daysSince(ms: number): number {
  return Math.floor((Date.now() - ms) / 86_400_000);
}
function isStale(lead: Lead): boolean {
  return (
    lead.stage !== "ganho" && lead.stage !== "perdido" && daysSince(lead.updatedAt) >= STALE_DAYS
  );
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
      if (!map[l.stage]) map[l.stage] = [];
      map[l.stage].push(l);
    });
    return map;
  }, [filtered, stages]);

  const totals = useMemo(() => {
    const total = leads.reduce((sum, l) => sum + (l.value || 0), 0);
    const ganho = leads.filter((l) => l.stage === "ganho").reduce((s, l) => s + (l.value || 0), 0);
    const abertos = leads.filter((l) => l.stage !== "ganho" && l.stage !== "perdido").length;
    const parados = leads.filter(isStale).length;
    return { total, ganho, abertos, count: leads.length, parados };
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
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi label="Leads" value={String(totals.count)} />
        <Kpi label="Em aberto" value={String(totals.abertos)} />
        <Kpi label="Ganhos" value={formatBRL(totals.ganho)} />
        <Kpi label="Pipeline total" value={formatBRL(totals.total)} />
        <Kpi
          label={`Parados (${STALE_DAYS}+ dias)`}
          value={String(totals.parados)}
          tone={totals.parados > 0 ? "warning" : undefined}
        />
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
        />
      )}
      {confirmDialog}
    </section>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: "warning" }) {
  return (
    <div
      className={`rounded-lg border p-3 ${
        tone === "warning" ? "border-amber-500/40 bg-amber-500/10" : "border-border bg-card"
      }`}
    >
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={`mt-1 text-lg font-semibold ${tone === "warning" ? "text-amber-700 dark:text-amber-400" : ""}`}
      >
        {value}
      </div>
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

function LeadForm({
  initial,
  stages,
  team,
  onClose,
  onSave,
}: {
  initial: Lead | null;
  stages: Stage[];
  team: TeamMemberLite[];
  onClose: () => void;
  onSave: (l: Lead) => void;
}) {
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
  const [stage, setStage] = useState<StageKey>(initial?.stage ?? stages[0]?.key ?? "lead");
  const [source, setSource] = useState(initial?.source ?? "");
  const [responsible, setResponsible] = useState(initial?.responsible ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [score, setScore] = useState<number>(initial?.score ?? 0);
  const [error, setError] = useState("");

  const parsedValue = Number(value.replace(/[^\d.,]/g, "").replace(",", ".")) || 0;
  const stageMeta = stages.find((s) => s.key === stage);

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
    if (!initial || initial.clienteId) return;
    const { clienteId, projectId } = convertLeadToClienteEProjeto(initial);
    onSave({ ...initial, clienteId, projectId });
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-4xl flex-col bg-background shadow-2xl md:border-l md:border-border"
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <div>
            <h3 className="text-base font-semibold">
              {initial ? "Editar oportunidade" : "Nova oportunidade"}
            </h3>
            <p className="text-xs text-muted-foreground">
              Preencha as informações — o resumo é atualizado em tempo real.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted"
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col md:flex-row">
          <div className="flex-1 overflow-y-auto p-5">
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
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className={labelCls}>
                  <span>Valor (R$)</span>
                  <input
                    inputMode="decimal"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    className={inputCls}
                    placeholder="0"
                  />
                </label>
                <label className={labelCls}>
                  <span>Etapa</span>
                  <select
                    value={stage}
                    onChange={(e) => setStage(e.target.value)}
                    className={inputCls}
                  >
                    {stages.map((s) => (
                      <option key={s.key} value={s.key}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className={labelCls}>
                <span>Qualificação</span>
                <div className="flex items-center gap-1">
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
            </dl>

            {notes.trim() && (
              <div className="mt-4 rounded-md border border-border bg-background p-2.5 text-xs">
                <div className="mb-1 flex items-center gap-1.5 font-medium">
                  <FileText className="h-3.5 w-3.5" /> Observações
                </div>
                <p className="line-clamp-6 whitespace-pre-wrap text-muted-foreground">{notes}</p>
              </div>
            )}

            {initial && (
              <div className="mt-4">
                <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <History className="h-3.5 w-3.5" /> Histórico
                </div>
                {(initial.history?.length ?? 0) === 0 ? (
                  <p className="text-[11px] text-muted-foreground">Sem eventos registrados.</p>
                ) : (
                  <ul className="space-y-2 border-l border-border pl-3">
                    {[...(initial.history ?? [])]
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
            {initial && stage === "ganho" && (
              <>
                {initial.clienteId ? (
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
    <div className="mb-5 space-y-3">
      <div className="flex items-center gap-2 border-b border-border pb-1.5 text-sm font-semibold">
        <span className="text-muted-foreground">{icon}</span>
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
