import { Check, Flag } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { TASK_PRIORITIES, PRIORITY_TONE, type TaskPriority } from "@/components/tasks/TaskBoard";

/**
 * Prioridade da subtarefa — `Popover` compacto substituindo o `<select>`
 * nativo. Mantém as 4 prioridades já existentes no sistema (ver decisão
 * no plano sobre não introduzir um 5º valor "sem prioridade" — "Normal"
 * já cumpre esse papel de padrão neutro em todo o app).
 */
export function SubtaskPriorityPopover({
  value,
  onChange,
}: {
  value: TaskPriority;
  onChange: (next: TaskPriority) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className={`flex h-6 shrink-0 items-center gap-1 rounded px-1.5 text-[11px] font-medium outline-none hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-brand ${PRIORITY_TONE[value]}`}
        >
          <Flag className="h-3 w-3 shrink-0" />
          {value}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        collisionPadding={12}
        className="w-40 p-1"
        onClick={(e) => e.stopPropagation()}
      >
        {TASK_PRIORITIES.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onChange(p)}
            className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-muted ${PRIORITY_TONE[p]}`}
          >
            <Flag className="h-3 w-3 shrink-0" />
            <span className="flex-1">{p}</span>
            {p === value && <Check className="h-3.5 w-3.5 shrink-0" />}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
