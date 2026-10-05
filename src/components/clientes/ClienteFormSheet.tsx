import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Check, ImageIcon, Sparkles, X } from "lucide-react";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { Badge } from "@/components/ui/badge";
import { DateField } from "@/components/ui/date-field";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { loadMembers } from "@/lib/chat-store";
import { useClientes, type Cliente, type ClienteStatus } from "@/lib/clientes-store";
import { useMyAccess, hasPermission } from "@/lib/permissions";
import { useConfirm } from "@/hooks/use-confirm";
import { listLeads, upsertLead } from "@/lib/comercial.functions";
import type { Lead } from "@/lib/comercial";
import {
  OPPORTUNITY_STAGE_LABEL,
  OPPORTUNITY_STAGE_TONE,
  legacyStage,
} from "@/lib/comercial-engine";
import {
  CLIENTE_STATUS_LABEL,
  defaultClienteStatusForOrigin,
  suggestClienteStatusFromLeadStage,
  findPossibleDuplicateCliente,
  CLIENTE_DUPLICATE_REASON_LABEL,
} from "./cliente-ui";
import { ClienteLogo } from "./ClienteLogo";

type ClienteForm = Omit<Cliente, "id" | "campanhas">;
/** Campos que podem vir pré-preenchidos de uma importação do CRM — os
 * mesmos usados por `convertLeadToClienteEProjeto` (comercial/convertLead.ts),
 * só que aqui só entram no `useState` do formulário pra revisão, nunca
 * persistem sozinhos. */
const CRM_FILLABLE_FIELDS = ["empresa", "responsavel", "email", "whatsapp"] as const;
type CrmFillableField = (typeof CRM_FILLABLE_FIELDS)[number];

/** Origem do cadastro (Etapa 1 do wizard) — renomeado de "zero"/"crm" pra
 * `origin` porque agora é um conceito de wizard (não mais um modo de UI que
 * troca o corpo inteiro do formulário). */
type ClienteOrigin = "scratch" | "crm-import";

const emptyForm: ClienteForm = {
  photo: undefined,
  empresa: "",
  responsavel: "",
  responsavelInterno: "",
  email: "",
  whatsapp: "",
  clienteDesde: "",
  proximoPasso: "",
  previsaoFechamento: "",
  observacaoNegociacao: "",
};

const inputCls =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand";

function Field({
  label,
  fromCrm,
  children,
}: {
  label: string;
  fromCrm?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-foreground">
        {label}
        {fromCrm && (
          <Badge variant="brand" size="sm" className="gap-1 normal-case">
            <Sparkles className="h-2.5 w-2.5" /> Do CRM
          </Badge>
        )}
      </span>
      {children}
    </label>
  );
}

function formsEqual(a: ClienteForm, b: ClienteForm): boolean {
  return (
    a.empresa === b.empresa &&
    a.responsavel === b.responsavel &&
    a.responsavelInterno === b.responsavelInterno &&
    a.email === b.email &&
    a.whatsapp === b.whatsapp &&
    a.clienteDesde === b.clienteDesde &&
    a.photo === b.photo &&
    (a.proximoPasso ?? "") === (b.proximoPasso ?? "") &&
    (a.previsaoFechamento ?? "") === (b.previsaoFechamento ?? "") &&
    (a.observacaoNegociacao ?? "") === (b.observacaoNegociacao ?? "")
  );
}

/** 4 opções fixas da Etapa 2 (status inicial) — descrições curtas pedidas,
 * sempre as mesmas 4 mostradas independente da origem (só o default
 * pré-selecionado muda, via `defaultClienteStatusForOrigin`). */
const STATUS_OPTIONS: { value: ClienteStatus; description: string }[] = [
  {
    value: "capture",
    description:
      "A oportunidade ainda está sendo trabalhada. Permite planejamento e campanhas preliminares sem financeiro obrigatório.",
  },
  {
    value: "active",
    description:
      "Cliente confirmado e pronto para operação. Alguns dados adicionais poderão ser necessários.",
  },
  {
    value: "closed",
    description: "Cadastro histórico de uma relação já finalizada.",
  },
  {
    value: "archived",
    description: "Cadastro preservado, mas fora da operação atual.",
  },
];

type StepKey = "origem" | "status" | "empresa" | "contexto" | "campanha" | "revisao";
const STEP_LABEL: Record<StepKey, string> = {
  origem: "Origem",
  status: "Status inicial",
  empresa: "Empresa e contato",
  contexto: "Contexto comercial",
  campanha: "Campanha",
  revisao: "Revisão",
};

/**
 * Drawer lateral de criação/edição de cliente — reconstruído como wizard de
 * até 6 etapas (Fase 2 do modelo de status), no mesmo padrão de
 * navegação/step-indicator do `VincularCampanhaDialog.tsx`. Em edição
 * (`initial` presente), pula direto para a etapa "Empresa e contato" — as
 * etapas de Origem/Status inicial só fazem sentido na criação.
 */
export function ClienteFormSheet({
  open,
  initial,
  prefill,
  onClose,
  onSave,
}: {
  open: boolean;
  initial: Cliente | null;
  /** Só usado quando `!initial` (criação) — pré-preenche o formulário
   * vazio sem mudar o modo "editar" (ex.: nome buscado no seletor de
   * cliente da campanha). Não marca os campos como "vindo do CRM". */
  prefill?: Partial<ClienteForm>;
  onClose: () => void;
  /** `id` só vem preenchido em 2 casos, ambos opcionais pro chamador
   * tratar: importação do CRM (id do NOVO cliente, já gerado aqui pra
   * poder gravar o vínculo em `upsertLead` no mesmo instante) e "Usar
   * cliente existente" (id de um cliente JÁ existente — o chamador deve
   * selecionar em vez de inserir de novo). Sem `id`, comportamento
   * idêntico a antes: o chamador gera o id de sempre.
   * `openCampanhaAfter`: true quando a Etapa 5 escolheu "Criar campanha" —
   * o chamador deve, após persistir o cliente, abrir o
   * `VincularCampanhaDialog` já com este cliente selecionado. */
  onSave: (form: ClienteForm & { id?: string; openCampanhaAfter?: boolean }) => void;
}) {
  const isEdit = !!initial;
  const [form, setForm] = useState<ClienteForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { confirm, confirmDialog } = useConfirm();
  const members = loadMembers();
  const clientesExistentes = useClientes();
  const access = useMyAccess();
  const canImportCrm = hasPermission(access, "comercial");

  const [origin, setOrigin] = useState<ClienteOrigin>("scratch");
  const [crmFields, setCrmFields] = useState<Set<CrmFillableField>>(new Set());
  const [crmLead, setCrmLead] = useState<Lead | null>(null);
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [leadsLoading, setLeadsLoading] = useState(false);
  // Lead "Perdido": não sugerimos criação — exige confirmação consciente
  // (checkbox) antes de avançar, sem bloquear (Fase 5).
  const [lostLeadConfirmed, setLostLeadConfirmed] = useState(false);
  const listLeadsFn = useServerFn(listLeads);
  const upsertLeadFn = useServerFn(upsertLead);

  const [status, setStatus] = useState<ClienteStatus>("active");
  const [createCampaignChoice, setCreateCampaignChoice] = useState<"yes" | "no" | null>(null);

  const [step, setStep] = useState<StepKey>("empresa");
  const [, setMaxVisitedIndex] = useState(0);

  const baselineFormRef = useRef<ClienteForm>(emptyForm);

  useEffect(() => {
    if (!open) return;
    const baseline: ClienteForm = initial
      ? {
          photo: initial.photo,
          empresa: initial.empresa,
          responsavel: initial.responsavel,
          responsavelInterno: initial.responsavelInterno,
          email: initial.email,
          whatsapp: initial.whatsapp,
          clienteDesde: initial.clienteDesde,
          proximoPasso: initial.proximoPasso ?? "",
          previsaoFechamento: initial.previsaoFechamento ?? "",
          observacaoNegociacao: initial.observacaoNegociacao ?? "",
        }
      : { ...emptyForm, ...prefill };
    setForm(baseline);
    baselineFormRef.current = baseline;
    setSaving(false);
    setOrigin("scratch");
    setCrmFields(new Set());
    setCrmLead(null);
    setCreateCampaignChoice(null);
    setMaxVisitedIndex(0);
    if (initial) {
      setStatus(initial.status ?? "active");
      setStep("empresa");
    } else {
      setStatus(defaultClienteStatusForOrigin("scratch"));
      setStep(canImportCrm ? "origem" : "status");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial]);

  // Carrega a lista de leads só quando a origem "Importar do Comercial" é
  // aberta pela primeira vez — não busca nada se ninguém nunca clicar ali.
  useEffect(() => {
    if (origin !== "crm-import" || leads !== null) return;
    setLeadsLoading(true);
    void listLeadsFn()
      .then((rows) => setLeads(rows))
      .catch(() => setLeads([]))
      .finally(() => setLeadsLoading(false));
  }, [origin, leads, listLeadsFn]);

  const importableLeads = useMemo(() => (leads ?? []).filter((l) => !l.clienteId), [leads]);

  // Item 6 da reconstrução do domínio Comercial/Clientes/Campanhas/
  // Contratos/Financeiro: detecção de duplicidade por empresa, e-mail,
  // telefone e semelhança de nome — nunca bloqueia, só alerta e oferece
  // reaproveitar o cadastro existente (`selectExistingCliente` abaixo).
  const duplicateMatch = useMemo(() => {
    if (initial) return null;
    return findPossibleDuplicateCliente(clientesExistentes, {
      empresa: form.empresa,
      email: form.email,
      whatsapp: form.whatsapp,
    });
  }, [clientesExistentes, form.empresa, form.email, form.whatsapp, initial]);
  const possibleDuplicate = duplicateMatch?.cliente ?? null;

  const applyLead = (lead: Lead) => {
    const mapped: Partial<ClienteForm> = {
      empresa: lead.company || lead.name,
      responsavel: lead.contact || "",
      email: lead.email || "",
      whatsapp: lead.phone || "",
    };
    setForm((f) => ({ ...f, ...mapped }));
    setCrmFields(new Set(CRM_FILLABLE_FIELDS.filter((k) => mapped[k]?.trim())));
    setCrmLead(lead);
    setLostLeadConfirmed(false);
    setStatus(defaultClienteStatusForOrigin("crm-import", lead.stage));
  };

  const update = <K extends keyof ClienteForm>(k: K, v: ClienteForm[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    // O selo "Do CRM" só faz sentido enquanto o valor ainda é o que veio
    // do lead — assim que a pessoa edita o campo à mão, ele some.
    setCrmFields((prev) => {
      if (!prev.has(k as CrmFillableField)) return prev;
      const next = new Set(prev);
      next.delete(k as CrmFillableField);
      return next;
    });
  };

  const onPhoto = (file?: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => update("photo", reader.result as string);
    reader.readAsDataURL(file);
  };

  const isDirty = () => !formsEqual(form, baselineFormRef.current) || (!isEdit && !!crmLead);

  const requestClose = async () => {
    if (isDirty()) {
      const ok = await confirm("Descartar as alterações não salvas neste cliente?");
      if (!ok) return;
    }
    onClose();
  };

  const requestSwitchOrigin = async (next: ClienteOrigin) => {
    if (next === origin) return;
    const hasData = !formsEqual(form, baselineFormRef.current) || !!crmLead;
    if (hasData) {
      const ok = await confirm(
        "Trocar a origem do cadastro vai descartar os dados já preenchidos. Continuar?",
      );
      if (!ok) return;
    }
    setOrigin(next);
    setForm(baselineFormRef.current);
    setCrmFields(new Set());
    setCrmLead(null);
    if (next === "scratch") setStatus(defaultClienteStatusForOrigin("scratch"));
  };

  // Lista de etapas efetiva — dinâmica: edição pula Origem/Status inicial;
  // Contexto comercial só entra quando o status escolhido é "capture";
  // Origem some quando a pessoa não tem permissão pra importar do Comercial.
  const steps = useMemo<StepKey[]>(() => {
    const list: StepKey[] = [];
    if (!isEdit) {
      if (canImportCrm) list.push("origem");
      list.push("status");
    }
    list.push("empresa");
    if (status === "capture") list.push("contexto");
    list.push("campanha", "revisao");
    return list;
  }, [isEdit, canImportCrm, status]);

  const stepIndex = Math.max(0, steps.indexOf(step));

  const crmLeadIsLost =
    !!crmLead && suggestClienteStatusFromLeadStage(crmLead.stage) === "not-recommended";

  const canContinue = useMemo(() => {
    if (step === "origem")
      return origin === "scratch" || (!!crmLead && (!crmLeadIsLost || lostLeadConfirmed));
    if (step === "empresa") return form.empresa.trim().length > 0;
    if (step === "campanha") return createCampaignChoice !== null;
    return true;
  }, [step, origin, crmLead, crmLeadIsLost, lostLeadConfirmed, form.empresa, createCampaignChoice]);

  const goNext = () => {
    const next = Math.min(stepIndex + 1, steps.length - 1);
    setStep(steps[next]);
    setMaxVisitedIndex((m) => Math.max(m, next));
  };
  const goBack = () => {
    const prev = Math.max(stepIndex - 1, 0);
    setStep(steps[prev]);
  };
  const skipContexto = () => {
    update("proximoPasso", "");
    update("previsaoFechamento", "");
    update("observacaoNegociacao", "");
    goNext();
  };

  const selectExistingCliente = (cliente: Cliente) => {
    onSave({
      id: cliente.id,
      photo: cliente.photo,
      empresa: cliente.empresa,
      responsavel: cliente.responsavel,
      responsavelInterno: cliente.responsavelInterno,
      email: cliente.email,
      whatsapp: cliente.whatsapp,
      clienteDesde: cliente.clienteDesde,
      publicToken: cliente.publicToken,
      orcamentoSugerido: cliente.orcamentoSugerido,
      crmLeadId: cliente.crmLeadId,
    });
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.empresa.trim() || saving) return;
    setSaving(true);
    const cleaned: ClienteForm = {
      ...form,
      status,
      proximoPasso: status === "capture" ? form.proximoPasso || undefined : undefined,
      previsaoFechamento: status === "capture" ? form.previsaoFechamento || undefined : undefined,
      observacaoNegociacao:
        status === "capture" ? form.observacaoNegociacao || undefined : undefined,
    };
    const payload: ClienteForm & { id?: string; openCampanhaAfter?: boolean } = {
      ...(crmLead ? { ...cleaned, id: crypto.randomUUID(), crmLeadId: crmLead.id } : cleaned),
      openCampanhaAfter: createCampaignChoice === "yes",
    };
    onSave(payload);
    // Grava o vínculo de volta no lead — mesmo `upsertLead` que o resto do
    // Comercial já usa, sem tabela de vínculo nova. Preserva o histórico
    // (o servidor sempre mantém `extra.history` no caminho de update) e
    // nunca duplica/apaga o registro original.
    if (crmLead && payload.id) {
      void upsertLeadFn({ data: { ...crmLead, clienteId: payload.id } }).catch(() => {
        /* vínculo é um "nice to have" pós-criação — falha aqui não deve
         * impedir nem reverter a criação do cliente, que já aconteceu. */
      });
    }
  };

  const responsaveisPendentes = [
    !form.responsavel.trim() && "responsável",
    !form.email.trim() && "e-mail",
    !form.whatsapp.trim() && "WhatsApp",
    !form.responsavelInterno.trim() && "responsável interno",
    !form.clienteDesde.trim() && "cliente desde",
  ].filter(Boolean) as string[];

  return (
    <>
      <Sheet open={open} onOpenChange={(v) => !v && void requestClose()}>
        <SheetContent className="flex h-full w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
          <div className="border-b border-border/60 px-6 py-5">
            <SheetTitle>{isEdit ? "Editar cliente" : "Novo cliente"}</SheetTitle>
            <SheetDescription className="sr-only">Cadastro de cliente da agência</SheetDescription>
          </div>

          {/* Indicador de etapa — versão compacta "Etapa X de Y" + barra de
           * progresso, mesmo padrão mobile do `VincularCampanhaDialog`,
           * usado aqui em toda largura (wizard mais simples, sem precisar
           * do stepper cheio com ícones). */}
          <div className="border-b border-border/60 px-6 py-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-foreground">
                {stepIndex + 1}. {STEP_LABEL[step]}
              </span>
              <span className="text-text-secondary">
                Etapa {stepIndex + 1} de {steps.length}
              </span>
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-brand transition-all"
                style={{ width: `${((stepIndex + 1) / steps.length) * 100}%` }}
              />
            </div>
          </div>

          <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-5">
              {step === "origem" && (
                <div className="space-y-4">
                  <p className="text-xs text-text-secondary">
                    Como este cliente vai entrar no sistema?
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { value: "scratch" as const, label: "Criar do zero" },
                      { value: "crm-import" as const, label: "Importar do Comercial" },
                    ].map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => void requestSwitchOrigin(opt.value)}
                        aria-pressed={origin === opt.value}
                        className={`rounded-lg border p-4 text-left text-sm font-medium transition-colors ${
                          origin === opt.value
                            ? "border-brand bg-brand-subtle text-text-brand"
                            : "border-border bg-card text-foreground hover:bg-muted"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>

                  {origin === "crm-import" &&
                    (crmLead ? (
                      <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-4">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-semibold text-foreground">
                            {crmLead.company || crmLead.name}
                          </span>
                          <Badge
                            variant="secondary"
                            size="sm"
                            className={OPPORTUNITY_STAGE_TONE[legacyStage(crmLead.stage)]}
                          >
                            {OPPORTUNITY_STAGE_LABEL[legacyStage(crmLead.stage)]}
                          </Badge>
                        </div>
                        <p className="text-xs text-text-secondary">
                          {[crmLead.contact, crmLead.email, crmLead.phone]
                            .filter(Boolean)
                            .join(" · ") || "Sem contato registrado"}
                        </p>
                        {crmLead.responsible && (
                          <p className="text-xs text-text-secondary">
                            Responsável: {crmLead.responsible}
                          </p>
                        )}
                        <p className="text-xs text-text-secondary">
                          Status sugerido:{" "}
                          <strong className="text-foreground">
                            {crmLeadIsLost
                              ? "não recomendado (lead perdido)"
                              : CLIENTE_STATUS_LABEL[
                                  defaultClienteStatusForOrigin("crm-import", crmLead.stage)
                                ]}
                          </strong>
                        </p>
                        {crmLeadIsLost && (
                          <div className="space-y-2 rounded-md border border-warning/40 bg-warning-soft px-3 py-2.5">
                            <p className="text-xs text-warning-soft-foreground">
                              Este registro está marcado como <strong>perdido</strong> no Comercial
                              {crmLead.lossReason ? ` (motivo: ${crmLead.lossReason})` : ""}. Não
                              recomendamos criar um cliente a partir dele — se for só um cadastro
                              histórico, ele entra como <strong>Encerrado</strong>.
                            </p>
                            <label className="flex items-center gap-2 text-xs font-medium text-foreground">
                              <input
                                type="checkbox"
                                checked={lostLeadConfirmed}
                                onChange={(e) => setLostLeadConfirmed(e.target.checked)}
                                className="h-3.5 w-3.5 accent-[var(--brand)]"
                              />
                              Entendo e quero prosseguir mesmo assim
                            </label>
                          </div>
                        )}
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setCrmLead(null)}
                        >
                          Trocar registro
                        </Button>
                      </div>
                    ) : (
                      <div className="flex h-72 flex-col">
                        <p className="mb-3 text-xs text-text-secondary">
                          Selecione um registro do Comercial pra pré-preencher o cadastro — você
                          ainda revisa e confirma antes de criar.
                        </p>
                        <Command className="flex-1 rounded-lg border border-border">
                          <CommandInput placeholder="Buscar por nome, empresa, e-mail ou telefone..." />
                          <CommandList className="max-h-none flex-1">
                            {leadsLoading ? (
                              <p className="p-4 text-center text-sm text-text-secondary">
                                Carregando...
                              </p>
                            ) : (
                              <CommandEmpty>Nenhum registro elegível encontrado.</CommandEmpty>
                            )}
                            <CommandGroup>
                              {importableLeads.map((lead) => {
                                const stage = legacyStage(lead.stage);
                                return (
                                  <CommandItem
                                    key={lead.id}
                                    value={`${lead.name} ${lead.company ?? ""} ${lead.email ?? ""} ${lead.phone ?? ""}`}
                                    onSelect={() => applyLead(lead)}
                                    className="flex flex-col items-start gap-0.5 py-2.5"
                                  >
                                    <div className="flex w-full items-center justify-between gap-2">
                                      <span className="truncate text-sm font-medium text-foreground">
                                        {lead.company || lead.name}
                                      </span>
                                      <Badge variant="secondary" size="sm" className="shrink-0">
                                        {OPPORTUNITY_STAGE_LABEL[stage]}
                                      </Badge>
                                    </div>
                                    <span className="truncate text-xs text-text-secondary">
                                      {[
                                        lead.contact,
                                        lead.email,
                                        lead.phone,
                                        lead.responsible && `Resp.: ${lead.responsible}`,
                                      ]
                                        .filter(Boolean)
                                        .join(" · ") || "Sem contato registrado"}
                                    </span>
                                  </CommandItem>
                                );
                              })}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </div>
                    ))}
                </div>
              )}

              {step === "status" && (
                <div className="space-y-3">
                  <p className="text-xs text-text-secondary">
                    Qual o status inicial deste cliente? Você pode trocar depois.
                  </p>
                  <div className="space-y-2">
                    {STATUS_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setStatus(opt.value)}
                        aria-pressed={status === opt.value}
                        className={`flex w-full items-start gap-3 rounded-lg border p-3.5 text-left transition-colors ${
                          status === opt.value
                            ? "border-brand bg-brand-subtle"
                            : "border-border bg-card hover:bg-muted"
                        }`}
                      >
                        <span
                          className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                            status === opt.value
                              ? "border-brand bg-brand text-brand-foreground"
                              : "border-input"
                          }`}
                        >
                          {status === opt.value && <Check className="h-2.5 w-2.5" />}
                        </span>
                        <span>
                          <span className="block text-sm font-medium text-foreground">
                            {CLIENTE_STATUS_LABEL[opt.value]}
                          </span>
                          <span className="mt-0.5 block text-xs text-text-secondary">
                            {opt.description}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {step === "empresa" && (
                <>
                  {possibleDuplicate && duplicateMatch && (
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-warning/40 bg-warning-soft px-3 py-2.5">
                      <p className="text-xs text-warning-soft-foreground">
                        Já existe um cliente parecido: <strong>{possibleDuplicate.empresa}</strong>{" "}
                        ({CLIENTE_DUPLICATE_REASON_LABEL[duplicateMatch.reason]})
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => selectExistingCliente(possibleDuplicate)}
                      >
                        Usar cliente existente
                      </Button>
                    </div>
                  )}
                  <section className="space-y-3">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
                      Empresa
                    </h3>
                    <div className="flex items-center gap-4">
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => fileRef.current?.click()}
                          className="rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                          aria-label={form.photo ? "Substituir logo" : "Adicionar logo"}
                        >
                          <ClienteLogo photo={form.photo} empresa={form.empresa || "?"} size="lg" />
                        </button>
                        {form.photo && (
                          <button
                            type="button"
                            onClick={() => update("photo", undefined)}
                            className="absolute -right-1 -bottom-1 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-card text-text-secondary shadow-sm hover:text-foreground"
                            aria-label="Remover logo"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <input
                          ref={fileRef}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => onPhoto(e.target.files?.[0])}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => fileRef.current?.click()}
                        className="inline-flex items-center gap-1.5 rounded-md border border-input px-3 py-1.5 text-xs font-medium hover:bg-muted"
                      >
                        <ImageIcon className="h-3.5 w-3.5" />
                        {form.photo ? "Substituir logo" : "Adicionar logo"}
                      </button>
                    </div>
                    <Field label="Nome da empresa" fromCrm={crmFields.has("empresa")}>
                      <input
                        value={form.empresa}
                        onChange={(e) => update("empresa", e.target.value)}
                        placeholder="Ex: Acme Corp"
                        required
                        className={inputCls}
                      />
                    </Field>
                  </section>

                  <section className="space-y-3 border-t border-border/60 pt-5">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
                      Contato
                    </h3>
                    <Field label="Nome do responsável" fromCrm={crmFields.has("responsavel")}>
                      <input
                        value={form.responsavel}
                        onChange={(e) => update("responsavel", e.target.value)}
                        placeholder="Nome completo"
                        className={inputCls}
                      />
                    </Field>
                    <Field label="E-mail do cliente" fromCrm={crmFields.has("email")}>
                      <input
                        type="email"
                        value={form.email}
                        onChange={(e) => update("email", e.target.value)}
                        placeholder="email@empresa.com"
                        className={inputCls}
                      />
                    </Field>
                    <Field label="WhatsApp do cliente" fromCrm={crmFields.has("whatsapp")}>
                      <input
                        type="tel"
                        value={form.whatsapp}
                        onChange={(e) => update("whatsapp", e.target.value)}
                        placeholder="+55 (00) 00000-0000"
                        className={inputCls}
                      />
                    </Field>
                  </section>

                  <section className="space-y-3 border-t border-border/60 pt-5">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
                      Gestão interna
                    </h3>
                    <Field label="Responsável interno">
                      <NativeSelect
                        value={form.responsavelInterno}
                        onChange={(e) => update("responsavelInterno", e.target.value)}
                      >
                        <option value="">Selecione um membro</option>
                        {members.map((m) => (
                          <option key={m.id} value={m.name}>
                            {m.name}
                          </option>
                        ))}
                      </NativeSelect>
                    </Field>
                    <Field label="Cliente desde">
                      <DateField
                        value={form.clienteDesde || undefined}
                        onChange={(v) => update("clienteDesde", v ?? "")}
                        className={inputCls}
                      />
                    </Field>
                  </section>
                </>
              )}

              {step === "contexto" && (
                <div className="space-y-4">
                  <p className="text-xs text-text-secondary">
                    Contexto opcional da negociação — ajuda quem for continuar essa conversa.
                  </p>
                  <Field label="Próximo passo">
                    <input
                      value={form.proximoPasso ?? ""}
                      onChange={(e) => update("proximoPasso", e.target.value)}
                      placeholder="Ex: enviar proposta revisada"
                      className={inputCls}
                    />
                  </Field>
                  <Field label="Previsão de fechamento">
                    <DateField
                      value={form.previsaoFechamento || undefined}
                      onChange={(v) => update("previsaoFechamento", v ?? "")}
                      className={inputCls}
                    />
                  </Field>
                  <Field label="Observações">
                    <textarea
                      value={form.observacaoNegociacao ?? ""}
                      onChange={(e) => update("observacaoNegociacao", e.target.value)}
                      rows={3}
                      placeholder="Contexto adicional sobre a negociação..."
                      className={`${inputCls} h-auto resize-none py-2`}
                    />
                  </Field>
                  <Button type="button" variant="ghost" size="sm" onClick={skipContexto}>
                    Pular esta etapa
                  </Button>
                </div>
              )}

              {step === "campanha" && (
                <div className="space-y-3">
                  <p className="text-xs text-text-secondary">Deseja criar uma campanha agora?</p>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => setCreateCampaignChoice("yes")}
                      aria-pressed={createCampaignChoice === "yes"}
                      className={`rounded-lg border p-4 text-left text-sm font-medium transition-colors ${
                        createCampaignChoice === "yes"
                          ? "border-brand bg-brand-subtle text-text-brand"
                          : "border-border bg-card text-foreground hover:bg-muted"
                      }`}
                    >
                      Criar campanha
                      <span className="mt-1 block text-xs font-normal text-text-secondary">
                        Abre o assistente de campanha logo após salvar o cliente.
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setCreateCampaignChoice("no")}
                      aria-pressed={createCampaignChoice === "no"}
                      className={`rounded-lg border p-4 text-left text-sm font-medium transition-colors ${
                        createCampaignChoice === "no"
                          ? "border-brand bg-brand-subtle text-text-brand"
                          : "border-border bg-card text-foreground hover:bg-muted"
                      }`}
                    >
                      Criar somente o cliente
                      <span className="mt-1 block text-xs font-normal text-text-secondary">
                        Você pode criar campanhas depois, a qualquer momento.
                      </span>
                    </button>
                  </div>
                </div>
              )}

              {step === "revisao" && (
                <div className="space-y-4">
                  <section className="space-y-2 rounded-lg border border-border bg-muted/30 p-4 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-text-secondary">Origem</span>
                      <span className="font-medium text-foreground">
                        {crmLead ? "Importado do Comercial" : "Criado do zero"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-text-secondary">Empresa</span>
                      <span className="font-medium text-foreground">{form.empresa || "—"}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-text-secondary">Contato</span>
                      <span className="font-medium text-foreground">
                        {form.responsavel || "Não informado"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-text-secondary">Responsável interno</span>
                      <span className="font-medium text-foreground">
                        {form.responsavelInterno || "Não informado"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-text-secondary">Status inicial</span>
                      <Badge
                        variant={
                          status === "active"
                            ? "success"
                            : status === "capture"
                              ? "warning"
                              : "secondary"
                        }
                      >
                        {CLIENTE_STATUS_LABEL[status]}
                      </Badge>
                    </div>
                  </section>

                  {responsaveisPendentes.length > 0 && (
                    <p className="text-xs text-text-secondary">
                      Campos que ficaram vazios: {responsaveisPendentes.join(", ")}.
                    </p>
                  )}

                  {status === "capture" && (
                    <p className="rounded-lg border border-warning/40 bg-warning-soft px-3 py-2.5 text-xs text-warning-soft-foreground">
                      Este cliente será criado como Negociando.
                    </p>
                  )}

                  {createCampaignChoice === "yes" && (
                    <p className="rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-xs text-text-secondary">
                      Uma campanha será criada em seguida e ficará em Negociação — não conta como
                      receita ou campanha ativa até você ativá-la.
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-2 border-t border-border/60 px-6 py-4">
              <Button
                type="button"
                variant="outline"
                size="comfortable"
                onClick={() => void requestClose()}
              >
                Cancelar
              </Button>
              <div className="flex items-center gap-2">
                {stepIndex > 0 && (
                  <Button type="button" variant="outline" size="comfortable" onClick={goBack}>
                    Voltar
                  </Button>
                )}
                {stepIndex < steps.length - 1 ? (
                  <Button
                    type="button"
                    variant="primary"
                    size="comfortable"
                    disabled={!canContinue}
                    onClick={goNext}
                  >
                    Continuar
                  </Button>
                ) : (
                  <Button type="submit" variant="primary" size="comfortable" isLoading={saving}>
                    {isEdit ? "Salvar alterações" : "Criar cliente"}
                  </Button>
                )}
              </div>
            </div>
          </form>
        </SheetContent>
      </Sheet>
      {confirmDialog}
    </>
  );
}
