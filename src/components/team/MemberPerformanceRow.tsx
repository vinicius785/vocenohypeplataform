import { useState } from "react";
import { ShieldCheck, KeyRound, Pencil, X, AlertTriangle } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { ScoreOperacionalV2 } from "@/lib/performance-engine";
import type { Member } from "@/components/TimeSection";
import type { DashTask } from "@/lib/task-aggregation";
import { avatarAccent, initialsOf, getStatus, PresenceDot, IconAction } from "./member-ui";

const OVERDUE_TOOLTIP = "Tarefas atualmente vencidas e ainda não concluídas.";
const OVERDUE_PREVIEW_LIMIT = 4;

/** Faixas de cor do Score — mesmos limites de `classificacaoDoScore`
 * (`performance-engine.ts`), só que aqui viram TOM em vez de rótulo: cor
 * comunica exceção/gradiente, o texto da classificação (sempre exibido
 * junto, nunca só a cor) é o que carrega o significado de verdade (item
 * 9 do pedido — reduzir dependência de cor). */
function scoreToneClass(score: number | null): string {
  if (score == null) return "text-muted-foreground";
  if (score >= 90) return "text-emerald-600 dark:text-emerald-400";
  if (score >= 80) return "text-emerald-600/70 dark:text-emerald-400/70";
  if (score >= 70) return "text-foreground";
  if (score >= 60) return "text-amber-600 dark:text-amber-400";
  return "text-destructive";
}

function OverdueTaskRow({
  task,
  onOpenTask,
}: {
  task: DashTask;
  onOpenTask: (t: DashTask) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpenTask(task)}
      className="flex w-full flex-col gap-0.5 rounded-md px-2 py-1.5 text-left hover:bg-muted/60"
    >
      <span className="truncate text-xs font-medium text-foreground">{task.title}</span>
      <span className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span className="truncate">{task.projectName}</span>
        <span className="shrink-0 text-destructive">{task.due}</span>
      </span>
    </button>
  );
}

/** Popover "TAREFAS ATRASADAS" (item 12) — só existe quando `overdueTasks.length > 0`
 * (item 13: com 0 atrasadas, o indicador fica estático, sem popover).
 * "Ver todas" expande a MESMA lista em vez de navegar (decisão
 * confirmada — Projetos não tem hoje um filtro cruzado por pessoa). */
function OverdueTasksPopover({
  memberName,
  overdueTasks,
  onOpenTask,
}: {
  memberName: string;
  overdueTasks: DashTask[];
  onOpenTask: (t: DashTask) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? overdueTasks : overdueTasks.slice(0, OVERDUE_PREVIEW_LIMIT);
  return (
    <div className="w-72">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        Tarefas atrasadas
      </p>
      <p className="mt-0.5 text-xs text-foreground">
        {memberName} · {overdueTasks.length} tarefa{overdueTasks.length === 1 ? "" : "s"}
      </p>
      <div className="mt-2 max-h-64 space-y-0.5 overflow-y-auto border-t border-border pt-2">
        {visible.map((t) => (
          <OverdueTaskRow key={`${t.projectId}_${t.id}`} task={t} onOpenTask={onOpenTask} />
        ))}
      </div>
      {!showAll && overdueTasks.length > OVERDUE_PREVIEW_LIMIT && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="mt-1 w-full cursor-pointer rounded-md px-2 py-1.5 text-left text-xs font-medium text-foreground hover:bg-muted/60"
        >
          Ver todas as tarefas atrasadas →
        </button>
      )}
    </div>
  );
}

/** Uma linha da "Performance do Time" — 4 zonas de clique independentes
 * (NUNCA a linha inteira, item 20 do pedido): avatar+nome abre o Perfil;
 * "X atrasadas" abre um popover com as tarefas de verdade (ou fica
 * estático se 0); o Score abre o Perfil já na composição; os ícones de
 * admin continuam iguais (já tinham tooltip via `IconAction`). */
export function MemberPerformanceRow({
  member: m,
  score,
  overdueTasks,
  onOpenTask,
  isSelf,
  isAdmin,
  onOpenProfile,
  onEdit,
  onDelete,
  onReset,
}: {
  member: Member;
  score?: ScoreOperacionalV2;
  /** Tarefas ATUALMENTE atrasadas desta pessoa (bucket "atrasada"),
   * mesma fonte que já alimenta "Carga por membro" — nunca diverge do
   * número mostrado (`score.entrega.atualmenteAtrasadas`). */
  overdueTasks: DashTask[];
  onOpenTask: (t: DashTask) => void;
  isSelf: boolean;
  isAdmin: boolean;
  onOpenProfile: (opts?: { showComposition?: boolean }) => void;
  onEdit: () => void;
  onDelete: () => void;
  onReset: () => void;
}) {
  const canManage = isAdmin;
  const stop = (e: React.MouseEvent) => e.stopPropagation();
  const showName = canManage || isSelf || m.timeView.includes("name");
  const showRole = canManage || isSelf || m.timeView.includes("role");
  const status = getStatus(m.id);
  const atrasadas = score?.entrega.atualmenteAtrasadas ?? 0;

  return (
    <div className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40">
      <button
        type="button"
        onClick={() => onOpenProfile()}
        className="group flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-md text-left"
      >
        <div className="relative shrink-0">
          <Avatar className="h-10 w-10">
            {m.photo && <AvatarImage src={m.photo} alt={m.name} />}
            <AvatarFallback className={`text-sm font-semibold ${avatarAccent(m.id)}`}>
              {initialsOf(showName ? m.name : "", m.email)}
            </AvatarFallback>
          </Avatar>
          <PresenceDot status={status} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-sm font-semibold text-foreground group-hover:underline">
              {showName ? m.name || "(sem nome)" : "Membro"}
            </p>
            {isSelf && (
              <Badge variant="secondary" className="shrink-0 px-1.5 py-0 text-[10px]">
                Você
              </Badge>
            )}
            {m.isAdmin && (
              <Badge
                variant="outline"
                className="shrink-0 gap-1 border-foreground/20 px-1.5 py-0 text-[10px] font-medium text-foreground"
              >
                <ShieldCheck className="h-2.5 w-2.5" /> Admin
              </Badge>
            )}
          </div>
          {showRole && m.role && <p className="truncate text-xs text-muted-foreground">{m.role}</p>}
        </div>
      </button>

      {score && (
        <div className="hidden shrink-0 items-center sm:flex">
          {atrasadas > 0 ? (
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  title={OVERDUE_TOOLTIP}
                  className="flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-1 text-xs text-destructive hover:bg-destructive/10"
                >
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {atrasadas} atrasada{atrasadas === 1 ? "" : "s"}
                </button>
              </PopoverTrigger>
              <PopoverContent align="end">
                <OverdueTasksPopover
                  memberName={m.name}
                  overdueTasks={overdueTasks}
                  onOpenTask={onOpenTask}
                />
              </PopoverContent>
            </Popover>
          ) : (
            <span
              title={OVERDUE_TOOLTIP}
              className="flex items-center gap-1 px-1.5 py-1 text-xs text-muted-foreground"
            >
              <AlertTriangle className="h-3.5 w-3.5" />0 atrasadas
            </span>
          )}
        </div>
      )}

      {score && (
        <button
          type="button"
          onClick={() => onOpenProfile({ showComposition: true })}
          className="flex shrink-0 cursor-pointer flex-col items-end rounded-md px-1.5 py-1 text-right hover:bg-muted/60"
        >
          <span className={`text-base font-semibold tabular-nums ${scoreToneClass(score.score)}`}>
            {score.score == null ? "—" : score.score}
          </span>
          {score.classificacao && (
            <span className="text-[10px] text-muted-foreground">{score.classificacao}</span>
          )}
        </button>
      )}

      {canManage && (
        <div className="flex shrink-0 items-center gap-0.5">
          <IconAction
            label="Redefinir senha"
            onClick={(e) => {
              stop(e);
              onReset();
            }}
          >
            <KeyRound className="h-3.5 w-3.5" />
          </IconAction>
          <IconAction
            label="Editar membro"
            onClick={(e) => {
              stop(e);
              onEdit();
            }}
          >
            <Pencil className="h-3.5 w-3.5" />
          </IconAction>
          {!isSelf && (
            <IconAction
              label="Remover do workspace"
              destructive
              onClick={(e) => {
                stop(e);
                onDelete();
              }}
            >
              <X className="h-3.5 w-3.5" />
            </IconAction>
          )}
        </div>
      )}
    </div>
  );
}
