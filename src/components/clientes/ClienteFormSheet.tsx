import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ImageIcon, Sparkles, X } from "lucide-react";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DateField } from "@/components/ui/date-field";
import { SegmentedControl } from "@/components/ui/segmented-control";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { loadMembers } from "@/lib/chat-store";
import { useClientes, type Cliente } from "@/lib/clientes-store";
import { useMyAccess, hasPermission } from "@/lib/permissions";
import { useConfirm } from "@/hooks/use-confirm";
import { listLeads, upsertLead } from "@/lib/comercial.functions";
import type { Lead } from "@/lib/comercial";
import { OPPORTUNITY_STAGE_LABEL, legacyStage } from "@/lib/comercial-engine";
import { ClienteLogo } from "./ClienteLogo";

type ClienteForm = Omit<Cliente, "id" | "campanhas">;
/** Campos que podem vir pré-preenchidos de uma importação do CRM — os
 * mesmos usados por `convertLeadToClienteEProjeto` (comercial/convertLead.ts),
 * só que aqui só entram no `useState` do formulário pra revisão, nunca
 * persistem sozinhos. */
const CRM_FILLABLE_FIELDS = ["empresa", "responsavel", "email", "whatsapp"] as const;
type CrmFillableField = (typeof CRM_FILLABLE_FIELDS)[number];

const emptyForm: ClienteForm = {
  photo: undefined,
  empresa: "",
  responsavel: "",
  responsavelInterno: "",
  email: "",
  whatsapp: "",
  clienteDesde: "",
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
      <span className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-text-secondary">
        {label}
        {fromCrm && (
          <Badge variant="brand" className="gap-1 text-[9px] normal-case">
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
    a.photo === b.photo
  );
}

/**
 * Drawer lateral de criação/edição — substitui o modal central antigo.
 * Reaproveita o padrão "sempre montado + reset no reabrir" já usado em
 * `EntryDialog.tsx`/`MeetingDialog.tsx` (necessário pro `Sheet` animar o
 * fechamento em vez de desmontar na hora). Nenhuma validação/campo novo:
 * mesmos 3 blocos de dado que o modal antigo tinha (empresa, contato,
 * gestão interna), só reorganizados em seções.
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
   * idêntico a antes: o chamador gera o id de sempre. */
  onSave: (form: ClienteForm & { id?: string }) => void;
}) {
  const [form, setForm] = useState<ClienteForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { confirm, confirmDialog } = useConfirm();
  const members = loadMembers();
  const clientesExistentes = useClientes();
  const access = useMyAccess();
  const canImportCrm = hasPermission(access, "comercial");

  const [mode, setMode] = useState<"zero" | "crm">("zero");
  const [crmFields, setCrmFields] = useState<Set<CrmFillableField>>(new Set());
  const [crmLead, setCrmLead] = useState<Lead | null>(null);
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [leadsLoading, setLeadsLoading] = useState(false);
  const listLeadsFn = useServerFn(listLeads);
  const upsertLeadFn = useServerFn(upsertLead);

  useEffect(() => {
    if (!open) return;
    setForm(
      initial
        ? {
            photo: initial.photo,
            empresa: initial.empresa,
            responsavel: initial.responsavel,
            responsavelInterno: initial.responsavelInterno,
            email: initial.email,
            whatsapp: initial.whatsapp,
            clienteDesde: initial.clienteDesde,
          }
        : { ...emptyForm, ...prefill },
    );
    setSaving(false);
    setMode("zero");
    setCrmFields(new Set());
    setCrmLead(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial]);

  // Carrega a lista de leads só quando o modo "Importar do CRM" é aberto
  // pela primeira vez — não busca nada se ninguém nunca clicar ali.
  useEffect(() => {
    if (mode !== "crm" || leads !== null) return;
    setLeadsLoading(true);
    void listLeadsFn()
      .then((rows) => setLeads(rows))
      .catch(() => setLeads([]))
      .finally(() => setLeadsLoading(false));
  }, [mode, leads, listLeadsFn]);

  const importableLeads = useMemo(() => (leads ?? []).filter((l) => !l.clienteId), [leads]);

  const possibleDuplicate = useMemo(() => {
    if (initial) return null;
    const empresa = form.empresa.trim().toLowerCase();
    const email = form.email.trim().toLowerCase();
    if (!empresa && !email) return null;
    return (
      clientesExistentes.find(
        (c) =>
          (empresa && c.empresa.trim().toLowerCase() === empresa) ||
          (email && c.email.trim().toLowerCase() === email),
      ) ?? null
    );
  }, [clientesExistentes, form.empresa, form.email, initial]);

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
    setMode("zero");
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

  const isDirty = () => {
    const baseline: ClienteForm = initial
      ? {
          photo: initial.photo,
          empresa: initial.empresa,
          responsavel: initial.responsavel,
          responsavelInterno: initial.responsavelInterno,
          email: initial.email,
          whatsapp: initial.whatsapp,
          clienteDesde: initial.clienteDesde,
        }
      : emptyForm;
    return !formsEqual(form, baseline);
  };

  const requestClose = async () => {
    if (isDirty()) {
      const ok = await confirm("Descartar as alterações não salvas neste cliente?");
      if (!ok) return;
    }
    onClose();
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.empresa.trim() || saving) return;
    setSaving(true);
    const payload: ClienteForm & { id?: string } = crmLead
      ? { ...form, id: crypto.randomUUID(), crmLeadId: crmLead.id }
      : form;
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

  return (
    <>
      <Sheet open={open} onOpenChange={(v) => !v && void requestClose()}>
        <SheetContent className="flex h-full w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
          <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="border-b border-border/60 px-6 py-5">
              <SheetTitle>{initial ? "Editar cliente" : "Novo cliente"}</SheetTitle>
              <SheetDescription className="sr-only">
                Cadastro de cliente da agência
              </SheetDescription>
              {!initial && canImportCrm && (
                <div className="mt-3">
                  <SegmentedControl
                    aria-label="Origem do cadastro"
                    value={mode}
                    onChange={setMode}
                    options={[
                      { value: "zero", label: "Criar do zero" },
                      { value: "crm", label: "Importar do CRM" },
                    ]}
                    size="sm"
                  />
                </div>
              )}
            </div>

            <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-5">
              {mode === "crm" ? (
                <div className="flex h-full flex-col">
                  <p className="mb-3 text-xs text-text-secondary">
                    Selecione um registro do Comercial pra pré-preencher o cadastro — você ainda
                    revisa e confirma antes de criar.
                  </p>
                  <Command className="flex-1 rounded-lg border border-border">
                    <CommandInput placeholder="Buscar por nome, empresa, e-mail ou telefone..." />
                    <CommandList className="max-h-none flex-1">
                      {leadsLoading ? (
                        <p className="p-4 text-center text-sm text-text-secondary">Carregando...</p>
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
                                <Badge variant="secondary" className="shrink-0 text-[10px]">
                                  {OPPORTUNITY_STAGE_LABEL[stage]}
                                </Badge>
                              </div>
                              <span className="truncate text-xs text-text-secondary">
                                {[lead.responsible, lead.email, lead.phone]
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
              ) : (
                <>
                  {possibleDuplicate && (
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-warning/40 bg-warning-soft px-3 py-2.5">
                      <p className="text-xs text-warning-soft-foreground">
                        Já existe um cliente parecido: <strong>{possibleDuplicate.empresa}</strong>
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
                      <select
                        value={form.responsavelInterno}
                        onChange={(e) => update("responsavelInterno", e.target.value)}
                        className={inputCls}
                      >
                        <option value="">Selecione um membro</option>
                        {members.map((m) => (
                          <option key={m.id} value={m.name}>
                            {m.name}
                          </option>
                        ))}
                      </select>
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
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-border/60 px-6 py-4">
              <Button
                type="button"
                variant="outline"
                size="comfortable"
                onClick={() => void requestClose()}
              >
                Cancelar
              </Button>
              <Button type="submit" variant="primary" size="comfortable" isLoading={saving}>
                {initial ? "Salvar alterações" : "Criar cliente"}
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
      {confirmDialog}
    </>
  );
}
