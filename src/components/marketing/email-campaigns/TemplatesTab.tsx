import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Trash2, Pencil, Loader2, ArrowLeft } from "lucide-react";
import { useConfirm } from "@/hooks/use-confirm";
import {
  listEmailTemplates,
  upsertEmailTemplate,
  deleteEmailTemplate,
} from "@/lib/email-campaigns.functions";
import { EMAIL_TEMPLATE_TOKENS } from "@/lib/email-campaigns-constants";

type EmailTemplate = Awaited<ReturnType<typeof listEmailTemplates>>[number];

export function TemplatesTab() {
  const listFn = useServerFn(listEmailTemplates);
  const deleteFn = useServerFn(deleteEmailTemplate);
  const { confirm, confirmDialog } = useConfirm();

  const [templates, setTemplates] = useState<EmailTemplate[] | null>(null);
  const [editing, setEditing] = useState<EmailTemplate | "new" | null>(null);

  const reload = () => void listFn().then(setTemplates);
  useEffect(reload, [listFn]);

  if (editing !== null) {
    return (
      <>
        {confirmDialog}
        <TemplateEditor
          template={editing === "new" ? undefined : editing}
          onBack={() => setEditing(null)}
          onSaved={() => {
            reload();
            setEditing(null);
          }}
        />
      </>
    );
  }

  return (
    <div className="max-w-2xl space-y-3">
      {confirmDialog}
      <button
        type="button"
        onClick={() => setEditing("new")}
        className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90"
      >
        <Plus className="h-3.5 w-3.5" /> Novo template
      </button>
      {templates === null ? (
        <div className="h-24 animate-pulse rounded-lg bg-muted/30" />
      ) : templates.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhum template criado ainda.</p>
      ) : (
        <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
          {templates.map((t) => (
            <div key={t.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
              <button
                type="button"
                onClick={() => setEditing(t)}
                className="min-w-0 flex-1 text-left hover:underline"
              >
                <p className="truncate font-medium text-foreground">{t.name}</p>
                <p className="truncate text-[11px] text-muted-foreground">{t.subject}</p>
              </button>
              <button
                type="button"
                onClick={() => setEditing(t)}
                className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Editar"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={async () => {
                  const ok = await confirm(`Excluir o template "${t.name}"?`);
                  if (!ok) return;
                  await deleteFn({ data: { id: t.id } });
                  reload();
                }}
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
  const [name, setName] = useState(template?.name ?? "");
  const [subject, setSubject] = useState(template?.subject ?? "");
  const [bodyHtml, setBodyHtml] = useState(template?.body_html ?? "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await saveFn({ data: { id: template?.id, name, subject, bodyHtml } });
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

      <label className="block space-y-1">
        <span className="text-xs font-medium text-foreground">Nome (interno)</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ex: Boas-vindas"
          className="w-full max-w-sm rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
        />
      </label>

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
