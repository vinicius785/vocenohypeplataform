import { useState } from "react";
import { CalendarDays, Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/**
 * Contexto de período para módulos com poucos atalhos fixos (Comercial…):
 * `Período [ 📅 Este mês ▾ ]` — uma unidade só, com a mesma anatomia do
 * controle do Financeiro (que ainda soma setas de mês). O rótulo responde
 * "que período estou vendo?" e os atalhos abrem num popover. Não é filtro
 * de dados: vive na linha de busca/filtros/ordenação, no fim, uma vez por
 * página (padrão da plataforma — ver DESIGN-SYSTEM.md, princípio 3).
 */
export function PeriodMenu<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value) ?? options[0];

  return (
    <div className="flex min-w-0 items-center gap-2" role="group" aria-label="Período">
      <span className="text-sm text-text-secondary">Período</span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={`Período: ${current.label}. Alterar`}
            className="inline-flex h-9 min-w-0 items-center gap-2 rounded-md border border-border bg-background px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <CalendarDays className="h-4 w-4 shrink-0 text-text-secondary" aria-hidden="true" />
            <span className="truncate">{current.label}</span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-text-secondary" aria-hidden="true" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-52 p-1.5">
          <div role="listbox" aria-label="Atalhos de período">
            {options.map((o) => {
              const active = o.value === value;
              return (
                <button
                  key={o.value}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    active ? "font-medium text-foreground" : "text-text-secondary",
                  )}
                >
                  {o.label}
                  {active && <Check className="h-3.5 w-3.5 text-foreground" />}
                </button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
