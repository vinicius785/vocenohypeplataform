import { useEffect, useRef, useState } from "react";
import { ImageIcon, X } from "lucide-react";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { DateField } from "@/components/ui/date-field";
import { loadMembers } from "@/lib/chat-store";
import type { Cliente } from "@/lib/clientes-store";
import { useConfirm } from "@/hooks/use-confirm";
import { ClienteLogo } from "./ClienteLogo";

type ClienteForm = Omit<Cliente, "id" | "campanhas">;

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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-text-secondary">{label}</span>
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
  onClose,
  onSave,
}: {
  open: boolean;
  initial: Cliente | null;
  onClose: () => void;
  onSave: (form: ClienteForm) => void;
}) {
  const [form, setForm] = useState<ClienteForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { confirm, confirmDialog } = useConfirm();
  const members = loadMembers();

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
        : emptyForm,
    );
    setSaving(false);
  }, [open, initial]);

  const update = <K extends keyof ClienteForm>(k: K, v: ClienteForm[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

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
    if (!form.empresa.trim()) return;
    setSaving(true);
    onSave(form);
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
            </div>

            <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-5">
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
                <Field label="Nome da empresa">
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
                <Field label="Nome do responsável">
                  <input
                    value={form.responsavel}
                    onChange={(e) => update("responsavel", e.target.value)}
                    placeholder="Nome completo"
                    className={inputCls}
                  />
                </Field>
                <Field label="E-mail do cliente">
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => update("email", e.target.value)}
                    placeholder="email@empresa.com"
                    className={inputCls}
                  />
                </Field>
                <Field label="WhatsApp do cliente">
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
