import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Trash2, Pencil, ChevronUp, ChevronDown, X, Loader2, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  getEmailProviderSettings,
  saveEmailProviderSettings,
  listEmailTemplates,
  upsertEmailTemplate,
  deleteEmailTemplate,
  listEmailFlows,
  upsertEmailFlow,
  deleteEmailFlow,
} from "@/lib/email-flows.functions";
import {
  EMAIL_AUDIENCES,
  EMAIL_AUDIENCE_LABEL,
  EMAIL_TEMPLATE_TOKENS,
  EMAIL_TRIGGER_TYPES,
  OPPORTUNITY_STAGE_OPTIONS,
  INFLU_STATUS_OPTIONS,
  type EmailAudience,
  type EmailFlowStep,
} from "@/lib/email-flows-constants";

/**
 * Aba "Fluxos de e-mail" do projeto Marketing (feature `fluxos_email` em
 * projetos.ts, mesmo padrão de "AEO Monitor": feature global, sem dados
 * presos a este projeto específico — email_flows/email_templates são
 * compartilhados entre quem tiver a feature habilitada). Gestão em si é
 * admin-only (RLS de email_flows/email_templates/email_provider_settings
 * já exige is_admin() — o aviso abaixo só evita mostrar formulário pra
 * quem vai só tomar erro ao salvar).
 */

type EmailTemplate = Awaited<ReturnType<typeof listEmailTemplates>>[number];
type EmailFlow = Awaited<ReturnType<typeof listEmailFlows>>[number];
type Tab = "fluxos" | "templates" | "config";

export function FluxosEmailPanel() {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [tab, setTab] = useState<Tab>("fluxos");
  const [view, setView] = useState<
    | { kind: "list" }
    | { kind: "flow"; flow?: EmailFlow }
    | { kind: "template"; template?: EmailTemplate }
  >({ kind: "list" });

  const listFlowsFn = useServerFn(listEmailFlows);
  const listTemplatesFn = useServerFn(listEmailTemplates);
  const deleteFlowFn = useServerFn(deleteEmailFlow);
  const deleteTemplateFn = useServerFn(deleteEmailTemplate);

  const [flows, setFlows] = useState<EmailFlow[] | null>(null);
  const [templates, setTemplates] = useState<EmailTemplate[] | null>(null);

  const reload = () => {
    void listFlowsFn().then(setFlows);
    void listTemplatesFn().then(setTemplates);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user || cancelled) return;
      const { data: ok } = await supabase.rpc("is_admin", { _user_id: u.user.id });
      if (!cancelled) setIsAdmin(Boolean(ok));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (isAdmin) reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  if (isAdmin === null) {
    return <div className="h-40 animate-pulse rounded-lg border border-border bg-muted/30" />;
  }
  if (isAdmin === false) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-background p-6 text-center">
        <p className="text-xs text-muted-foreground">
          Apenas administradores podem ver e gerenciar os fluxos de e-mail.
        </p>
      </div>
    );
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: "fluxos", label: "Fluxos" },
    { key: "templates", label: "Templates" },
    { key: "config", label: "Configuração" },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-1 border-b border-border">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => {
              setTab(t.key);
              setView({ kind: "list" });
            }}
            className={`inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-medium transition-colors ${
              tab === t.key
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "config" && <EmailProviderSection />}

      {tab === "fluxos" && view.kind === "list" && (
        <FlowsList
          flows={flows}
          templates={templates ?? []}
          onEdit={(flow) => setView({ kind: "flow", flow })}
          onNew={() => setView({ kind: "flow" })}
          onDelete={async (id) => {
            await deleteFlowFn({ data: { id } });
            reload();
          }}
        />
      )}
      {tab === "templates" && view.kind === "list" && (
        <TemplatesList
          templates={templates}
          onEdit={(template) => setView({ kind: "template", template })}
          onNew={() => setView({ kind: "template" })}
          onDelete={async (id) => {
            await deleteTemplateFn({ data: { id } });
            reload();
          }}
        />
      )}
      {view.kind === "flow" && (
        <FlowEditor
          flow={view.flow}
          templates={templates ?? []}
          onBack={() => setView({ kind: "list" })}
          onSaved={() => {
            reload();
            setView({ kind: "list" });
          }}
        />
      )}
      {view.kind === "template" && (
        <TemplateEditor
          template={view.template}
          onBack={() => setView({ kind: "list" })}
          onSaved={() => {
            reload();
            setView({ kind: "list" });
          }}
        />
      )}
    </div>
  );
}

// ============================================================
// Configuração do provedor (Resend)
// ============================================================

function EmailProviderSection() {
  const getFn = useServerFn(getEmailProviderSettings);
  const saveFn = useServerFn(saveEmailProviderSettings);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [fromEmail, setFromEmail] = useState("");
  const [fromName, setFromName] = useState("");
  const [replyTo, setReplyTo] = useState("");
  const [sendingDomain, setSendingDomain] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getFn()
      .then((r) => {
        setHasApiKey(r.hasApiKey);
        setFromEmail(r.fromEmail);
        setFromName(r.fromName);
        setReplyTo(r.replyTo);
        setSendingDomain(r.sendingDomain);
      })
      .finally(() => setLoading(false));
  }, [getFn]);

  const save = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await saveFn({
        data: { fromEmail, fromName, replyTo, sendingDomain, apiKey: apiKey || undefined },
      });
      if (apiKey) setHasApiKey(true);
      setApiKey("");
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="h-40 animate-pulse rounded-lg bg-muted/30" />;

  return (
    <div className="max-w-xl space-y-2.5 rounded-lg border border-border bg-background p-5">
      <div>
        <h3 className="text-sm font-semibold text-foreground">Provedor de e-mail (Resend)</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Chave de API e remetente usados pra mandar os e-mails dos fluxos de automação.
        </p>
      </div>
      <label className="block space-y-1">
        <span className="text-xs font-medium text-foreground">Chave de API da Resend</span>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={hasApiKey ? "•••••••••••••••• (já configurada)" : "re_xxxxxxxxxxxxxxxx"}
          className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs outline-none focus:ring-1 focus:ring-ring"
        />
      </label>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className="text-xs font-medium text-foreground">E-mail de envio</span>
          <input
            type="email"
            value={fromEmail}
            onChange={(e) => setFromEmail(e.target.value)}
            placeholder="contato@seudominio.com.br"
            className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs outline-none focus:ring-1 focus:ring-ring"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-foreground">Nome do remetente</span>
          <input
            value={fromName}
            onChange={(e) => setFromName(e.target.value)}
            placeholder="Você no Hype"
            className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs outline-none focus:ring-1 focus:ring-ring"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-foreground">Responder para (opcional)</span>
          <input
            type="email"
            value={replyTo}
            onChange={(e) => setReplyTo(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs outline-none focus:ring-1 focus:ring-ring"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-foreground">Domínio de envio</span>
          <input
            value={sendingDomain}
            onChange={(e) => setSendingDomain(e.target.value)}
            placeholder="seudominio.com.br"
            className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs outline-none focus:ring-1 focus:ring-ring"
          />
        </label>
      </div>
      <p className="text-[11px] text-muted-foreground">
        O domínio precisa estar verificado na Resend (registros DNS SPF/DKIM) antes de enviar de
        verdade.
      </p>
      <button
        type="button"
        onClick={() => void save()}
        disabled={saving || !fromEmail}
        className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
        {saved ? "Salvo!" : saving ? "Salvando..." : "Salvar"}
      </button>
    </div>
  );
}

// ============================================================
// Lista de fluxos
// ============================================================

function FlowsList({
  flows,
  templates,
  onEdit,
  onNew,
  onDelete,
}: {
  flows: EmailFlow[] | null;
  templates: EmailTemplate[];
  onEdit: (flow: EmailFlow) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
}) {
  if (!flows) return <div className="h-24 animate-pulse rounded-lg bg-muted/30" />;
  return (
    <div className="max-w-2xl space-y-3">
      <button
        type="button"
        onClick={onNew}
        disabled={templates.length === 0}
        className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Plus className="h-3.5 w-3.5" /> Novo fluxo
      </button>
      {templates.length === 0 && (
        <p className="text-xs text-muted-foreground">
          Crie pelo menos um template antes de montar um fluxo.
        </p>
      )}
      {flows.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhum fluxo criado ainda.</p>
      ) : (
        <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
          {flows.map((f) => {
            const steps = (f.steps as EmailFlowStep[]) ?? [];
            const triggerDef = EMAIL_TRIGGER_TYPES[f.audience as EmailAudience]?.find(
              (t) => t.type === f.trigger_type,
            );
            return (
              <div key={f.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                <button
                  type="button"
                  onClick={() => onEdit(f)}
                  className="min-w-0 flex-1 text-left hover:underline"
                >
                  <p className="truncate font-medium text-foreground">{f.name}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {EMAIL_AUDIENCE_LABEL[f.audience as EmailAudience]} ·{" "}
                    {triggerDef?.label ?? f.trigger_type} · {steps.length}{" "}
                    {steps.length === 1 ? "passo" : "passos"}
                  </p>
                </button>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                    f.active
                      ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {f.active ? "Ativo" : "Pausado"}
                </span>
                <button
                  type="button"
                  onClick={() => onEdit(f)}
                  className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label="Editar"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(f.id)}
                  className="shrink-0 rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  aria-label="Excluir"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Lista de templates
// ============================================================

function TemplatesList({
  templates,
  onEdit,
  onNew,
  onDelete,
}: {
  templates: EmailTemplate[] | null;
  onEdit: (t: EmailTemplate) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
}) {
  if (!templates) return <div className="h-24 animate-pulse rounded-lg bg-muted/30" />;
  return (
    <div className="max-w-2xl space-y-3">
      <button
        type="button"
        onClick={onNew}
        className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90"
      >
        <Plus className="h-3.5 w-3.5" /> Novo template
      </button>
      {templates.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhum template criado ainda.</p>
      ) : (
        <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
          {templates.map((t) => (
            <div key={t.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
              <button
                type="button"
                onClick={() => onEdit(t)}
                className="min-w-0 flex-1 text-left hover:underline"
              >
                <p className="truncate font-medium text-foreground">{t.name}</p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {EMAIL_AUDIENCE_LABEL[t.audience as EmailAudience]} · {t.subject}
                </p>
              </button>
              <button
                type="button"
                onClick={() => onEdit(t)}
                className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Editar"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => onDelete(t.id)}
                className="shrink-0 rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                aria-label="Excluir"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Editor de template
// ============================================================

function TemplateEditor({
  template,
  onBack,
  onSaved,
}: {
  template?: EmailTemplate;
  onBack: () => void;
  onSaved: () => void;
}) {
  const saveFn = useServerFn(upsertEmailTemplate);
  const [audience, setAudience] = useState<EmailAudience>(
    (template?.audience as EmailAudience) ?? "lead",
  );
  const [name, setName] = useState(template?.name ?? "");
  const [subject, setSubject] = useState(template?.subject ?? "");
  const [bodyHtml, setBodyHtml] = useState(template?.body_html ?? "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await saveFn({ data: { id: template?.id, audience, name, subject, bodyHtml } });
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-4">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Voltar
      </button>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className="text-xs font-medium text-foreground">Nome (interno)</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex: Boas-vindas ao lead"
            className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-foreground">Audiência</span>
          <select
            value={audience}
            onChange={(e) => setAudience(e.target.value as EmailAudience)}
            className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
          >
            {EMAIL_AUDIENCES.map((a) => (
              <option key={a} value={a}>
                {EMAIL_AUDIENCE_LABEL[a]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="block space-y-1">
        <span className="text-xs font-medium text-foreground">Assunto</span>
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Oi {{nome}}, vamos conversar?"
          className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
        />
      </label>

      <div className="space-y-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-medium text-foreground">Corpo (HTML)</span>
          <div className="flex flex-wrap gap-1">
            {EMAIL_TEMPLATE_TOKENS[audience].map((t) => (
              <button
                key={t.token}
                type="button"
                onClick={() => setBodyHtml((v) => `${v}{{${t.token}}}`)}
                title={t.label}
                className="rounded-full border border-dashed border-border px-2 py-0.5 text-[10px] font-medium text-muted-foreground hover:border-foreground/30 hover:text-foreground"
              >
                {`{{${t.token}}}`}
              </button>
            ))}
          </div>
        </div>
        <textarea
          value={bodyHtml}
          onChange={(e) => setBodyHtml(e.target.value)}
          rows={10}
          placeholder="<p>Oi {{nome}}, ...</p>"
          className="w-full rounded-md border border-border bg-background px-2.5 py-2 font-mono text-xs outline-none focus:ring-1 focus:ring-ring"
        />
        <p className="text-[11px] text-muted-foreground">
          HTML puro — o link de descadastro é adicionado automaticamente no rodapé de todo envio.
        </p>
      </div>

      <button
        type="button"
        onClick={() => void save()}
        disabled={saving || !name.trim() || !subject.trim()}
        className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
        {saving ? "Salvando..." : "Salvar template"}
      </button>
    </div>
  );
}

// ============================================================
// Editor de fluxo
// ============================================================

function FlowEditor({
  flow,
  templates,
  onBack,
  onSaved,
}: {
  flow?: EmailFlow;
  templates: EmailTemplate[];
  onBack: () => void;
  onSaved: () => void;
}) {
  const saveFn = useServerFn(upsertEmailFlow);
  const [name, setName] = useState(flow?.name ?? "");
  const [audience, setAudience] = useState<EmailAudience>(
    (flow?.audience as EmailAudience) ?? "lead",
  );
  const [triggerType, setTriggerType] = useState(
    flow?.trigger_type ?? EMAIL_TRIGGER_TYPES.lead[0].type,
  );
  const [triggerConfig, setTriggerConfig] = useState<Record<string, string>>(
    (flow?.trigger_config as Record<string, string>) ?? {},
  );
  const [steps, setSteps] = useState<EmailFlowStep[]>((flow?.steps as EmailFlowStep[]) ?? []);
  const [active, setActive] = useState(flow?.active ?? true);
  const [saving, setSaving] = useState(false);

  const triggerOptions = EMAIL_TRIGGER_TYPES[audience];
  const currentTrigger = triggerOptions.find((t) => t.type === triggerType) ?? triggerOptions[0];

  useEffect(() => {
    if (!triggerOptions.some((t) => t.type === triggerType)) {
      setTriggerType(triggerOptions[0].type);
      setTriggerConfig({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audience]);

  const templatesForAudience = templates.filter((t) => t.audience === audience);

  const addStep = () => {
    if (templatesForAudience.length === 0) return;
    setSteps((s) => [
      ...s,
      { templateId: templatesForAudience[0].id, waitDays: s.length === 0 ? 0 : 2 },
    ]);
  };
  const moveStep = (i: number, dir: -1 | 1) => {
    setSteps((s) => {
      const next = [...s];
      const j = i + dir;
      if (j < 0 || j >= next.length) return s;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };
  const removeStep = (i: number) => setSteps((s) => s.filter((_, idx) => idx !== i));
  const updateStep = (i: number, patch: Partial<EmailFlowStep>) =>
    setSteps((s) => s.map((st, idx) => (idx === i ? { ...st, ...patch } : st)));

  const save = async () => {
    setSaving(true);
    try {
      await saveFn({
        data: { id: flow?.id, name, audience, triggerType, triggerConfig, steps, active },
      });
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  const configOptions =
    currentTrigger?.needsConfig === "stage"
      ? OPPORTUNITY_STAGE_OPTIONS
      : currentTrigger?.needsConfig === "status"
        ? INFLU_STATUS_OPTIONS
        : null;

  return (
    <div className="max-w-2xl space-y-4">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Voltar
      </button>

      <label className="block space-y-1">
        <span className="text-xs font-medium text-foreground">Nome do fluxo</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ex: Reativação de proposta parada"
          className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
        />
      </label>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className="text-xs font-medium text-foreground">Audiência</span>
          <select
            value={audience}
            onChange={(e) => setAudience(e.target.value as EmailAudience)}
            className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
          >
            {EMAIL_AUDIENCES.map((a) => (
              <option key={a} value={a}>
                {EMAIL_AUDIENCE_LABEL[a]}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-foreground">Gatilho</span>
          <select
            value={triggerType}
            onChange={(e) => {
              setTriggerType(e.target.value);
              setTriggerConfig({});
            }}
            className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
          >
            {triggerOptions.map((t) => (
              <option key={t.type} value={t.type}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {currentTrigger && <p className="text-[11px] text-muted-foreground">{currentTrigger.hint}</p>}

      {currentTrigger?.needsConfig === "tag" && (
        <label className="block space-y-1">
          <span className="text-xs font-medium text-foreground">Tag</span>
          <input
            value={triggerConfig.tag ?? ""}
            onChange={(e) => setTriggerConfig({ tag: e.target.value })}
            placeholder="quente"
            className="w-full max-w-xs rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
          />
        </label>
      )}
      {configOptions && (
        <label className="block space-y-1">
          <span className="text-xs font-medium text-foreground">
            {currentTrigger?.needsConfig === "stage" ? "Etapa" : "Status"}
          </span>
          <select
            value={triggerConfig[currentTrigger.needsConfig!] ?? ""}
            onChange={(e) => setTriggerConfig({ [currentTrigger!.needsConfig!]: e.target.value })}
            className="w-full max-w-xs rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">Selecione...</option>
            {configOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-foreground">Passos</span>
          <button
            type="button"
            onClick={addStep}
            disabled={templatesForAudience.length === 0}
            className="inline-flex items-center gap-1 rounded-md border border-dashed border-border px-2 py-1 text-[11px] font-medium text-muted-foreground hover:border-foreground/30 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Plus className="h-3 w-3" /> Adicionar passo
          </button>
        </div>
        {templatesForAudience.length === 0 && (
          <p className="text-[11px] text-muted-foreground">
            Nenhum template pra essa audiência ainda — crie um na aba Templates.
          </p>
        )}
        {steps.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhum passo adicionado.</p>
        ) : (
          <div className="space-y-1.5">
            {steps.map((step, i) => (
              <div
                key={i}
                className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/20 p-2"
              >
                <div className="flex shrink-0 flex-col">
                  <button
                    type="button"
                    onClick={() => moveStep(i, -1)}
                    disabled={i === 0}
                    className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                    aria-label="Mover pra cima"
                  >
                    <ChevronUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveStep(i, 1)}
                    disabled={i === steps.length - 1}
                    className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                    aria-label="Mover pra baixo"
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                </div>
                <span className="shrink-0 text-[11px] text-muted-foreground">
                  {i === 0 ? "Esperar" : "Depois, esperar"}
                </span>
                <input
                  type="number"
                  min={0}
                  value={step.waitDays}
                  onChange={(e) => updateStep(i, { waitDays: Math.max(0, Number(e.target.value)) })}
                  className="w-14 shrink-0 rounded-md border border-border bg-background px-1.5 py-1 text-xs outline-none focus:ring-1 focus:ring-ring"
                />
                <span className="shrink-0 text-[11px] text-muted-foreground">dia(s) e mandar</span>
                <select
                  value={step.templateId}
                  onChange={(e) => updateStep(i, { templateId: e.target.value })}
                  className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-ring"
                >
                  {templatesForAudience.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => removeStep(i)}
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                  aria-label="Remover passo"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <label className="flex items-center gap-2 text-xs font-medium text-foreground">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
        Fluxo ativo
      </label>

      <button
        type="button"
        onClick={() => void save()}
        disabled={
          saving ||
          !name.trim() ||
          steps.length === 0 ||
          !!(currentTrigger?.needsConfig && !triggerConfig[currentTrigger.needsConfig])
        }
        className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
        {saving ? "Salvando..." : "Salvar fluxo"}
      </button>
    </div>
  );
}
