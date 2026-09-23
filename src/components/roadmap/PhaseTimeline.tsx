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
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  Avatar,
  getTaskAssignees,
  initialsOf,
  colorFor,
  type Task,
} from "@/components/tasks/TaskBoard";
import { formatIsoDate } from "@/lib/utils";
import { todayIsoInBrasilia } from "@/lib/timezone";
import { TASK_STATUS_DOT } from "@/lib/task-status";
import {
  faseAtual,
  faseConcluidaComPendencias,
  faseDomId,
  faseProgresso,
  faseTaskCounts,
  faseStatusEfetivo,
  FASE_DOT_CLASS,
  FASE_STATUS_LABEL,
  FASE_STATUS_TONE,
  type ProjetoFase,
} from "@/lib/roadmap-engine";

/** Alternativa por menu ao drag-and-drop nativo pra mover uma tarefa
 * entre fases — toque não sustenta HTML5 drag de forma confiável, então
 * este menu funciona em qualquer dispositivo, sempre ao lado do drag
 * (nunca substituindo). "Sem fase" só aparece quando a tarefa já está
 * numa fase (mover pra "nenhuma fase" não faz sentido a partir de "sem
 * fase" — já é o estado atual). */
function MoveTaskMenu({
  fases,
  currentFaseId,
  onMove,
}: {
  fases: ProjetoFase[];
  currentFaseId?: string;
  onMove: (faseId?: string) => void;
}) {
  if (fases.length === 0 && !currentFaseId) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          aria-label="Mover para fase"
          className="shrink-0 cursor-pointer rounded p-1 text-muted-foreground opacity-0 hover:bg-muted hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100"
        >
          <MoreHorizontal className="h-3.5 w-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        {currentFaseId && (
          <DropdownMenuItem onClick={() => onMove(undefined)}>Sem fase</DropdownMenuItem>
        )}
        {fases
          .filter((f) => f.id !== currentFaseId)
          .map((f) => (
            <DropdownMenuItem key={f.id} onClick={() => onMove(f.id)}>
              {f.nome}
            </DropdownMenuItem>
          ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function TaskRow({
  task,
  onOpen,
  canEdit,
  fases,
  onMove,
}: {
  task: Task;
  onOpen: () => void;
  canEdit: boolean;
  fases: ProjetoFase[];
  onMove: (faseId?: string) => void;
}) {
  const assignees = getTaskAssignees(task);
  const atrasada =
    task.status !== "Concluído" &&
    task.status !== "Arquivado" &&
    !!task.dueDate &&
    task.dueDate < todayIsoInBrasilia();
  return (
    <div className="group flex w-full items-center gap-1 rounded-md px-2 py-1.5 hover:bg-muted/60">
      <button
        type="button"
        draggable={canEdit}
        onDragStart={(e) => e.dataTransfer.setData("text/roadmap-task-id", task.id)}
        onClick={onOpen}
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left text-xs"
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
      {canEdit && (
        <MoveTaskMenu fases={fases} currentFaseId={task.roadmapPhaseId} onMove={onMove} />
      )}
    </div>
  );
}

function PhaseCard({
  fase,
  fases,
  tasksDaFase,
  canEdit,
  isAtual,
  isFirst,
  isLast,
  onOpenTask,
  onCreateTask,
  onLinkTasks,
  onEdit,
  onDuplicate,
  onDelete,
  onDropTask,
  onMoveTask,
  onReorder,
}: {
  fase: ProjetoFase;
  fases: ProjetoFase[];
  tasksDaFase: Task[];
  canEdit: boolean;
  isAtual: boolean;
  isFirst: boolean;
  isLast: boolean;
  onOpenTask: (t: Task) => void;
  onCreateTask: () => void;
  onLinkTasks: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onDropTask: (taskId: string) => void;
  onMoveTask: (taskId: string, faseId?: string) => void;
  onReorder: (direction: "up" | "down") => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const progresso = faseProgresso(fase, tasksDaFase);
  const counts = faseTaskCounts(fase, tasksDaFase);
  const statusEfetivo = faseStatusEfetivo(fase, tasksDaFase);
  const responsaveis = Array.from(new Set(tasksDaFase.flatMap((t) => getTaskAssignees(t))));
  const concluidaComPendencia = faseConcluidaComPendencias(fase, tasksDaFase);

  return (
    <div
      id={faseDomId(fase.id)}
      className={`rounded-lg border p-3 transition-colors ${
        dragOver
          ? "border-foreground bg-muted/40"
          : isAtual
            ? "border-brand/40 bg-brand-subtle/20"
            : "border-border"
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
      <div className="flex items-start gap-2.5">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-label={expanded ? "Recolher" : "Expandir"}
          className="mt-0.5 shrink-0 cursor-pointer text-muted-foreground hover:text-foreground"
        >
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="truncate text-sm font-semibold text-foreground">{fase.nome}</p>
            <span
              className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${FASE_STATUS_TONE[statusEfetivo]}`}
            >
              {statusEfetivo === "atrasada" && <AlertTriangle className="h-2.5 w-2.5" />}
              {statusEfetivo === "concluida" && <Check className="h-2.5 w-2.5" />}
              {FASE_STATUS_LABEL[statusEfetivo]}
            </span>
            {concluidaComPendencia && (
              <span
                title={`${counts.total - counts.concluidas} tarefa(s) ainda aberta(s) nesta fase concluída`}
                className="inline-flex items-center gap-1 rounded-full bg-warning-soft px-1.5 py-0.5 text-[10px] font-medium text-warning-soft-foreground"
              >
                <AlertTriangle className="h-2.5 w-2.5" /> Inconsistente
              </span>
            )}
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {formatIsoDate(fase.dataInicio)} – {formatIsoDate(fase.dataFim)}
            {fase.responsavelPrincipal && <> · {fase.responsavelPrincipal}</>}
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            {progresso === null ? (
              <p className="text-[11px] text-muted-foreground">Sem tarefas</p>
            ) : (
              <>
                <div className="h-1 w-24 shrink-0 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-foreground transition-[width]"
                    style={{ width: `${progresso}%` }}
                  />
                </div>
                <span className="shrink-0 text-[11px] text-muted-foreground">
                  {progresso}% · {counts.concluidas} de {counts.total} tarefas
                  {counts.atrasadas > 0 && (
                    <span className="ml-1 font-medium text-destructive">
                      · {counts.atrasadas} atrasada{counts.atrasadas === 1 ? "" : "s"}
                    </span>
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
              {!isFirst && (
                <DropdownMenuItem onClick={() => onReorder("up")}>
                  <ArrowUp className="h-3.5 w-3.5" /> Mover para cima
                </DropdownMenuItem>
              )}
              {!isLast && (
                <DropdownMenuItem onClick={() => onReorder("down")}>
                  <ArrowDown className="h-3.5 w-3.5" /> Mover para baixo
                </DropdownMenuItem>
              )}
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
                <TaskRow
                  key={t.id}
                  task={t}
                  onOpen={() => onOpenTask(t)}
                  canEdit={canEdit}
                  fases={fases}
                  onMove={(faseId) => onMoveTask(t.id, faseId)}
                />
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

export function PhaseTimeline({
  fases,
  tasks,
  canEdit,
  onOpenTask,
  onCreateTask,
  onLinkTasks,
  onEditFase,
  onDuplicateFase,
  onDeleteFase,
  onMoveTask,
  onNewFase,
  onReorderFase,
}: {
  fases: ProjetoFase[];
  tasks: Task[]; // todas as tarefas do projeto
  canEdit: boolean;
  onOpenTask: (t: Task) => void;
  onCreateTask: (faseId: string) => void;
  onLinkTasks: (faseId: string) => void;
  onEditFase: (fase: ProjetoFase) => void;
  onDuplicateFase: (fase: ProjetoFase) => void;
  onDeleteFase: (fase: ProjetoFase) => void;
  onMoveTask: (taskId: string, faseId?: string) => void;
  onNewFase: () => void;
  onReorderFase: (fase: ProjetoFase, direction: "up" | "down") => void;
}) {
  const ordered = [...fases].sort((a, b) => a.sortOrder - b.sortOrder);
  const atual = faseAtual(ordered, tasks);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Linha do tempo
        </h3>
        {canEdit && (
          <button
            type="button"
            onClick={onNewFase}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-brand-foreground hover:bg-brand-hover"
          >
            <Plus className="h-3.5 w-3.5" /> Nova fase
          </button>
        )}
      </div>

      {ordered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-6 text-center">
          <p className="text-sm text-muted-foreground">Este projeto ainda não possui um Roadmap.</p>
          {canEdit && (
            <button
              type="button"
              onClick={onNewFase}
              className="mt-2 text-xs font-medium text-brand hover:underline"
            >
              Criar primeira fase
            </button>
          )}
        </div>
      ) : (
        <div className="relative">
          {/* Linha vertical discreta conectando as fases (item 3 do
           * pedido) — substitui a "faixa proporcional" solta da versão
           * anterior, que não deixava a sequência clara. */}
          <div className="absolute bottom-3 left-[7px] top-3 w-px bg-border" aria-hidden="true" />
          <div className="space-y-2.5">
            {ordered.map((fase, i) => {
              const statusEfetivo = faseStatusEfetivo(fase, tasks);
              return (
                <div key={fase.id} className="flex gap-3">
                  <div className="flex w-3.5 shrink-0 justify-center pt-4">
                    <span
                      className={`h-3 w-3 shrink-0 rounded-full ring-4 ring-background ${FASE_DOT_CLASS[statusEfetivo]}`}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <PhaseCard
                      fase={fase}
                      fases={ordered}
                      tasksDaFase={tasks.filter((t) => t.roadmapPhaseId === fase.id)}
                      canEdit={canEdit}
                      isAtual={atual?.id === fase.id}
                      isFirst={i === 0}
                      isLast={i === ordered.length - 1}
                      onOpenTask={onOpenTask}
                      onCreateTask={() => onCreateTask(fase.id)}
                      onLinkTasks={() => onLinkTasks(fase.id)}
                      onEdit={() => onEditFase(fase)}
                      onDuplicate={() => onDuplicateFase(fase)}
                      onDelete={() => onDeleteFase(fase)}
                      onDropTask={(taskId) => onMoveTask(taskId, fase.id)}
                      onMoveTask={onMoveTask}
                      onReorder={(direction) => onReorderFase(fase, direction)}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
