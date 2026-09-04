import { useState } from "react";
import {
  ChevronRight,
  ChevronDown,
  Plus,
  Link2,
  MoreHorizontal,
  Pencil,
  Trash2,
  Check,
  AlertTriangle,
  Clock,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { Avatar, getTaskAssignees, initialsOf, colorFor, type Task } from "@/components/tasks/TaskBoard";
import { formatIsoDate } from "@/lib/utils";
import { todayIsoInBrasilia } from "@/lib/timezone";
import { TASK_STATUS_DOT } from "@/lib/task-status";
import {
  faseProgresso,
  faseTaskCounts,
  faseStatusEfetivo,
  FASE_STATUS_LABEL,
  FASE_STATUS_TONE,
  type ProjetoFase,
} from "@/lib/roadmap-engine";

function TaskRow({
  task,
  onOpen,
  draggable,
}: {
  task: Task;
  onOpen: () => void;
  draggable: boolean;
}) {
  const assignees = getTaskAssignees(task);
  const atrasada =
    task.status !== "Concluído" &&
    task.status !== "Arquivado" &&
    !!task.dueDate &&
    task.dueDate < todayIsoInBrasilia();
  return (
    <button
      type="button"
      draggable={draggable}
      onDragStart={(e) => e.dataTransfer.setData("text/roadmap-task-id", task.id)}
      onClick={onOpen}
      className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted/60"
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${TASK_STATUS_DOT[task.status]}`} />
      <span className="min-w-0 flex-1 truncate text-foreground">{task.title}</span>
      {task.priority !== "Normal" && (
        <span className="shrink-0 text-[10px] text-muted-foreground">{task.priority}</span>
      )}
      {task.dueDate && (
        <span
          className={`shrink-0 text-[10px] ${atrasada ? "text-destructive" : "text-muted-foreground"}`}
        >
          {atrasada && <AlertTriangle className="mr-0.5 inline h-2.5 w-2.5" />}
          {formatIsoDate(task.dueDate)}
        </span>
      )}
      {assignees.length > 0 && (
        <span className="flex shrink-0 items-center -space-x-1.5">
          {assignees.slice(0, 3).map((a) => (
            <Avatar
              key={a}
              member={{ name: a, initials: initialsOf(a) || "?", color: colorFor(a) }}
              size={16}
            />
          ))}
        </span>
      )}
    </button>
  );
}

function PhaseCard({
  fase,
  tasksDaFase,
  canEdit,
  onOpenTask,
  onCreateTask,
  onLinkTasks,
  onEdit,
  onDuplicate,
  onDelete,
  onDropTask,
}: {
  fase: ProjetoFase;
  tasksDaFase: Task[];
  canEdit: boolean;
  onOpenTask: (t: Task) => void;
  onCreateTask: () => void;
  onLinkTasks: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onDropTask: (taskId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const progresso = faseProgresso(fase, tasksDaFase);
  const counts = faseTaskCounts(fase, tasksDaFase);
  const statusEfetivo = faseStatusEfetivo(fase, tasksDaFase);
  const responsaveis = Array.from(new Set(tasksDaFase.flatMap((t) => getTaskAssignees(t))));

  return (
    <div
      className={`rounded-xl border p-3.5 transition-colors ${
        dragOver ? "border-foreground bg-muted/40" : "border-border"
      }`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const taskId = e.dataTransfer.getData("text/roadmap-task-id");
        if (taskId) onDropTask(taskId);
      }}
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-label={expanded ? "Recolher" : "Expandir"}
          className="mt-0.5 shrink-0 cursor-pointer text-muted-foreground hover:text-foreground"
        >
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${fase.cor.split(" ")[0]}`} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-semibold text-foreground">{fase.nome}</p>
            <span
              className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${FASE_STATUS_TONE[statusEfetivo]}`}
            >
              {statusEfetivo === "atrasada" && <AlertTriangle className="h-2.5 w-2.5" />}
              {statusEfetivo === "concluida" && <Check className="h-2.5 w-2.5" />}
              {FASE_STATUS_LABEL[statusEfetivo]}
            </span>
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {formatIsoDate(fase.dataInicio)} – {formatIsoDate(fase.dataFim)}
            {fase.responsavelPrincipal && <> · {fase.responsavelPrincipal}</>}
          </p>

          <div className="mt-2.5 flex items-center gap-3">
            {progresso === null ? (
              <p className="text-[11px] text-muted-foreground">Nenhuma tarefa vinculada</p>
            ) : (
              <>
                <div className="h-1.5 w-32 shrink-0 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-foreground transition-[width]"
                    style={{ width: `${progresso}%` }}
                  />
                </div>
                <span className="shrink-0 text-[11px] font-medium tabular-nums text-foreground">
                  {progresso}%
                </span>
                <span className="shrink-0 text-[11px] text-muted-foreground">
                  {counts.concluidas}/{counts.total} tarefas
                  {counts.atrasadas > 0 && (
                    <span className="ml-1 text-destructive">· {counts.atrasadas} atrasada(s)</span>
                  )}
                </span>
              </>
            )}
            {responsaveis.length > 0 && (
              <span className="ml-auto flex shrink-0 items-center -space-x-1.5">
                {responsaveis.slice(0, 4).map((a) => (
                  <Avatar
                    key={a}
                    member={{ name: a, initials: initialsOf(a) || "?", color: colorFor(a) }}
                    size={18}
                  />
                ))}
              </span>
            )}
          </div>
        </div>

        {canEdit && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Ações da fase"
                className="shrink-0 cursor-pointer rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onEdit}>
                <Pencil className="h-3.5 w-3.5" /> Editar fase
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onDuplicate}>Duplicar fase</DropdownMenuItem>
              <DropdownMenuItem onClick={onDelete} className="text-destructive">
                <Trash2 className="h-3.5 w-3.5" /> Excluir fase
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {expanded && (
        <div className="mt-3 space-y-2 border-t border-border/60 pt-3">
          {fase.descricao && <p className="text-xs text-muted-foreground">{fase.descricao}</p>}
          {tasksDaFase.length === 0 ? (
            <p className="py-1 text-xs text-muted-foreground">Nenhuma tarefa vinculada.</p>
          ) : (
            <div className="space-y-0.5">
              {tasksDaFase.map((t) => (
                <TaskRow key={t.id} task={t} onOpen={() => onOpenTask(t)} draggable={canEdit} />
              ))}
            </div>
          )}
          {canEdit && (
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={onCreateTask}
                className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-medium text-foreground hover:bg-muted"
              >
                <Plus className="h-3 w-3" /> Nova tarefa
              </button>
              <button
                type="button"
                onClick={onLinkTasks}
                className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-medium text-foreground hover:bg-muted"
              >
                <Link2 className="h-3 w-3" /> Vincular tarefa existente
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Linha do tempo proporcional — barra fina, uma por fase, com largura
 * relativa ao período do projeto inteiro (primeira data de início até
 * última data final entre as fases). Puramente visual, sem interação;
 * a lista abaixo (`PhaseCard`) é onde toda ação de verdade acontece. */
function ProportionalStrip({ fases }: { fases: ProjetoFase[] }) {
  if (fases.length === 0) return null;
  const starts = fases.map((f) => new Date(`${f.dataInicio}T00:00:00`).getTime());
  const ends = fases.map((f) => new Date(`${f.dataFim}T00:00:00`).getTime());
  const min = Math.min(...starts);
  const max = Math.max(...ends);
  const span = Math.max(1, max - min);
  return (
    <div className="overflow-x-auto pb-2">
      <div className="min-w-[480px] space-y-1">
        {fases.map((f) => {
          const start = new Date(`${f.dataInicio}T00:00:00`).getTime();
          const end = new Date(`${f.dataFim}T00:00:00`).getTime();
          const left = ((start - min) / span) * 100;
          const width = Math.max(1.5, ((end - start) / span) * 100);
          return (
            <div key={f.id} className="relative h-5">
              <div
                className={`absolute h-5 rounded-full ${f.cor.split(" ")[0]} opacity-80`}
                style={{ left: `${left}%`, width: `${width}%` }}
                title={f.nome}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function PhaseTimeline({
  fases,
  tasks,
  semFase,
  canEdit,
  onOpenTask,
  onCreateTask,
  onLinkTasks,
  onEditFase,
  onDuplicateFase,
  onDeleteFase,
  onMoveTask,
  onNewFase,
  onCreateFaseFromSelection,
}: {
  fases: ProjetoFase[];
  tasks: Task[]; // todas as tarefas do projeto
  semFase: Task[];
  canEdit: boolean;
  onOpenTask: (t: Task) => void;
  onCreateTask: (faseId: string) => void;
  onLinkTasks: (faseId: string) => void;
  onEditFase: (fase: ProjetoFase) => void;
  onDuplicateFase: (fase: ProjetoFase) => void;
  onDeleteFase: (fase: ProjetoFase) => void;
  onMoveTask: (taskId: string, faseId: string) => void;
  onNewFase: () => void;
  onCreateFaseFromSelection: (taskIds: string[]) => void;
}) {
  const [semFaseOpen, setSemFaseOpen] = useState(false);
  const [semFaseSelected, setSemFaseSelected] = useState<Set<string>>(new Set());
  const ordered = [...fases].sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Linha do tempo
        </h3>
        {canEdit && (
          <button
            type="button"
            onClick={onNewFase}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90"
          >
            <Plus className="h-3.5 w-3.5" /> Nova fase
          </button>
        )}
      </div>

      <ProportionalStrip fases={ordered} />

      {ordered.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Nenhuma fase ainda. Crie a primeira fase pra começar a organizar o roadmap.
        </p>
      ) : (
        <div className="space-y-2.5">
          {ordered.map((fase) => (
            <PhaseCard
              key={fase.id}
              fase={fase}
              tasksDaFase={tasks.filter((t) => t.roadmapPhaseId === fase.id)}
              canEdit={canEdit}
              onOpenTask={onOpenTask}
              onCreateTask={() => onCreateTask(fase.id)}
              onLinkTasks={() => onLinkTasks(fase.id)}
              onEdit={() => onEditFase(fase)}
              onDuplicate={() => onDuplicateFase(fase)}
              onDelete={() => onDeleteFase(fase)}
              onDropTask={(taskId) => onMoveTask(taskId, fase.id)}
            />
          ))}
        </div>
      )}

      <div className="rounded-xl border border-border">
        <button
          type="button"
          onClick={() => setSemFaseOpen((v) => !v)}
          className="flex w-full cursor-pointer items-center gap-2 px-3.5 py-3 text-left"
        >
          {semFaseOpen ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
          <Clock className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">Tarefas sem fase</span>
          <span className="ml-auto rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            {semFase.length}
          </span>
        </button>
        {semFaseOpen && (
          <div className="border-t border-border/60 p-2">
            {semFase.length === 0 ? (
              <p className="px-2 py-2 text-xs text-muted-foreground">
                Nenhuma tarefa sem fase — tudo está organizado.
              </p>
            ) : (
              <>
                <div className="space-y-0.5">
                  {semFase.map((t) => (
                    <label
                      key={t.id}
                      className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-muted/60"
                    >
                      {canEdit && (
                        <input
                          type="checkbox"
                          checked={semFaseSelected.has(t.id)}
                          onChange={() =>
                            setSemFaseSelected((prev) => {
                              const next = new Set(prev);
                              if (next.has(t.id)) next.delete(t.id);
                              else next.add(t.id);
                              return next;
                            })
                          }
                          className="h-3.5 w-3.5 shrink-0 rounded border-border accent-foreground"
                        />
                      )}
                      <span
                        draggable={canEdit}
                        onDragStart={(e) =>
                          e.dataTransfer.setData("text/roadmap-task-id", t.id)
                        }
                        onClick={() => onOpenTask(t)}
                        className="min-w-0 flex-1 cursor-pointer truncate text-foreground hover:underline"
                      >
                        {t.title}
                      </span>
                    </label>
                  ))}
                </div>
                {canEdit && semFaseSelected.size > 0 && (
                  <div className="flex items-center justify-between border-t border-border/60 px-2 pt-2">
                    <p className="text-[11px] text-muted-foreground">
                      {semFaseSelected.size} selecionada(s)
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        onCreateFaseFromSelection(Array.from(semFaseSelected));
                        setSemFaseSelected(new Set());
                      }}
                      className="cursor-pointer rounded-md border border-border px-2 py-1 text-[11px] font-medium text-foreground hover:bg-muted"
                    >
                      Criar fase com estas tarefas
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
