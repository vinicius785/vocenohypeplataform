import { useState, useEffect } from "react";
import {
  User,
  Mail,
  Phone,
  Tag,
  FileText,
  Star,
  Briefcase,
  CheckCircle2,
  XCircle,
  History,
  Calculator,
  MoreHorizontal,
  Loader2,
  Link2,
  AlertTriangle,
} from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { DateField } from "@/components/ui/date-field";
import { Button } from "@/components/ui/button";
import { SimuladorPropostaForm } from "@/components/comercial/SimuladorPropostaDialog";
import { formatBRL, type Lead, type PropostaSnapshot } from "@/lib/comercial";
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
import { loadPricing, fetchPricing } from "@/lib/pricing-store";
import { BRASILIA_TZ } from "@/lib/timezone";
import { linkifyText } from "@/lib/linkify";
import type { TeamMemberLite } from "@/lib/projetos";
import { useServerFn } from "@tanstack/react-start";
import { generatePropostaPublicToken } from "@/lib/comercial.functions";
import { convertLeadToClienteEProjeto } from "./convertLead";

const inputCls =
  "h-9 w-full rounded-md border border-border bg-background px-2.5 text-sm outline-none focus:ring-2 focus:ring-ring";
const labelCls = "block space-y-1 text-xs font-medium text-text-secondary";
const SOURCES = ["Indicação", "Instagram", "Google", "LinkedIn", "Site", "Evento", "Outro"];
const PERDIDO_MOTIVOS = [
  "Sem orçamento",
  "Escolheu concorrente",
  "Sem resposta do cliente",
  "Fora do escopo/ICP",
  "Timing ruim",
];

export type OpportunityActionInput = {
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

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

/**
 * Drawer da oportunidade — substitui o antigo painel de 896px com aside
 * de resumo duplicado. Agora é um `<Sheet>` (já existia no design system,
 * subutilizado — ver `InfluencerBoard.tsx`'s `EntregaDetailSheet`) de
 * 608px, com 3 abas (Visão geral/Proposta/Histórico) — Contato e
 * Qualificação viraram blocos compactos dentro de Visão geral, já que
 * cada um tem poucos campos.
 */
export function LeadDrawer({
  initial,
  initialStage,
  open,
  team,
  onClose,
  onSave,
  onRunAction,
  onAutosave,
  onDelete,
}: {
  initial: Lead | null;
  /** Etapa pré-selecionada ao criar uma oportunidade a partir do botão
   * "+" de uma coluna específica do Kanban — ignorado quando `initial`
   * já existe. */
  initialStage?: OpportunityStage;
  open: boolean;
  team: TeamMemberLite[];
  onClose: () => void;
  onSave: (l: Lead) => void;
  onRunAction: (input: OpportunityActionInput) => Promise<Lead>;
  onAutosave: (l: Lead) => Promise<Lead>;
  onDelete?: () => void;
}) {
  // `liveLead` acompanha o resultado de cada ação do motor (etapa,
  // histórico, valor) e de cada autosave, sem fechar a ficha.
  const [liveLead, setLiveLead] = useState<Lead | null>(initial);
  const generateLinkFn = useServerFn(generatePropostaPublicToken);
  const [generatingLink, setGeneratingLink] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
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
  const [stage, setStage] = useState<OpportunityStage>(
    initial ? legacyStage(initial.stage) : (initialStage ?? "LEAD_RECEBIDO"),
  );
  const [source, setSource] = useState(initial?.source ?? "");
  const [responsible, setResponsible] = useState(initial?.responsible ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [score, setScore] = useState<number>(initial?.score ?? 0);
  const [tab, setTab] = useState("visao-geral");
  const [error, setError] = useState("");
  const [autosaveStatus, setAutosaveStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
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
  const currentStageLabel = liveLead ? nextStep!.stageLabel : OPPORTUNITY_STAGE_LABEL[stage];
  const valueDivergesFromProposal =
    !!proposta && Math.round(proposta.precoFinal) !== Math.round(parsedValue);

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

  const copyPropostaLink = async () => {
    if (!liveLead) return;
    setGeneratingLink(true);
    try {
      let token = liveLead.propostaPublicToken;
      if (!token) {
        const result = await generateLinkFn({ data: { id: liveLead.id } });
        token = result.token;
        setLiveLead((prev) => (prev ? { ...prev, propostaPublicToken: token } : prev));
      }
      await navigator.clipboard.writeText(
        `${window.location.origin}/calculadora-proposta/${token}`,
      );
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível gerar o link.");
    } finally {
      setGeneratingLink(false);
    }
  };

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
      wonAt: liveLead?.wonAt,
      lostAt: liveLead?.lostAt,
    };
  };

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
      setAutosaveStatus("error");
      setError(e instanceof Error ? e.message : "Não foi possível salvar essa alteração.");
    }
  };

  const submit = () => {
    const n = name.trim();
    if (!n) {
      setError("Informe o nome da oportunidade.");
      return;
    }
    onSave(buildLead());
  };

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-[608px]">
        <SheetTitle className="sr-only">{name.trim() || "Nova oportunidade"}</SheetTitle>

        {/* Cabeçalho — hierarquia real (Etapa 7): nome/valor protagonistas,
         * etapa/responsável subordinados, em vez de uma sequência de
         * textos do mesmo peso. */}
        <div className="bg-card pr-10 dark:shadow-none">
          <div className="flex items-start justify-between gap-3 px-6 pt-6">
            <div className="min-w-0">
              <h3 className="truncate text-[22px] font-bold tracking-tight text-foreground">
                {company.trim() || name.trim() || "Nova oportunidade"}
              </h3>
              {contact.trim() && (
                <p className="mt-0.5 truncate text-sm text-text-secondary">{contact}</p>
              )}
            </div>
            {autosaveStatus !== "idle" && (
              <span
                className={`shrink-0 text-[11px] ${
                  autosaveStatus === "error" ? "text-destructive" : "text-text-secondary"
                }`}
              >
                {autosaveStatus === "saving"
                  ? "Salvando…"
                  : autosaveStatus === "saved"
                    ? "Salvo"
                    : "Erro ao salvar"}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3 px-6 pt-3">
            <span className="whitespace-nowrap text-[28px] font-bold tabular-nums leading-none text-foreground">
              {formatBRL(parsedValue)}
            </span>
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium ${OPPORTUNITY_STAGE_TONE[stage]}`}
            >
              {currentStageLabel}
            </span>
            {responsible && <span className="text-xs text-text-secondary">{responsible}</span>}
          </div>

          <div className="flex flex-wrap items-end justify-between gap-3 px-6 pb-5 pt-4">
            <div className="min-w-0">
              {liveLead && nextStep && (
                <>
                  <div className="text-[10px] font-medium uppercase tracking-wide text-text-secondary">
                    Próxima ação
                  </div>
                  <div className="text-sm font-medium text-foreground">
                    {nextStep.actionLabel ??
                      (nextStep.actor === "CLIENTE" ? "Aguardar retorno do cliente" : "Nenhuma")}
                  </div>
                  {nextStep.actor && (
                    <span className="mt-1 inline-block rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-text-secondary">
                      {OPPORTUNITY_ACTOR_LABEL[nextStep.actor]}
                    </span>
                  )}
                </>
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
                    onClick={() => setTab("proposta")}
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

                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowEtapaMenu((v) => !v)}
                    aria-label="Mais ações"
                    className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-text-secondary hover:bg-muted hover:text-foreground"
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
                        <p className="mb-1 px-2 text-[11px] font-medium text-text-secondary">
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
                      {onDelete && (
                        <div className="border-t border-border pt-1">
                          <button
                            type="button"
                            onClick={() => {
                              setShowEtapaMenu(false);
                              onDelete();
                            }}
                            className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-xs font-medium text-destructive hover:bg-destructive/10"
                          >
                            <XCircle className="h-3.5 w-3.5" /> Excluir oportunidade
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
          <TabsList className="mx-5 mt-3 w-fit shrink-0">
            <TabsTrigger value="visao-geral">Visão geral</TabsTrigger>
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
                    {valueDivergesFromProposal && (
                      <button
                        type="button"
                        onClick={() => setTab("proposta")}
                        className="flex items-center gap-1 text-[11px] font-normal text-amber-600 hover:underline dark:text-amber-400"
                      >
                        <AlertTriangle className="h-3 w-3" /> Diverge da proposta salva (
                        {formatBRL(proposta!.precoFinal)})
                      </button>
                    )}
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
                      {OPPORTUNITY_STAGES.map((s) => (
                        <option key={s} value={s}>
                          {OPPORTUNITY_STAGE_LABEL[s]}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </Section>

              <Section title="Contato" icon={<User className="h-4 w-4" />}>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className={labelCls}>
                    <span>Nome do contato</span>
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

              <Section title="Qualificação" icon={<Star className="h-4 w-4" />}>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-medium text-text-secondary">Qualificação</span>
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
                          className={`h-4 w-4 ${
                            n <= score ? "fill-foreground text-foreground" : "text-text-secondary"
                          }`}
                        />
                      </button>
                    ))}
                  </div>
                </div>
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
                    <span>Responsável</span>
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
                  <span>Observações</span>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    onBlur={autosaveField}
                    className={`${inputCls} h-20 resize-none py-2`}
                    maxLength={1000}
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

              {liveLead && (liveLead.history?.length ?? 0) > 0 && (
                <Section title="Últimas interações" icon={<History className="h-4 w-4" />}>
                  <ul className="space-y-1.5">
                    {[...(liveLead.history ?? [])]
                      .sort((a, b) => b.createdAt - a.createdAt)
                      .slice(0, 3)
                      .map((h) => (
                        <li
                          key={h.id}
                          className="truncate text-xs text-text-secondary"
                          title={h.text}
                        >
                          • {h.text}
                        </li>
                      ))}
                  </ul>
                  <button
                    type="button"
                    onClick={() => setTab("historico")}
                    className="text-[11px] font-medium text-foreground hover:underline"
                  >
                    Ver histórico completo →
                  </button>
                </Section>
              )}
            </TabsContent>

            <TabsContent value="proposta" className="mt-0 space-y-4">
              <ProposalTabContent
                proposta={proposta}
                liveLead={liveLead}
                nextStep={nextStep}
                runningAction={runningAction}
                onEnviarProposta={() => runAction("enviar_proposta")}
                generatingLink={generatingLink}
                linkCopied={linkCopied}
                onCopyLink={copyPropostaLink}
                onApply={(precoFinal, snapshot) => {
                  setValue(String(Math.round(precoFinal)));
                  setProposta(snapshot);
                  if (liveLead) void runAction("criar_proposta", { proposta: snapshot });
                }}
              />
            </TabsContent>

            {liveLead && (
              <TabsContent value="historico" className="mt-0">
                <HistoryTabContent history={liveLead.history ?? []} />
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

        {liveLead && legacyStage(liveLead.stage) === "GANHO" && (
          <div className="border-t border-border px-5 py-3">
            {liveLead.clienteId ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground">
                <CheckCircle2 className="h-3.5 w-3.5" /> Convertido em cliente/projeto
              </span>
            ) : (
              <ConvertButton lead={liveLead} onConverted={onSave} />
            )}
          </div>
        )}

        {!liveLead && (
          <div className="flex items-center justify-end gap-2 bg-card px-5 py-3 dark:shadow-none">
            <Button variant="ghost" size="comfortable" onClick={onClose}>
              Cancelar
            </Button>
            <Button variant="primary" size="comfortable" onClick={submit}>
              Criar oportunidade
            </Button>
          </div>
        )}
      </SheetContent>

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
            <DateField
              value={dataReuniao || undefined}
              onChange={(v) => setDataReuniao(v ?? "")}
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
    </Sheet>
  );
}

function ConvertButton({ lead, onConverted }: { lead: Lead; onConverted: (l: Lead) => void }) {
  return (
    <button
      type="button"
      onClick={() => {
        const { clienteId, projectId } = convertLeadToClienteEProjeto(lead);
        onConverted({ ...lead, clienteId, projectId });
      }}
      className="inline-flex items-center gap-1.5 rounded-full border border-foreground px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted"
    >
      <Briefcase className="h-3.5 w-3.5" /> Converter em cliente/projeto
    </button>
  );
}

/** Aba Proposta — envolve o Simulador já existente, com destaque de
 * custo/preço/margem em R$ e % e alerta quando a margem final ficar
 * abaixo do percentual configurado em Configurações → Precificação
 * (mesmo `settings.percentuais.margem` que já define o preço calculado —
 * não inventa um segundo "limite" novo). */
function ProposalTabContent({
  proposta,
  liveLead,
  nextStep,
  runningAction,
  onEnviarProposta,
  generatingLink,
  linkCopied,
  onCopyLink,
  onApply,
}: {
  proposta: PropostaSnapshot | undefined;
  liveLead: Lead | null;
  nextStep: ReturnType<typeof deriveOpportunityNextStep> | null;
  runningAction: OpportunityActionKind | null;
  onEnviarProposta: () => void;
  generatingLink: boolean;
  linkCopied: boolean;
  onCopyLink: () => void;
  onApply: (precoFinal: number, snapshot: PropostaSnapshot) => void;
}) {
  const [margemMinima, setMargemMinima] = useState<number | null>(null);
  useEffect(() => {
    setMargemMinima(loadPricing().percentuais.margem);
    void fetchPricing().then((p) => setMargemMinima(p.percentuais.margem));
  }, []);

  const margemReaisAtual = proposta ? proposta.precoFinal - proposta.custoTotal : null;
  const margemPctAtual =
    proposta && proposta.precoFinal > 0 ? margemReaisAtual! / proposta.precoFinal : null;
  const margemBaixa =
    margemPctAtual != null && margemMinima != null && margemPctAtual < margemMinima - 0.001;

  return (
    <>
      {proposta && (
        <Section title="Proposta atual" icon={<Calculator className="h-4 w-4" />}>
          {/* Preço final protagonista (Etapa 7) — o valor que mais importa
           * na aba, não mais um MiniStat igual aos outros. */}
          <div className="rounded-[20px] bg-brand p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-foreground-secondary">
              Preço final ao cliente
            </p>
            <p className="mt-1 whitespace-nowrap text-[32px] font-bold tabular-nums leading-none text-brand-foreground">
              {formatBRL(proposta.precoFinal)}
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <MiniStat label="Custo total" value={formatBRL(proposta.custoTotal)} />
            <MiniStat
              label="Margem (R$)"
              value={formatBRL(margemReaisAtual ?? 0)}
              tone={margemBaixa ? "danger" : "neutral"}
            />
            <MiniStat
              label="Margem (%)"
              value={margemPctAtual != null ? `${Math.round(margemPctAtual * 100)}%` : "—"}
              tone={margemBaixa ? "danger" : "neutral"}
            />
          </div>
          {margemBaixa && (
            <p className="flex items-center gap-1.5 rounded-md bg-amber-500/10 px-2.5 py-1.5 text-[11px] font-medium text-amber-700 dark:text-amber-400">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              Margem abaixo do percentual configurado ({Math.round((margemMinima ?? 0) * 100)}%) —
              revise o preço final antes de enviar.
            </p>
          )}
          {proposta.ajustadoManualmente && (
            <p className="text-[11px] italic text-text-secondary">Ajustado manualmente</p>
          )}
          {liveLead && nextStep?.action === "enviar_proposta" && (
            <div className="flex flex-wrap items-center gap-2">
              <ActionButton
                label="Enviar proposta"
                busy={runningAction === "enviar_proposta"}
                onClick={onEnviarProposta}
              />
            </div>
          )}
        </Section>
      )}

      <Section
        title="Simulador"
        icon={<Calculator className="h-4 w-4" />}
        action={
          liveLead && (
            <button
              type="button"
              onClick={onCopyLink}
              disabled={generatingLink}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1 text-xs font-medium shadow-sm hover:bg-muted disabled:opacity-50"
            >
              {generatingLink ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Link2 className="h-3.5 w-3.5" />
              )}
              {linkCopied ? "Link copiado!" : "Calculadora externa"}
            </button>
          )
        }
      >
        <p className="-mt-1 mb-3 text-[11px] text-text-secondary">
          Monte o pacote, calcule custo/impostos/comissão/bonificação/margem e aplique o preço final
          ao negócio.
        </p>
        <SimuladorPropostaForm
          initial={proposta}
          applyLabel={proposta ? "Atualizar proposta" : "Usar como valor do negócio"}
          onApply={onApply}
        />
      </Section>
    </>
  );
}

const HISTORY_ICON: Record<string, typeof CheckCircle2> = {
  created: CheckCircle2,
  stage_change: Tag,
  value_change: FileText,
  proposal: Calculator,
  meeting: History,
  negotiation: FileText,
  won: CheckCircle2,
  lost: XCircle,
};

/** Histórico como linha do tempo — ícone por tipo de evento (quando
 * conhecido; entradas antigas sem `kind` caem num ícone genérico), data
 * em horário de Brasília (nunca o fuso do navegador). */
function HistoryTabContent({ history }: { history: Lead["history"] }) {
  const sorted = [...(history ?? [])].sort((a, b) => b.createdAt - a.createdAt);
  return (
    <Section title="Histórico" icon={<History className="h-4 w-4" />}>
      {sorted.length === 0 ? (
        <p className="text-xs text-text-secondary">Sem eventos registrados.</p>
      ) : (
        <ul className="space-y-4 border-l border-border pl-4">
          {sorted.map((h) => {
            const Icon = (h.kind && HISTORY_ICON[h.kind]) || History;
            return (
              <li key={h.id} className="relative text-xs leading-relaxed">
                <span className="absolute -left-[21px] flex h-4 w-4 items-center justify-center rounded-full bg-muted text-text-secondary ring-2 ring-background">
                  <Icon className="h-2.5 w-2.5" />
                </span>
                <div className="min-w-0 break-words text-foreground [overflow-wrap:anywhere]">
                  {linkifyText(h.text)}
                </div>
                <div className="text-text-secondary/70">
                  {new Date(h.createdAt).toLocaleString("pt-BR", {
                    timeZone: BRASILIA_TZ,
                    day: "2-digit",
                    month: "2-digit",
                    year: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Section>
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
      className="inline-flex items-center gap-1.5 rounded-full bg-brand px-3.5 py-2 text-xs font-semibold text-brand-foreground hover:opacity-90 disabled:opacity-60"
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
        className="w-full max-w-sm rounded-[22px] bg-card p-5 shadow-2xl dark:shadow-none"
      >
        <h4 className="mb-3 text-[15px] font-semibold text-foreground">{title}</h4>
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
            className="inline-flex items-center gap-1.5 rounded-full bg-brand px-3.5 py-2 text-xs font-semibold text-brand-foreground hover:opacity-90 disabled:opacity-60"
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
  action,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  // Seção definida por tipografia/espaço (Etapa 7) — sem card-dentro-de-
  // card; a separação entre seções vem de uma borda inferior discreta, não
  // de mais um retângulo com fundo próprio.
  return (
    <div className="space-y-3 border-b border-border/60 pb-5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wide text-text-secondary">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-text-secondary">
            {icon}
          </span>
          {title}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function MiniStat({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "danger";
}) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-text-secondary">{label}</p>
      <p
        className={`mt-0.5 text-sm font-semibold tabular-nums ${
          tone === "danger" ? "text-destructive" : "text-foreground"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
