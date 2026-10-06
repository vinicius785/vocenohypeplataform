import { MoreHorizontal } from "lucide-react";
import { Avatar, useTeamMembers } from "@/components/tasks/task-people";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TASK_STATUS_DOT, type TaskStatus } from "@/lib/task-status";
import { cn, formatIsoDate } from "@/lib/utils";

export type DependencyRelation = {
  id: string;
  title: string;
  status?: string;
  assignees: string[];
  dueDate?: string;
  /** Tarefa relacionada ainda não concluída. */
  pending: boolean;
  onOpen: () => void;
  onRemove: () => void;
};

/** Relação de dependência como PROPRIEDADE da tarefa: um rótulo de grupo e, por relação,
 * título + (status · responsável · prazo) em duas linhas — sem card, sem borda. */
export function TaskDependencyGroup({
  tone,
  label,
  relations,
}: {
  /** "danger" = bloqueada por tarefa aberta; "warning" = esta bloqueia; "neutral" = já liberada. */
  tone: "danger" | "warning" | "neutral";
  label: string;
  relations: DependencyRelation[];
}) {
  const members = useTeamMembers();
  if (relations.length === 0) return null;
  return (
    <div className="space-y-1">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold text-foreground">
        <span
          aria-hidden
          className={cn(
            "h-2 w-2 rounded-full",
            tone === "danger" && "bg-danger",
            tone === "warning" && "bg-warning",
            tone === "neutral" && "bg-muted-foreground/50",
          )}
        />
        {label}
      </p>
      <ul className="space-y-0.5 pl-3.5">
        {relations.map((r) => {
          const nome = r.assignees[0];
          const member = nome
            ? (members.find((m) => m.name.toLowerCase() === nome.toLowerCase()) ?? {
                name: nome,
                initials: nome.slice(0, 2).toUpperCase(),
                color: "bg-muted text-text-secondary",
              })
            : null;
          return (
            <li key={r.id} className="group flex items-start gap-1 rounded-md hover:bg-muted/40">
              <button
                type="button"
                onClick={r.onOpen}
                className="min-w-0 flex-1 rounded-md px-1.5 py-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                <span className="block text-sm font-medium leading-snug text-foreground">
                  {r.title}
                </span>
                <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-text-secondary">
                  {r.status && (
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        aria-hidden
                        className={cn(
                          "h-2 w-2 rounded-full",
                          TASK_STATUS_DOT[r.status as TaskStatus] ?? "bg-muted-foreground/50",
                        )}
                      />
                      {r.status}
                    </span>
                  )}
                  {member && (
                    <span className="inline-flex items-center gap-1">
                      <Avatar member={member} size={16} />
                      {member.name}
                      {r.assignees.length > 1 && ` +${r.assignees.length - 1}`}
                    </span>
                  )}
                  {r.dueDate && <span className="tabular-nums">{formatIsoDate(r.dueDate)}</span>}
                </span>
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label="Ações da dependência"
                    className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-text-secondary hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100 data-[state=open]:opacity-100"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={r.onOpen}>Abrir tarefa</DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={r.onRemove}
                    className="text-destructive focus:text-destructive"
                  >
                    Remover dependência
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
