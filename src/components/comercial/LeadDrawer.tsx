import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  AlertTriangle,
  Briefcase,
  Calculator,
  CheckCircle2,
  History,
  Mail,
  MessageCircle,
  MessageSquare,
  MoreHorizontal,
  Phone,
  XCircle,
} from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { DateField } from "@/components/ui/date-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ui/native-select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { avatarAccent, initialsOf } from "@/components/team/member-ui";
import { formatBRL, type Lead, type PropostaSnapshot } from "@/lib/comercial";
import { listFollowUps } from "@/lib/commercial-interactions.functions";
import {
  deriveOpportunityNextStep,
  legacyStage,
  OPPORTUNITY_STAGES,
  OPPORTUNITY_STAGE_LABEL,
  OPPORTUNITY_STAGE_TONE,
  OPPORTUNITY_ACTOR_LABEL,
  type OpportunityActionKind,
  type OpportunityStage,
} from "@/lib/comercial-engine";
import { draftToLead, leadToDraft, parseMoney, type LeadDraft } from "@/lib/comercial-lead-draft";
import {
  buildCommercialTimeline,
  contactSubline,
  nextActionDisplay,
} from "@/lib/comercial-lead-view";
import { generatePropostaPublicToken } from "@/lib/comercial.functions";
import type { TeamMemberLite } from "@/lib/projetos";
import { useConfirm } from "@/hooks/use-confirm";
import { valueImpactMessage } from "@/lib/comercial-proposal-form";
import { convertLeadToClienteEProjeto } from "./convertLead";
import { LeadDemoSection } from "./lead/LeadDemoSection";
import { LeadHistoryPanel } from "./lead/LeadTimeline";
import { LeadOverview, type LeadFieldApi } from "./lead/LeadOverview";
import { LeadProposal, APPLY_CANCELLED, type ApplyResult } from "./lead/LeadProposal";

const labelCls = "block space-y-1.5 text-sm font-medium text-foreground";
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

type DrawerTab = "visao-geral" | "proposta" | "historico";

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

const sameDraft = (a: LeadDraft, b: LeadDraft) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Perfil do lead — um "cockpit comercial" num `<Sheet>` de 608px. O
 * cabeçalho responde de cara: quem é, em que etapa está, quanto vale, quem é
 * o responsável e qual é a próxima ação (com a ação principal à mão). Abaixo,
 * 3 abas: Visão geral (contexto da negociação → últimas interações → dados
 * editáveis ao clicar), Proposta e Histórico (linha do tempo comercial; as
 * "Alterações do lead" ficam como auditoria recolhida no fim).
 *
 * Etapa, histórico e valor continuam sendo decididos só pelo motor
 * (`onRunAction`); os campos do formulário salvam ao sair (`onAutosave`).
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
  onRegisterFollowUp,
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
  /** Abre o mesmo modal de "Registrar follow-up" do card — só disponível
   * pra um lead já existente (sem sentido antes de salvar a criação). */
  onRegisterFollowUp?: () => void;
}) {
  // `liveLead` acompanha o resultado de cada ação do motor (etapa,
  // histórico, valor) e de cada autosave, sem fechar a ficha.
  const [liveLead, setLiveLead] = useState<Lead | null>(initial);
  const listFollowUpsFn = useServerFn(listFollowUps);
  const { data: followUps = [] } = useQuery({
    queryKey: ["commercial-interactions", liveLead?.id],
    queryFn: () => listFollowUpsFn({ data: { opportunityId: liveLead!.id } }),
    enabled: !!liveLead?.id,
  });
  const generateLinkFn = useServerFn(generatePropostaPublicToken);
  const [generatingLink, setGeneratingLink] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  // Rascunho do formulário. O ref espelha o estado de forma síncrona: o
  // salvamento sempre lê o valor MAIS recente, mesmo logo após um `setField`
  // (antes, o clique nas estrelas salvava a nota anterior por closure velha).
  const [draft, setDraft] = useState<LeadDraft>(() => leadToDraft(initial, initialStage));
  const draftRef = useRef(draft);
  const savedRef = useRef(draft);

  const [tab, setTab] = useState<DrawerTab>("visao-geral");
  // A aba Proposta guarda trabalho não aplicado: depois de visitada, fica
  // montada (trocar de aba não apaga) e fechar a ficha pede confirmação.
  const [proposalVisited, setProposalVisited] = useState(false);
  const [proposalDirty, setProposalDirty] = useState(false);
  const { confirm, confirmDialog } = useConfirm();
  const [auditOpen, setAuditOpen] = useState(false);
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
  const [valorGanho, setValorGanho] = useState(String(liveLead?.value ?? draft.value ?? ""));
  const [showPerdido, setShowPerdido] = useState(false);
  const [motivoPerdido, setMotivoPerdido] = useState("");

  // O Comercial relê a lista depois de cada ação e de cada follow-up; traz
  // para a ficha só o que muda por fora dela (follow-up/reunião mexem na
  // próxima ação e no último contato) — nunca os campos em edição.
  useEffect(() => {
    if (tab === "proposta") setProposalVisited(true);
  }, [tab]);

  const initialId = initial?.id;
  const initialLastContactAt = initial?.lastContactAt;
  const initialNextActionAt = initial?.nextActionAt;
  const initialNextActionDescription = initial?.nextActionDescription;
  useEffect(() => {
    if (!initialId) return;
    setLiveLead((prev) => {
      if (!prev || prev.id !== initialId) return prev;
      if (
        prev.lastContactAt === initialLastContactAt &&
        prev.nextActionAt === initialNextActionAt &&
        prev.nextActionDescription === initialNextActionDescription
      ) {
        return prev;
      }
      return {
        ...prev,
        lastContactAt: initialLastContactAt,
        nextActionAt: initialNextActionAt,
        nextActionDescription: initialNextActionDescription,
      };
    });
  }, [initialId, initialLastContactAt, initialNextActionAt, initialNextActionDescription]);

  const setField: LeadFieldApi["setField"] = (key, value) => {
    draftRef.current = { ...draftRef.current, [key]: value };
    setDraft(draftRef.current);
  };

  const parsedValue = parseMoney(draft.value);
  const nextStep = liveLead ? deriveOpportunityNextStep(liveLead) : null;
  const valueDivergesFromProposal =
    !!draft.proposta && Math.round(draft.proposta.precoFinal) !== Math.round(parsedValue);
  const timeline = useMemo(
    () => buildCommercialTimeline({ interactions: followUps, history: liveLead?.history }),
    [followUps, liveLead?.history],
  );

  /** Executa uma ação do motor e atualiza a ficha. Devolve a mensagem de erro
   * (ou `null` se deu certo) — quem chama decide onde mostrá-la. */
  const execAction = async (
    action: OpportunityActionKind,
    opts: Partial<OpportunityActionInput> = {},
  ): Promise<string | null> => {
    if (!liveLead) return null;
    setRunningAction(action);
    try {
      const updated = await onRunAction({ id: liveLead.id, action, ...opts });
      setLiveLead(updated);
      const next: LeadDraft = {
        ...draftRef.current,
        stage: legacyStage(updated.stage),
        value: String(updated.value ?? ""),
        ...(updated.proposta ? { proposta: updated.proposta } : {}),
      };
      draftRef.current = next;
      setDraft(next);
      savedRef.current = {
        ...savedRef.current,
        stage: next.stage,
        value: next.value,
        proposta: next.proposta,
      };
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : "Não foi possível executar a ação.";
    } finally {
      setRunningAction(null);
    }
  };

  const runAction = async (
    action: OpportunityActionKind,
    opts: Partial<OpportunityActionInput> = {},
  ) => {
    if (!liveLead) return;
    setError("");
    const message = await execAction(action, opts);
    if (message) setError(message);
  };

  /** "Usar como valor do negócio": confirma o impacto quando o valor muda,
   * aplica (motor) e só então reflete na ficha; falhou → nada muda. */
  const applyProposal = async (
    precoFinal: number,
    snapshot: PropostaSnapshot,
  ): Promise<ApplyResult> => {
    if (liveLead) {
      const impact = valueImpactMessage(parsedValue, precoFinal);
      if (impact && parsedValue > 0) {
        const ok = await confirm(impact, {
          title: "Alterar o valor do negócio?",
          confirmLabel: "Alterar valor",
        });
        if (!ok) return APPLY_CANCELLED;
      }
    }
    const previous = draftRef.current;
    draftRef.current = {
      ...previous,
      value: String(Math.round(precoFinal)),
      proposta: snapshot,
    };
    setDraft(draftRef.current);
    if (!liveLead) return null;
    const message = await execAction("criar_proposta", { proposta: snapshot });
    if (message) {
      draftRef.current = {
        ...draftRef.current,
        value: previous.value,
        proposta: previous.proposta,
      };
      setDraft(draftRef.current);
    }
    return message;
  };

  /** Fechar a ficha com proposta não aplicada pede confirmação. */
  const requestClose = async () => {
    if (proposalDirty) {
      const discard = await confirm(
        "As alterações da proposta ainda não foram aplicadas ao negócio e serão perdidas.",
        {
          title: "Descartar alterações da proposta?",
          confirmLabel: "Descartar",
          destructive: true,
        },
      );
      if (!discard) return;
    }
    onClose();
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

  /** Salva os campos ao sair deles. Só grava se algo mudou desde o último
   * salvamento (evita escritas e o aviso "Salvo" a cada blur sem alteração). */
  const commit: LeadFieldApi["commit"] = async (patch) => {
    if (patch) {
      draftRef.current = { ...draftRef.current, ...patch };
      setDraft(draftRef.current);
    }
    if (!liveLead) return; // criação: só grava no "Criar oportunidade"
    const current = draftRef.current;
    if (!current.name.trim()) return;
    if (sameDraft(current, savedRef.current)) return;
    setAutosaveStatus("saving");
    setError("");
    try {
      const saved = await onAutosave(draftToLead(current, liveLead, uid));
      setLiveLead(saved);
      savedRef.current = current;
      setAutosaveStatus("saved");
      setTimeout(() => setAutosaveStatus((s) => (s === "saved" ? "idle" : s)), 1600);
    } catch (e) {
      setAutosaveStatus("error");
      setError(e instanceof Error ? e.message : "Não foi possível salvar essa alteração.");
    }
  };

  const submit = () => {
    if (!draftRef.current.name.trim()) {
      setError("Informe o nome da oportunidade.");
      return;
    }
    onSave(draftToLead(draftRef.current, liveLead, uid));
  };

  const title = draft.company.trim() || draft.name.trim() || "Nova oportunidade";
  const subline = contactSubline(draft.contact, draft.role);
  const committed = liveLead ? nextActionDisplay(liveLead) : null;
  const phoneDigits = draft.phone.replace(/\D/g, "");
  const isTerminal = !!nextStep && (nextStep.stage === "GANHO" || nextStep.stage === "PERDIDO");

  /** Ação principal sugerida pelo motor para a etapa atual. */
  const primaryAction = (() => {
    if (!liveLead || !nextStep?.action) return null;
    switch (nextStep.action) {
      case "registrar_contato":
        return { label: "Registrar contato", run: () => runAction("registrar_contato") };
      case "agendar_reuniao":
        return { label: "Agendar reunião", run: () => setShowAgendar(true) };
      case "registrar_reuniao":
        return { label: "Registrar reunião realizada", run: () => runAction("registrar_reuniao") };
      case "criar_proposta":
        return {
          label: "Criar proposta",
          icon: <Calculator className="h-3.5 w-3.5" />,
          run: () => setTab("proposta"),
        };
      case "enviar_proposta":
        return { label: "Enviar proposta", run: () => runAction("enviar_proposta") };
      case "registrar_negociacao":
        return {
          label: "Registrar atualização",
          run: () => {
            setNovoValorNegociacao(String(liveLead.value ?? ""));
            setShowNegociacao(true);
          },
        };
      default:
        return null;
    }
  })();

  const fields: LeadFieldApi = { draft, setField, commit };

  return (
    <Sheet open={open} onOpenChange={(v) => !v && void requestClose()}>
      <SheetContent className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-[608px]">
        <SheetTitle className="sr-only">{draft.name.trim() || "Nova oportunidade"}</SheetTitle>

        {/* Cabeçalho — cockpit: identidade, valor, etapa, responsável e a
         * próxima ação com a ação principal; o resto vive nas abas. */}
        <div className="border-b border-border/60 bg-background">
          <div className="flex items-start justify-between gap-3 px-6 pb-3 pr-12 pt-5">
            <div className="min-w-0">
              <h3 className="truncate text-xl font-semibold tracking-tight text-foreground md:text-2xl">
                {title}
              </h3>
              {subline && (
                <p className="mt-0.5 truncate text-sm text-text-secondary" title={subline}>
                  {subline}
                </p>
              )}
            </div>
            {autosaveStatus !== "idle" && (
              <span
                role="status"
                className={`shrink-0 pt-1 text-[11px] ${
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

          {liveLead && nextStep && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-6 pb-4">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <span className="whitespace-nowrap text-2xl font-semibold tabular-nums leading-none text-foreground">
                    {formatBRL(parsedValue)}
                  </span>
                  <Badge
                    variant="secondary"
                    size="sm"
                    className={OPPORTUNITY_STAGE_TONE[nextStep.stage]}
                  >
                    {nextStep.stageLabel}
                  </Badge>
                  {draft.responsible && (
                    <span className="inline-flex items-center gap-1.5 text-sm text-text-secondary">
                      <span
                        aria-hidden="true"
                        className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold ${avatarAccent(
                          draft.responsible,
                        )}`}
                      >
                        {initialsOf(draft.responsible, "?")}
                      </span>
                      {draft.responsible}
                    </span>
                  )}
                </div>
                {(draft.phone.trim() || draft.email.trim()) && (
                  <div className="flex items-center gap-0.5">
                    {draft.phone.trim() && (
                      <Button asChild variant="ghost" size="icon" className="h-8 w-8">
                        <a href={`tel:${phoneDigits}`} aria-label="Ligar" title="Ligar">
                          <Phone />
                        </a>
                      </Button>
                    )}
                    {draft.phone.trim() && (
                      <Button asChild variant="ghost" size="icon" className="h-8 w-8">
                        <a
                          href={`https://wa.me/${phoneDigits}`}
                          target="_blank"
                          rel="noreferrer"
                          aria-label="Abrir WhatsApp"
                          title="Abrir WhatsApp"
                        >
                          <MessageCircle />
                        </a>
                      </Button>
                    )}
                    {draft.email.trim() && (
                      <Button asChild variant="ghost" size="icon" className="h-8 w-8">
                        <a
                          href={`mailto:${draft.email.trim()}`}
                          aria-label="Enviar e-mail"
                          title="Enviar e-mail"
                        >
                          <Mail />
                        </a>
                      </Button>
                    )}
                  </div>
                )}
              </div>

              {/* Próxima ação — o foco do cockpit. */}
              <div className="border-t border-border/60 bg-muted/30 px-6 py-3.5">
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-text-secondary">
                      Próxima ação
                    </p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-sm font-medium text-foreground">
                        {nextStep.actionLabel ??
                          (nextStep.actor === "CLIENTE"
                            ? "Aguardar retorno do cliente"
                            : "Nenhuma")}
                      </span>
                      {nextStep.actor && (
                        <Badge variant="secondary" size="sm">
                          {OPPORTUNITY_ACTOR_LABEL[nextStep.actor]}
                        </Badge>
                      )}
                    </div>
                    {committed && !isTerminal && (
                      <p
                        className={`mt-1 flex items-center gap-1 text-xs ${
                          committed.tone === "red"
                            ? "font-medium text-danger-soft-foreground"
                            : committed.tone === "amber"
                              ? "font-medium text-warning-soft-foreground"
                              : "text-text-secondary"
                        }`}
                      >
                        {committed.tone === "red" && (
                          <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden="true" />
                        )}
                        <span className="min-w-0 truncate" title={committed.text}>
                          Combinado: {committed.text}
                        </span>
                      </p>
                    )}
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    {primaryAction && (
                      <Button
                        variant="primary"
                        size="sm"
                        isLoading={runningAction === nextStep.action}
                        onClick={primaryAction.run}
                      >
                        {runningAction !== nextStep.action && primaryAction.icon}
                        {primaryAction.label}
                      </Button>
                    )}
                    {onRegisterFollowUp && !isTerminal && (
                      <Button variant="secondary" size="sm" onClick={onRegisterFollowUp}>
                        <MessageSquare /> Follow-up
                      </Button>
                    )}

                    <Popover open={showEtapaMenu} onOpenChange={setShowEtapaMenu}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          size="icon"
                          aria-label="Mais ações"
                          className="h-8 w-8"
                        >
                          <MoreHorizontal />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent align="end" className="w-64 space-y-1 p-2">
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
                              setValorGanho(
                                String(draft.proposta?.precoFinal ?? liveLead.value ?? ""),
                              );
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
                          <NativeSelect
                            value={nextStep.stage}
                            onChange={(e) => {
                              setShowEtapaMenu(false);
                              void runAction("alterar_etapa_manual", {
                                toStage: e.target.value as OpportunityStage,
                              });
                            }}
                          >
                            {OPPORTUNITY_STAGES.map((s) => (
                              <option key={s} value={s}>
                                {OPPORTUNITY_STAGE_LABEL[s]}
                              </option>
                            ))}
                          </NativeSelect>
                        </div>
                        <div className="border-t border-border pt-1">
                          <button
                            type="button"
                            onClick={() => {
                              setShowEtapaMenu(false);
                              setTab("historico");
                              setAuditOpen(true);
                            }}
                            className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-xs font-medium text-foreground hover:bg-muted"
                          >
                            <History className="h-3.5 w-3.5" /> Alterações do lead
                          </button>
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
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as DrawerTab)}
          className="flex min-h-0 flex-1 flex-col"
        >
          <TabsList className="mx-6 mt-3 w-fit max-w-[calc(100%-3rem)] shrink-0">
            <TabsTrigger value="visao-geral">Visão geral</TabsTrigger>
            <TabsTrigger value="proposta">
              Proposta
              {proposalDirty && (
                <span
                  className="ml-1.5 h-1.5 w-1.5 rounded-full bg-warning"
                  role="img"
                  aria-label="alterações não aplicadas"
                  title="Alterações não aplicadas"
                />
              )}
            </TabsTrigger>
            {liveLead && <TabsTrigger value="historico">Histórico</TabsTrigger>}
          </TabsList>

          <div className="min-h-0 flex-1 overflow-y-auto p-6">
            <TabsContent value="visao-geral" className="mt-0">
              <LeadOverview
                lead={liveLead}
                fields={fields}
                team={team}
                timeline={timeline}
                valueDiverges={valueDivergesFromProposal}
                onOpenProposal={() => setTab("proposta")}
                onOpenHistory={() => setTab("historico")}
                onRegisterFollowUp={onRegisterFollowUp}
              />
              {liveLead && (
                <div className="mt-6">
                  <LeadDemoSection
                    leadId={liveLead.id}
                    leadLabel={liveLead.company || liveLead.name}
                  />
                </div>
              )}
            </TabsContent>

            <TabsContent
              value="proposta"
              forceMount={proposalVisited ? true : undefined}
              className="mt-0 data-[state=inactive]:hidden"
            >
              <LeadProposal
                proposta={draft.proposta}
                lead={liveLead}
                currentValue={parsedValue}
                nextStep={nextStep}
                runningAction={runningAction}
                onEnviarProposta={() => runAction("enviar_proposta")}
                generatingLink={generatingLink}
                linkCopied={linkCopied}
                onCopyLink={copyPropostaLink}
                onApply={applyProposal}
                onDirtyChange={setProposalDirty}
              />
            </TabsContent>

            {liveLead && (
              <TabsContent value="historico" className="mt-0">
                <LeadHistoryPanel
                  items={timeline}
                  history={liveLead.history ?? []}
                  auditOpen={auditOpen}
                  onAuditOpenChange={setAuditOpen}
                  onRegisterFollowUp={onRegisterFollowUp}
                />
              </TabsContent>
            )}

            {error && (
              <div
                role="alert"
                className="mt-3 flex items-center gap-2 rounded-xl border border-border bg-muted px-3 py-2 text-xs text-foreground"
              >
                <XCircle className="h-3.5 w-3.5 shrink-0" />
                {error}
              </div>
            )}
          </div>
        </Tabs>

        {liveLead && legacyStage(liveLead.stage) === "GANHO" && (
          <div className="border-t border-border/60 px-6 py-4">
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
          <div className="flex items-center justify-end gap-2 border-t border-border/60 bg-card px-6 py-4">
            <Button variant="ghost" size="comfortable" onClick={() => void requestClose()}>
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
            <DateField value={dataReuniao || undefined} onChange={(v) => setDataReuniao(v ?? "")} />
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
            <Input
              inputMode="decimal"
              value={novoValorNegociacao}
              onChange={(e) => setNovoValorNegociacao(e.target.value)}
            />
          </label>
          <label className={labelCls}>
            <span>Nota</span>
            <Textarea
              value={notaNegociacao}
              onChange={(e) => setNotaNegociacao(e.target.value)}
              className="h-20 resize-none py-2"
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
            <Input
              inputMode="decimal"
              value={valorGanho}
              onChange={(e) => setValorGanho(e.target.value)}
            />
          </label>
        </MiniActionDialog>
      )}

      {confirmDialog}

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
            <Input
              list="perdido-motivos"
              value={motivoPerdido}
              onChange={(e) => setMotivoPerdido(e.target.value)}
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
    <Button
      variant="outline"
      size="sm"
      onClick={() => {
        void convertLeadToClienteEProjeto(lead)
          .then(({ clienteId, projectId }) => {
            onConverted({ ...lead, clienteId, projectId });
          })
          .catch((err: unknown) => {
            const message = err instanceof Error ? err.message : "Falha ao converter lead.";
            toast.error("Não foi possível converter o lead em cliente", { description: message });
          });
      }}
    >
      <Briefcase /> Converter em cliente
    </Button>
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
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">{children}</div>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" size="sm" isLoading={busy} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
