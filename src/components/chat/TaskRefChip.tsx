import { Avatar, useTeamMembers } from "@/components/tasks/task-people";
import { isTaskStatus } from "@/components/tasks/task-ui";
import { TASK_STATUS_DOT } from "@/lib/task-status";
import { cn } from "@/lib/utils";

/** Bolinha de status — MESMA paleta (`TASK_STATUS_DOT`) do Kanban e do detalhe da tarefa. */
export function TaskStatusDot({ status, className }: { status?: string; className?: string }) {
  const s = status && isTaskStatus(status) ? status : "Aberto";
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block h-2.5 w-2.5 shrink-0 rounded-full",
        TASK_STATUS_DOT[s],
        className,
      )}
    />
  );
}

/** Responsável da tarefa. `assignees` guarda o NOME do membro (como no Kanban); aceita id também. */
export function AssigneeAvatar({ ids, size = 20 }: { ids?: string[]; size?: number }) {
  const team = useTeamMembers();
  const find = (key: string) => {
    const k = key.trim().toLowerCase();
    return team.find((m) => m.id === key || m.name.toLowerCase() === k);
  };
  const first = ids?.map(find).find(Boolean);
  if (!first) {
    return (
      <span
        title={ids && ids.length > 0 ? ids[0] : "Sem responsável"}
        style={{ width: size, height: size }}
        className="shrink-0 rounded-full border border-dashed border-border"
      />
    );
  }
  const extra = (ids?.length ?? 1) - 1;
  return (
    <span title={first.name + (extra > 0 ? ` e mais ${extra}` : "")} className="shrink-0">
      <Avatar member={first} size={size} />
    </span>
  );
}

/**
 * Referência de TAREFA como objeto (no editor e na mensagem): STATUS → TÍTULO → RESPONSÁVEL, com o
 * status por extenso e o projeto só quando há espaço. Sempre desenhada a partir da tarefa viva
 * (status/título/responsável atuais), nunca de uma cópia gravada na mensagem.
 */
export function TaskRefChip({
  title,
  status,
  project,
  assignees,
  onClick,
  onRemove,
}: {
  title: string;
  status?: string;
  project?: string;
  assignees?: string[];
  onClick?: () => void;
  onRemove?: () => void;
}) {
  const detail = [status, project].filter(Boolean).join(" · ");
  const body = (
    <>
      <TaskStatusDot status={status} />
      <span className="min-w-0 truncate font-medium text-foreground">{title}</span>
      {status && <span className="hidden shrink-0 text-text-secondary sm:inline">{status}</span>}
      {project && (
        <span className="hidden min-w-0 shrink truncate text-text-secondary md:inline">
          · {project}
        </span>
      )}
      <AssigneeAvatar ids={assignees} size={16} />
    </>
  );
  const cls =
    "mx-0.5 inline-flex max-w-full items-center gap-1.5 rounded-md border border-border/60 bg-muted/40 px-1.5 py-0.5 align-middle text-xs";
  return (
    <span className="inline-flex max-w-full items-center align-middle">
      {onClick ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClick();
          }}
          title={`Tarefa · ${detail || title}`}
          className={cn(
            cls,
            "cursor-pointer transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
          )}
        >
          {body}
        </button>
      ) : (
        <span title={`Tarefa · ${detail || title}`} className={cls}>
          {body}
          {onRemove && (
            <button
              type="button"
              onClick={onRemove}
              aria-label="Remover referência"
              className="text-text-secondary hover:text-foreground"
            >
              ×
            </button>
          )}
        </span>
      )}
    </span>
  );
}
