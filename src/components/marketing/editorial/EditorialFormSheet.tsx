import { useEffect, useMemo, useState } from "react";
import { Link2 } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ui/native-select";
import { DateField } from "@/components/ui/date-field";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { TaskPicker } from "@/components/tasks/TaskPicker";
import { TaskRefChip } from "@/components/chat/TaskRefChip";
import type { Member } from "@/components/tasks/task-people";
import { useTaskDirectory } from "@/lib/task-directory";
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

function Label({ children, required }: { children: string; required?: boolean }) {
  return (
    <label className="mb-1 block text-xs font-medium text-text-secondary">
      {children}
      {required && <span className="text-danger"> *</span>}
    </label>
  );
}

/** Formulário compacto (sem etapas) para criar, editar ou duplicar um conteúdo. */
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
  onSubmit: (state: EditorialFormState, draft: EditorialDraft) => void;
}) {
  const [draft, setDraft] = useState<EditorialDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [taskOpen, setTaskOpen] = useState(false);
  const tasks = useTaskDirectory();

  useEffect(() => {
    setDraft(state ? state.draft : null);
    setError(null);
  }, [state]);

  const task = useMemo(
    () => (draft?.tarefaId ? tasks.find((t) => t.id === draft.tarefaId) : undefined),
    [draft?.tarefaId, tasks],
  );

  if (!state || !draft) return <Sheet open={false} onOpenChange={() => {}} />;
  const patch = (p: Partial<EditorialDraft>) => setDraft((d) => (d ? { ...d, ...p } : d));
  const title =
    state.mode === "edit"
      ? "Editar conteúdo"
      : state.mode === "duplicate"
        ? "Duplicar conteúdo"
        : "Novo conteúdo";

  const submit = () => {
    const err = validateDraft(draft);
    if (err) {
      setError(err);
      return;
    }
    onSubmit(state, draft);
  };

  return (
    <Sheet open onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="flex h-full w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-[480px]">
        <header className="border-b border-border/60 px-5 pb-3 pt-5 sm:px-6">
          <SheetTitle className="text-lg font-semibold">{title}</SheetTitle>
          <SheetDescription className="sr-only">
            Preencha os dados do conteúdo do Marketing.
          </SheetDescription>
        </header>

        <form
          className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5 sm:px-6"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div>
            <Label required>Título</Label>
            <Input
              autoFocus
              value={draft.titulo}
              onChange={(e) => patch({ titulo: e.target.value })}
              placeholder="Ex.: Reels — Nova funcionalidade"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
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
          </div>

          <div className="grid grid-cols-2 gap-3">
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

          <div>
            <Label>Descrição</Label>
            <Textarea
              rows={3}
              value={draft.descricao ?? ""}
              onChange={(e) => patch({ descricao: e.target.value || null })}
              placeholder="Opcional"
            />
          </div>

          <div>
            <Label>Tarefa relacionada</Label>
            {draft.tarefaId ? (
              <div className="flex items-center justify-between gap-2">
                {task ? (
                  <TaskRefChip
                    title={task.label}
                    status={task.status}
                    project={task.project}
                    assignees={task.assignees}
                  />
                ) : (
                  <span className="text-sm text-text-secondary">Tarefa removida</span>
                )}
                <button
                  type="button"
                  onClick={() => patch({ tarefaId: null })}
                  className="shrink-0 text-xs text-text-secondary hover:text-foreground"
                >
                  Remover
                </button>
              </div>
            ) : (
              <Popover open={taskOpen} onOpenChange={setTaskOpen}>
                <PopoverTrigger asChild>
                  <Button type="button" variant="outline" size="sm">
                    <Link2 className="h-3.5 w-3.5" /> Vincular tarefa
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-[min(360px,calc(100vw-2rem))] p-0">
                  <TaskPicker
                    excludeTaskId=""
                    onSelect={(t) => {
                      patch({ tarefaId: t.id });
                      setTaskOpen(false);
                    }}
                  />
                </PopoverContent>
              </Popover>
            )}
          </div>

          {error && <p className="text-sm text-danger">{error}</p>}
          <button type="submit" className="sr-only">
            Salvar
          </button>
        </form>

        <footer className="flex items-center justify-end gap-2 border-t border-border/60 px-5 py-3.5 sm:px-6">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={submit} isLoading={saving}>
            {state.mode === "edit" ? "Salvar" : "Criar conteúdo"}
          </Button>
        </footer>
      </SheetContent>
    </Sheet>
  );
}
