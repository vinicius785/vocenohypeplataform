import { useState } from "react";
import { Plus, Trash2, RotateCcw, Pencil } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { EmptyState } from "@/components/shared/EmptyState";
import { useConfirm } from "@/hooks/use-confirm";
import { BRASILIA_TZ } from "@/lib/timezone";
import { groupReminders, type Reminder } from "@/lib/reminders";
import { ReminderFormDialog, type ReminderFormInput } from "./ReminderFormDialog";

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: BRASILIA_TZ,
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Section({
  title,
  items,
  children,
}: {
  title: string;
  items: Reminder[];
  children: React.ReactNode;
}) {
  if (items.length === 0) return null;
  return (
    <div className="mb-4">
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title} ({items.length})
      </p>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

/**
 * "Ver todos" — visão completa dos lembretes, agrupada exatamente como
 * pedido: Atrasados / Hoje / Próximos / Sem data / Concluídos. Abre como
 * modal (nunca uma rota nova — mantém o Início sem navegação interna
 * extra). Edição reaproveita o mesmo `ReminderFormDialog` do card.
 */
export function RemindersFullView({
  open,
  onOpenChange,
  reminders,
  onCreate,
  onComplete,
  onReopen,
  onUpdate,
  onDelete,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  reminders: Reminder[];
  onCreate: () => void;
  onComplete: (id: string) => void;
  onReopen: (id: string) => void;
  onUpdate: (input: ReminderFormInput & { id: string }) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const groups = groupReminders(reminders);
  const [editing, setEditing] = useState<Reminder | null>(null);
  const { confirm, confirmDialog } = useConfirm();

  const handleDelete = async (r: Reminder) => {
    // Confirmação só quando já existe algo relevante escrito (observação
    // ou data combinada) — exclusão de um título vazio de segundos atrás
    // não precisa de fricção extra.
    const needsConfirm = !!r.notes || !!r.dueAt;
    if (needsConfirm && !(await confirm(`Excluir o lembrete "${r.title}"?`))) return;
    await onDelete(r.id);
  };

  const row = (r: Reminder, opts: { done?: boolean } = {}) => (
    <div
      key={r.id}
      className="group flex items-start gap-2 rounded-lg px-2 py-2 text-sm hover:bg-muted/40"
    >
      <input
        type="checkbox"
        checked={!!opts.done}
        onChange={() => (opts.done ? onReopen(r.id) : onComplete(r.id))}
        aria-label={opts.done ? `Reabrir: ${r.title}` : `Concluir: ${r.title}`}
        className="mt-1 h-4 w-4 shrink-0 rounded border-border accent-brand"
      />
      <div className="min-w-0 flex-1">
        <p
          className={`flex items-center gap-1.5 truncate ${opts.done ? "text-muted-foreground line-through" : "text-foreground"}`}
        >
          {r.priority === "importante" && !opts.done && (
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-danger" aria-hidden="true" />
          )}
          {r.title}
        </p>
        {(r.dueAt || r.notes) && (
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {r.dueAt ? fmtDate(r.dueAt) : ""}
            {r.dueAt && r.notes ? " · " : ""}
            {r.notes}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        {!opts.done && (
          <IconButton label="Editar" tone="neutral" onClick={() => setEditing(r)}>
            <Pencil className="h-3.5 w-3.5" />
          </IconButton>
        )}
        {opts.done && (
          <IconButton label="Reabrir" tone="neutral" onClick={() => onReopen(r.id)}>
            <RotateCcw className="h-3.5 w-3.5" />
          </IconButton>
        )}
        <IconButton label="Excluir" tone="destructive" onClick={() => void handleDelete(r)}>
          <Trash2 className="h-3.5 w-3.5" />
        </IconButton>
      </div>
    </div>
  );

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent mobileFullScreen className="flex max-h-[85vh] max-w-lg flex-col">
          <DialogHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <DialogTitle>Lembretes</DialogTitle>
              <DialogDescription>Todos os seus lembretes, privados.</DialogDescription>
            </div>
            <Button size="sm" onClick={onCreate} className="gap-1.5">
              <Plus className="h-3.5 w-3.5" /> Novo
            </Button>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            {reminders.length === 0 ? (
              <EmptyState
                compact
                title="Nenhum lembrete pendente."
                primaryAction={{ label: "Criar lembrete", onClick: onCreate }}
              />
            ) : (
              <>
                <Section title="Atrasados" items={groups.atrasados}>
                  {groups.atrasados.map((r) => row(r))}
                </Section>
                <Section title="Hoje" items={groups.hoje}>
                  {groups.hoje.map((r) => row(r))}
                </Section>
                <Section title="Próximos" items={groups.proximos}>
                  {groups.proximos.map((r) => row(r))}
                </Section>
                <Section title="Sem data" items={groups.semData}>
                  {groups.semData.map((r) => row(r))}
                </Section>
                <Section title="Concluídos" items={groups.concluidos}>
                  {groups.concluidos.map((r) => row(r, { done: true }))}
                </Section>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {editing && (
        <ReminderFormDialog
          open={!!editing}
          onOpenChange={(v) => !v && setEditing(null)}
          initial={editing}
          onSubmit={async (input) => {
            await onUpdate({ ...input, id: editing.id });
            setEditing(null);
          }}
        />
      )}
      {confirmDialog}
    </>
  );
}
