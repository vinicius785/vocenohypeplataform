import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ui/native-select";
import { DateField } from "@/components/ui/date-field";
import type { Member } from "@/components/tasks/task-people";
import {
  EDITORIAL_CHANNELS,
  EDITORIAL_CHANNEL_LABEL,
  EDITORIAL_FORMAT_LABEL,
  EDITORIAL_STATUSES,
  EDITORIAL_STATUS_LABEL,
  coerceFormat,
  formatsForChannel,
  validateDraft,
  type EditorialChannel,
  type EditorialDraft,
} from "@/lib/marketing-editorial";
import { ResponsavelPicker } from "./EditorialParts";

export type EditorialFormState = {
  mode: "new" | "edit" | "duplicate";
  id?: string;
  draft: EditorialDraft;
};

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
        {title}
      </p>
      {children}
    </section>
  );
}
function Label({ children, required }: { children: string; required?: boolean }) {
  return (
    <label className="mb-1 block text-xs font-medium text-text-secondary">
      {children}
      {required && <span className="text-danger"> *</span>}
    </label>
  );
}

/** Criar / editar / duplicar um conteúdo. Na criação o rodapé é a DECISÃO: só o conteúdo, ou o
 * conteúdo + a tarefa para produzi-lo. Na edição é só "Salvar". Legenda e arquivos vivem no detalhe. */
export function EditorialFormSheet({
  state,
  members,
  saving,
  onClose,
  onSubmit,
}: {
  state: EditorialFormState | null;
  members: Member[];
  saving: boolean;
  onClose: () => void;
  onSubmit: (state: EditorialFormState, draft: EditorialDraft, withTask: boolean) => void;
}) {
  const [draft, setDraft] = useState<EditorialDraft | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(state ? state.draft : null);
    setError(null);
  }, [state]);

  if (!state || !draft) return <Sheet open={false} onOpenChange={() => {}} />;
  const patch = (p: Partial<EditorialDraft>) => setDraft((d) => (d ? { ...d, ...p } : d));
  const editing = state.mode === "edit";
  const title = editing
    ? "Editar conteúdo"
    : state.mode === "duplicate"
      ? "Duplicar conteúdo"
      : "Novo conteúdo";

  const submit = (withTask: boolean) => {
    const err = validateDraft(draft);
    if (err) {
      setError(err);
      return;
    }
    onSubmit(state, draft, withTask);
  };

  return (
    <Sheet open onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="flex h-full w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-[520px]">
        <header className="border-b border-border/60 px-5 pb-3 pt-5 sm:px-6">
          <SheetTitle className="text-lg font-semibold">{title}</SheetTitle>
          <SheetDescription className="sr-only">
            Preencha os dados do conteúdo do Marketing.
          </SheetDescription>
        </header>

        <form
          className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5 sm:px-6"
          onSubmit={(e) => {
            e.preventDefault();
            submit(false);
          }}
        >
          <Group title="Detalhes">
            <div>
              <Label required>Título</Label>
              <Input
                autoFocus
                value={draft.titulo}
                onChange={(e) => patch({ titulo: e.target.value })}
                placeholder="Ex.: Reels — Lançamento da campanha"
              />
            </div>
            <div className="grid grid-cols-[1fr_8rem] gap-3">
              <div>
                <Label required>Data</Label>
                <DateField
                  value={draft.data || undefined}
                  onChange={(v) => patch({ data: v ?? "" })}
                  ariaLabel="Data"
                />
              </div>
              <div>
                <Label>Horário</Label>
                <Input
                  type="time"
                  value={draft.hora ?? ""}
                  onChange={(e) => patch({ hora: e.target.value || null })}
                  aria-label="Horário"
                />
              </div>
            </div>
          </Group>

          <Group title="Publicação">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label required>Canal</Label>
                <NativeSelect
                  value={draft.canal}
                  onChange={(e) => {
                    const canal = e.target.value as EditorialChannel;
                    patch({ canal, formato: coerceFormat(canal, draft.formato) });
                  }}
                  aria-label="Canal"
                >
                  {EDITORIAL_CHANNELS.map((c) => (
                    <option key={c} value={c}>
                      {EDITORIAL_CHANNEL_LABEL[c]}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div>
                <Label required>Formato</Label>
                <NativeSelect
                  value={draft.formato}
                  onChange={(e) => patch({ formato: e.target.value as EditorialDraft["formato"] })}
                  aria-label="Formato"
                >
                  {formatsForChannel(draft.canal).map((f) => (
                    <option key={f} value={f}>
                      {EDITORIAL_FORMAT_LABEL[f]}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div>
                <Label>Status</Label>
                <NativeSelect
                  value={draft.status}
                  onChange={(e) => patch({ status: e.target.value as EditorialDraft["status"] })}
                  aria-label="Status"
                >
                  {EDITORIAL_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {EDITORIAL_STATUS_LABEL[s]}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div>
                <Label>Responsável</Label>
                <ResponsavelPicker
                  members={members}
                  value={draft.responsavelId}
                  onChange={(id) => patch({ responsavelId: id })}
                />
              </div>
            </div>
          </Group>

          <Group title="Contexto">
            <div>
              <Label>Briefing</Label>
              <Textarea
                rows={3}
                value={draft.descricao ?? ""}
                onChange={(e) => patch({ descricao: e.target.value || null })}
                placeholder="Opcional — o que este conteúdo precisa comunicar"
              />
            </div>
          </Group>

          {error && <p className="text-sm text-danger">{error}</p>}
          <button type="submit" className="sr-only">
            {editing ? "Salvar" : "Criar conteúdo"}
          </button>
        </form>

        <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-border/60 px-5 py-3.5 sm:px-6">
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          {editing ? (
            <Button variant="primary" onClick={() => submit(false)} isLoading={saving}>
              Salvar
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => submit(false)} disabled={saving}>
                Criar conteúdo
              </Button>
              <Button variant="primary" onClick={() => submit(true)} isLoading={saving}>
                Criar conteúdo + tarefa
              </Button>
            </>
          )}
        </footer>
      </SheetContent>
    </Sheet>
  );
}
