import { Check, Copy, Pencil, Trash2 } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { TaskRefChip } from "@/components/chat/TaskRefChip";
import type { Member } from "@/components/tasks/task-people";
import { useTaskDirectory } from "@/lib/task-directory";
import { useMentionNavigation } from "@/components/chat-v2/use-mention-navigation";
import {
  channelFormatLabel,
  overdueDays,
  overdueLabel,
  type EditorialItem,
} from "@/lib/marketing-editorial";
import { parseIsoDateLocal } from "@/lib/utils";
import { EditorialStatusBadge, MemberInline } from "./EditorialParts";

function longDate(iso: string): string {
  const s = parseIsoDateLocal(iso).toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-xs text-text-secondary">{label}</dt>
      <dd className="text-sm text-foreground">{children}</dd>
    </div>
  );
}

export function EditorialDetailSheet({
  item,
  members,
  today,
  busy,
  onClose,
  onEdit,
  onDuplicate,
  onDelete,
  onPublish,
}: {
  item: EditorialItem | null;
  members: Member[];
  today: string;
  busy: boolean;
  onClose: () => void;
  onEdit: (it: EditorialItem) => void;
  onDuplicate: (it: EditorialItem) => void;
  onDelete: (it: EditorialItem) => void;
  onPublish: (it: EditorialItem) => void;
}) {
  const tasks = useTaskDirectory();
  const { openTask } = useMentionNavigation();
  if (!item) return <Sheet open={false} onOpenChange={() => {}} />;
  const late = overdueDays(item, today);
  const task = item.tarefaId ? tasks.find((t) => t.id === item.tarefaId) : undefined;
  const canPublish = item.status !== "publicado" && item.status !== "cancelado";

  return (
    <Sheet open onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="flex h-full w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-[480px]">
        <header className="space-y-1.5 border-b border-border/60 px-5 pb-4 pt-5 pr-12 sm:px-6 sm:pr-12">
          <SheetTitle className="break-words text-lg font-semibold leading-tight">
            {item.titulo}
          </SheetTitle>
          <SheetDescription asChild>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-text-secondary">
              <EditorialStatusBadge status={item.status} />
              {late > 0 && <span className="text-xs text-danger">{overdueLabel(late)}</span>}
            </div>
          </SheetDescription>
        </header>

        <dl className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5 sm:px-6">
          <Row label="Canal e formato">{channelFormatLabel(item)}</Row>
          <Row label="Data">
            {longDate(item.data)}
            {item.hora ? ` · ${item.hora}` : ""}
          </Row>
          <Row label="Responsável">
            <MemberInline members={members} id={item.responsavelId} />
          </Row>
          {item.descricao && (
            <Row label="Descrição">
              <span className="whitespace-pre-wrap break-words">{item.descricao}</span>
            </Row>
          )}
          {item.tarefaId && (
            <Row label="Tarefa relacionada">
              {task ? (
                <TaskRefChip
                  title={task.label}
                  status={task.status}
                  project={task.project}
                  assignees={task.assignees}
                  onClick={() => openTask(task.id)}
                />
              ) : (
                <span className="text-text-secondary">Tarefa removida</span>
              )}
            </Row>
          )}
        </dl>

        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 px-5 py-3.5 sm:px-6">
          <button
            type="button"
            onClick={() => onDelete(item)}
            disabled={busy}
            className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs text-danger hover:bg-danger-soft disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" /> Excluir
          </button>
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            <Button variant="ghost" size="sm" onClick={() => onDuplicate(item)} disabled={busy}>
              <Copy className="h-3.5 w-3.5" /> Duplicar
            </Button>
            <Button variant="outline" size="sm" onClick={() => onEdit(item)} disabled={busy}>
              <Pencil className="h-3.5 w-3.5" /> Editar
            </Button>
            {canPublish && (
              <Button variant="primary" size="sm" onClick={() => onPublish(item)} disabled={busy}>
                <Check className="h-3.5 w-3.5" /> Marcar como publicado
              </Button>
            )}
          </div>
        </footer>
      </SheetContent>
    </Sheet>
  );
}
