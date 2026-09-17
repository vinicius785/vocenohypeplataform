import { Check, Lock } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandEmpty,
} from "@/components/ui/command";
import {
  TASK_STATUSES,
  TASK_STATUS_DOT,
  TASK_STATUS_GROUP_LABEL,
  groupForStatus,
  type TaskStatus,
} from "@/lib/task-status";

/** `Concluído` usa `bg-foreground` em `TASK_STATUS_DOT` (compartilhado
 * com Kanban/dependências, onde faz sentido ficar neutro) — só aqui,
 * pro círculo da subtarefa, sobrescreve pra verde+check como pedido
 * explicitamente, sem tocar a constante compartilhada. */
function dotClassFor(status: TaskStatus): string {
  if (status === "Concluído") return "bg-emerald-500";
  return TASK_STATUS_DOT[status];
}

const GROUP_ORDER: ("not_started" | "active_group" | "done_group")[] = [
  "not_started",
  "active_group",
  "done_group",
];

/**
 * Seletor de status das subtarefas — `Popover`+`Command` (Portal,
 * `z-50`, colisão/flip, busca e navegação por teclado nativas do
 * `cmdk`), substitui o `<select>` nativo disfarçado de círculo que
 * existia antes. Selecionar "Bloqueada" não aplica nada aqui — quem
 * chama decide o que fazer (abrir o questionário) via `onSelectBlocked`.
 */
export function SubtaskStatusPopover({
  value,
  onChange,
  onSelectBlocked,
}: {
  value: TaskStatus;
  onChange: (next: TaskStatus) => void;
  /** Chamado no lugar de `onChange` quando o usuário escolhe
   * "Bloqueada" — o status só muda de verdade depois do questionário
   * confirmado (mesma regra da tarefa principal). */
  onSelectBlocked: () => void;
}) {
  const grouped = GROUP_ORDER.map((g) => ({
    group: g,
    options: TASK_STATUSES.filter((s) => groupForStatus(s) === g),
  }));

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          title={value}
          aria-label={`Status: ${value}`}
          className="relative inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <span className={`h-4 w-4 rounded-full ${dotClassFor(value)}`} />
          {value === "Concluído" && (
            <Check className="pointer-events-none absolute h-2.5 w-2.5 text-background" />
          )}
          {value === "Bloqueada" && (
            <Lock className="pointer-events-none absolute h-2.5 w-2.5 text-white" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        collisionPadding={12}
        className="w-56 overflow-hidden p-0"
        onClick={(e) => e.stopPropagation()}
      >
        <Command>
          <CommandInput placeholder="Buscar status..." />
          <CommandList className="max-h-72">
            <CommandEmpty>Nenhum status encontrado.</CommandEmpty>
            {grouped.map(({ group, options }) => (
              <CommandGroup key={group} heading={TASK_STATUS_GROUP_LABEL[group]}>
                {options.map((s) => (
                  <CommandItem
                    key={s}
                    value={s}
                    onSelect={() => (s === "Bloqueada" ? onSelectBlocked() : onChange(s))}
                    className="flex items-center gap-2"
                  >
                    <span className="relative inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center">
                      <span className={`h-3.5 w-3.5 rounded-full ${dotClassFor(s)}`} />
                      {s === "Concluído" && (
                        <Check className="pointer-events-none absolute h-2 w-2 text-background" />
                      )}
                      {s === "Bloqueada" && (
                        <Lock className="pointer-events-none absolute h-2 w-2 text-white" />
                      )}
                    </span>
                    <span className="flex-1">{s}</span>
                    {s === value && <Check className="h-3.5 w-3.5 shrink-0 text-brand" />}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
