import { Check, User } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Avatar, initialsOf, colorFor, type Member } from "@/components/tasks/task-people";

/**
 * Responsável da subtarefa — `Popover` com Portal (substitui o antigo
 * `CompactAssigneePicker`, uma `div absolute` sem Portal usada só na
 * criação; aqui serve tanto criação quanto edição inline de uma
 * subtarefa já existente). Lista vem de `members`, já escopada ao
 * projeto/campanha da tarefa-mãe — "só pessoas com acesso" já é
 * satisfeito de graça, é a mesma lista do Responsável da tarefa
 * principal.
 */
export function SubtaskAssigneePopover({
  selected,
  members,
  onToggle,
  showName,
}: {
  selected: string[];
  members: Member[];
  onToggle: (name: string) => void;
  /** Mostra o primeiro nome ao lado do avatar quando há 1 responsável
   * (coluna "Responsável" da lista de subtarefas). */
  showName?: boolean;
}) {
  const MAX_VISIBLE = 2;
  const visible = selected.slice(0, MAX_VISIBLE);
  const overflow = selected.slice(MAX_VISIBLE);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          aria-label={selected.length ? `Responsáveis: ${selected.join(", ")}` : "Sem responsável"}
          className="flex h-6 min-w-0 max-w-full items-center gap-1 rounded px-1 outline-none hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-brand"
        >
          {selected.length === 0 ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <User className="h-4 w-4 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent>Sem responsável</TooltipContent>
            </Tooltip>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex items-center -space-x-1.5">
                  {visible.map((name) => (
                    <Avatar
                      key={name}
                      member={
                        members.find((m) => m.name === name) ?? {
                          name,
                          initials: initialsOf(name) || "?",
                          color: colorFor(name),
                        }
                      }
                      size={18}
                    />
                  ))}
                  {overflow.length > 0 && (
                    <span className="z-10 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-medium text-muted-foreground ring-2 ring-card">
                      +{overflow.length}
                    </span>
                  )}
                  {showName && selected.length === 1 && (
                    <span className="ml-2.5 max-w-[56px] truncate text-xs text-foreground">
                      {selected[0].split(" ")[0]}
                    </span>
                  )}
                </span>
              </TooltipTrigger>
              <TooltipContent>{selected.join(", ")}</TooltipContent>
            </Tooltip>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        collisionPadding={12}
        className="w-56 max-h-64 overflow-auto p-1"
        onClick={(e) => e.stopPropagation()}
      >
        {members.length === 0 ? (
          <div className="px-2 py-2 text-xs text-muted-foreground">Nenhum membro cadastrado.</div>
        ) : (
          members.map((m) => {
            const checked = selected.includes(m.name);
            return (
              <button
                key={m.name}
                type="button"
                onClick={() => onToggle(m.name)}
                className={`flex w-full items-center gap-2 rounded px-1.5 py-1.5 text-left text-sm hover:bg-muted ${
                  checked ? "bg-muted/60" : ""
                }`}
              >
                <Avatar member={m} size={20} />
                <span className="min-w-0 flex-1 truncate">{m.name}</span>
                {checked && <Check className="h-3.5 w-3.5 shrink-0 text-text-brand" />}
              </button>
            );
          })
        )}
      </PopoverContent>
    </Popover>
  );
}
