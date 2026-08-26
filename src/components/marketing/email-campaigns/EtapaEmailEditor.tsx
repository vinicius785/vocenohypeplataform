import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  upsertCampaignStep,
  upsertEmailTemplate,
  type listEmailTemplates,
} from "@/lib/email-campaigns.functions";
import {
  RECIPIENT_RULES,
  RECIPIENT_RULE_LABEL,
  SEND_MODES,
  SEND_MODE_LABEL,
  EMAIL_TEMPLATE_TOKENS,
  type RecipientRule,
  type SendMode,
} from "@/lib/email-campaigns-constants";
import { isoToLocalInput, localInputToIso } from "./email-ui-utils";

type Template = Awaited<ReturnType<typeof listEmailTemplates>>[number];
type Step = {
  id: string;
  campaign_id: string;
  template_id: string | null;
  internal_name: string | null;
  subject: string | null;
  body_html: string | null;
  recipient_rule: string;
  send_mode: string;
  scheduled_at: string | null;
};

/**
 * Editor de uma etapa "enviar e-mail" — painel lateral (edição inline
 * quando simples vive direto no bloco do fluxo; isto é "detalhe maior",
 * então vira painel, nunca modal-em-cima-de-modal).
 */
export function EtapaEmailEditor({
  open,
  onOpenChange,
  campaignId,
  step,
  templates,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaignId: string;
  step?: Step;
  templates: Template[];
  onSaved: () => void;
}) {
  const saveStepFn = useServerFn(upsertCampaignStep);
  const saveTemplateFn = useServerFn(upsertEmailTemplate);

  const [internalName, setInternalName] = useState("");
  const [templateId, setTemplateId] = useState<string>("");
  const [subject, setSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [recipientRule, setRecipientRule] = useState<RecipientRule>("todos");
  const [sendMode, setSendMode] = useState<SendMode>("apos_anterior");
  const [scheduledAt, setScheduledAt] = useState("");
  const [saveAsTemplate, setSaveAsTemplate] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setInternalName(step?.internal_name ?? "");
    setTemplateId(step?.template_id ?? "");
    setSubject(step?.subject ?? "");
    setBodyHtml(step?.body_html ?? "");
    setRecipientRule((step?.recipient_rule as RecipientRule) ?? "todos");
    setSendMode((step?.send_mode as SendMode) ?? "apos_anterior");
    setScheduledAt(isoToLocalInput(step?.scheduled_at));
    setSaveAsTemplate(false);
    setNewTemplateName("");
  }, [open, step]);

  const applyTemplate = (id: string) => {
    setTemplateId(id);
    const t = templates.find((x) => x.id === id);
    if (t) {
      setSubject(t.subject);
      setBodyHtml(t.body_html);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      await saveStepFn({
        data: {
          id: step?.id,
          campaignId,
          kind: "email",
          templateId: templateId || null,
          internalName,
          subject,
          bodyHtml,
          recipientRule,
          sendMode,
          scheduledAt: sendMode === "agendado" ? localInputToIso(scheduledAt) : null,
        },
      });
      if (saveAsTemplate && newTemplateName.trim()) {
        await saveTemplateFn({ data: { name: newTemplateName.trim(), subject, bodyHtml } });
      }
      onSaved();
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{step ? "Editar e-mail" : "Novo e-mail"}</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-4 pb-8">
          <label className="block space-y-1">
            <span className="text-xs font-medium text-foreground">Nome interno</span>
            <input
              value={internalName}
              onChange={(e) => setInternalName(e.target.value)}
              placeholder="Ex: E-mail 1 — Boas-vindas"
              className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
            />
          </label>

          {templates.length > 0 && (
            <label className="block space-y-1">
              <span className="text-xs font-medium text-foreground">Conteúdo</span>
              <select
                value={templateId}
                onChange={(e) => applyTemplate(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">Começar do zero</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    Usar template: {t.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="block space-y-1">
            <span className="text-xs font-medium text-foreground">Assunto</span>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Oi {{nome}}, ..."
              className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
            />
          </label>

          <div className="space-y-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-medium text-foreground">Conteúdo (HTML)</span>
              <div className="flex flex-wrap gap-1">
                {EMAIL_TEMPLATE_TOKENS.map((t) => (
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
              rows={8}
              placeholder="<p>Oi {{nome}}, ...</p>"
              className="w-full rounded-md border border-border bg-background px-2.5 py-2 font-mono text-xs outline-none focus:ring-1 focus:ring-ring"
            />
            <p className="text-[11px] text-muted-foreground">
              O link de descadastro é adicionado automaticamente no rodapé de todo envio.
            </p>
          </div>

          <label className="flex items-center gap-2 text-xs text-foreground">
            <input
              type="checkbox"
              checked={saveAsTemplate}
              onChange={(e) => setSaveAsTemplate(e.target.checked)}
            />
            Salvar este conteúdo como um novo template
          </label>
          {saveAsTemplate && (
            <input
              value={newTemplateName}
              onChange={(e) => setNewTemplateName(e.target.value)}
              placeholder="Nome do template"
              className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
            />
          )}

          <label className="block space-y-1">
            <span className="text-xs font-medium text-foreground">Destinatários</span>
            <select
              value={recipientRule}
              onChange={(e) => setRecipientRule(e.target.value as RecipientRule)}
              className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
            >
              {RECIPIENT_RULES.map((r) => (
                <option key={r} value={r}>
                  {RECIPIENT_RULE_LABEL[r]}
                </option>
              ))}
            </select>
          </label>

          <label className="block space-y-1">
            <span className="text-xs font-medium text-foreground">Quando enviar</span>
            <select
              value={sendMode}
              onChange={(e) => setSendMode(e.target.value as SendMode)}
              className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
            >
              {SEND_MODES.map((m) => (
                <option key={m} value={m}>
                  {SEND_MODE_LABEL[m]}
                </option>
              ))}
            </select>
          </label>
          {sendMode === "agendado" && (
            <label className="block space-y-1">
              <span className="text-xs font-medium text-foreground">Data e hora</span>
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
              />
            </label>
          )}

          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || !internalName.trim() || !subject.trim() || !bodyHtml.trim()}
            className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {saving ? "Salvando..." : "Salvar e-mail"}
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
