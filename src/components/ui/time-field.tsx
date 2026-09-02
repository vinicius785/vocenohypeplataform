"use client";

import * as React from "react";
import { Clock, Check } from "lucide-react";

import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const TIME_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/;

function buildOptions(): string[] {
  const out: string[] = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 15) {
      out.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    }
  }
  return out;
}
const OPTIONS = buildOptions();

export type TimeFieldProps = {
  value: string; // "HH:MM"
  onChange: (value: string) => void;
  placeholder?: string;
  /** Desabilita (visualmente, sem impedir digitação manual) horários
   * `<= min` — usado pro campo "Fim" nunca sugerir algo antes do
   * "Início" na lista, sem travar a validação real pro chamador. */
  min?: string;
  ariaLabel?: string;
  className?: string;
};

/**
 * Seletor de horário próprio da plataforma — popover sólido com lista de
 * horários de 15 em 15 min (scrollável, destaca o selecionado) + campo
 * de digitação livre no topo pra qualquer horário específico (a lista
 * sugere, nunca limita). Pensado pra ser reutilizável em qualquer lugar
 * que precise escolher hora (reuniões, tarefas, disponibilidade, agenda).
 */
export function TimeField({
  value,
  onChange,
  placeholder = "Horário",
  min,
  ariaLabel,
  className,
}: TimeFieldProps) {
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState(value);
  const listRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    if (open) setDraft(value);
  }, [open, value]);

  React.useEffect(() => {
    if (!open) return;
    // Rola a lista pra deixar o horário atual visível ao abrir, sem
    // animação — é só posicionamento inicial, não uma interação.
    const el = listRef.current?.querySelector<HTMLElement>('[data-selected="true"]');
    el?.scrollIntoView({ block: "center" });
  }, [open]);

  const commitDraft = () => {
    const v = draft.trim();
    if (TIME_RE.test(v)) onChange(v);
    else setDraft(value);
  };

  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
    triggerRef.current?.focus();
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          ref={triggerRef}
          type="button"
          aria-label={ariaLabel ?? placeholder}
          className={cn(
            "inline-flex w-full cursor-pointer items-center gap-1.5 rounded-md border border-input bg-background px-3 py-2 text-left text-sm shadow-sm outline-none transition-colors hover:bg-accent/40 focus-visible:ring-1 focus-visible:ring-ring",
            !value && "text-muted-foreground",
            className,
          )}
        >
          <Clock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate tabular-nums">{value || placeholder}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-40 p-0">
        <div className="border-b border-border p-2">
          <input
            type="text"
            inputMode="numeric"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitDraft}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitDraft();
                setOpen(false);
                triggerRef.current?.focus();
              }
            }}
            placeholder="HH:MM"
            className="h-8 w-full rounded-md border border-input bg-background px-2 text-center text-sm tabular-nums outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <div ref={listRef} className="max-h-56 overflow-y-auto p-1">
          {OPTIONS.map((t) => {
            const selected = t === value;
            const disabled = !!min && t <= min;
            return (
              <button
                key={t}
                type="button"
                data-selected={selected}
                disabled={disabled}
                onClick={() => pick(t)}
                className={cn(
                  "flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-sm tabular-nums transition-colors",
                  disabled ? "cursor-not-allowed text-muted-foreground/40" : "hover:bg-muted",
                  selected && "bg-muted font-medium text-foreground",
                )}
              >
                {t}
                {selected && <Check className="h-3.5 w-3.5 shrink-0" />}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
