import { Check, Copy, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TaskRefChip } from "@/components/chat/TaskRefChip";
import type { Member } from "@/components/tasks/task-people";
import { useTaskDirectory } from "@/lib/task-directory";
import {
  channelFormatLabel,
  overdueDays,
  overdueLabel,
  type EditorialFile,
  type EditorialItem,
} from "@/lib/marketing-editorial";
import { parseIsoDateLocal } from "@/lib/utils";
import { EditorialStatusBadge, MemberInline } from "./EditorialParts";
import { EditorialCaption } from "./EditorialCaption";
import { EditorialFiles } from "./EditorialFiles";

function longDate(iso: string): string {
  const s = parseIsoDateLocal(iso).toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function Heading({ children }: { children: string }) {
  return (
    <h3 className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
      {children}
    </h3>
  );
}

export function EditorialDetailSheet({
  item,
  members,
  today,
  busy,
  captionSaving,
  uploading,
  onClose,
  onEdit,
  onDuplicate,
  onDelete,
  onPublish,
  onSaveCaption,
  onAddFiles,
  onRemoveFile,
  onCreateTask,
  onOpenTask,
}: {
  item: EditorialItem | null;
  members: Member[];
  today: string;
  busy: boolean;
  captionSaving: boolean;
  uploading: string[];
  onClose: () => void;
  onEdit: (it: EditorialItem) => void;
  onDuplicate: (it: EditorialItem) => void;
  onDelete: (it: EditorialItem) => void;
  onPublish: (it: EditorialItem) => void;
  onSaveCaption: (it: EditorialItem, text: string | null) => Promise<boolean>;
  onAddFiles: (it: EditorialItem, files: File[]) => void;
  onRemoveFile: (it: EditorialItem, file: EditorialFile) => void;
  onCreateTask: (it: EditorialItem) => void;
  onOpenTask: (taskId: string) => void;
}) {
  const tasks = useTaskDirectory();
  if (!item) return <Sheet open={false} onOpenChange={() => {}} />;
  const late = overdueDays(item, today);
  const task = item.tarefaId ? tasks.find((t) => t.id === item.tarefaId) : undefined;
  const canPublish = item.status !== "publicado" && item.status !== "cancelado";

  return (
    <Sheet open onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="flex h-full w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-[760px]">
        <header className="space-y-3 border-b border-border/60 px-5 pb-4 pt-5 pr-12 sm:px-6 sm:pr-12">
          <div className="space-y-1.5">
            <SheetTitle className="break-words text-lg font-semibold leading-tight">
              {item.titulo}
            </SheetTitle>
            <SheetDescription asChild>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-text-secondary">
                <span>{channelFormatLabel(item)}</span>
                <EditorialStatusBadge status={item.status} />
                {late > 0 && <span className="text-xs text-danger">{overdueLabel(late)}</span>}
                <MemberInline members={members} id={item.responsavelId} />
              </div>
            </SheetDescription>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Button variant="outline" size="sm" onClick={() => onEdit(item)} disabled={busy}>
              <Pencil className="h-3.5 w-3.5" /> Editar
            </Button>
            <Button variant="ghost" size="sm" onClick={() => onDuplicate(item)} disabled={busy}>
              <Copy className="h-3.5 w-3.5" /> Duplicar
            </Button>
            {canPublish && (
              <Button variant="ghost" size="sm" onClick={() => onPublish(item)} disabled={busy}>
                <Check className="h-3.5 w-3.5" /> Marcar como publicado
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Mais ações">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem
                  onSelect={() => onDelete(item)}
                  className="text-danger focus:text-danger"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Excluir conteúdo
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          <div className="grid gap-8 md:grid-cols-[minmax(0,1fr)_14rem]">
            <div className="min-w-0 space-y-7">
              <section aria-label="Briefing" className="space-y-2">
                <Heading>Briefing</Heading>
                {item.descricao ? (
                  <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
                    {item.descricao}
                  </p>
                ) : (
                  <p className="text-sm text-text-secondary">Sem briefing.</p>
                )}
              </section>
              <EditorialCaption
                value={item.legenda}
                canal={item.canal}
                saving={captionSaving}
                onSave={(text) => onSaveCaption(item, text)}
              />
              <EditorialFiles
                files={item.arquivos}
                uploading={uploading}
                onAdd={(files) => onAddFiles(item, files)}
                onRemove={(f) => onRemoveFile(item, f)}
              />
            </div>

            <aside className="min-w-0 space-y-6 md:border-l md:border-border/60 md:pl-6">
              <section className="space-y-1">
                <Heading>Publicação</Heading>
                <p className="text-sm text-foreground">{longDate(item.data)}</p>
                {item.hora && <p className="text-sm text-text-secondary">{item.hora}</p>}
              </section>

              <section aria-label="Tarefa" className="space-y-2">
                <Heading>Tarefa</Heading>
                {item.tarefaId && task ? (
                  <div className="space-y-2">
                    <TaskRefChip
                      title={task.label}
                      status={task.status}
                      project={task.project}
                      assignees={task.assignees}
                      onClick={() => onOpenTask(task.id)}
                    />
                    <Button variant="outline" size="sm" onClick={() => onOpenTask(task.id)}>
                      Abrir tarefa
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-sm text-text-secondary">
                      {item.tarefaId
                        ? "A tarefa deste conteúdo não foi encontrada."
                        : "Nenhuma tarefa criada para este conteúdo."}
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onCreateTask(item)}
                      disabled={busy}
                    >
                      <Plus className="h-3.5 w-3.5" /> Criar tarefa
                    </Button>
                  </div>
                )}
              </section>
            </aside>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
