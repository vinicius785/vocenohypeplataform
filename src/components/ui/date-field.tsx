"use client";

import * as React from "react";
import { CalendarIcon } from "lucide-react";
import type { Matcher } from "react-day-picker";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

import { cn, formatDateToIso, formatIsoDate, parseIsoDateLocal } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/** react-day-picker usa locale en-US por padrão (nomes de mês/dia em
 * inglês) se nenhum `locale` for passado — força pt-BR, e capitaliza a
 * legenda do mês ("agosto 2026" → "Agosto 2026", como o date-fns pt-BR
 * devolve em minúsculo). */
function formatCaption(date: Date): string {
  const s = format(date, "LLLL yyyy", { locale: ptBR });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export type DateFieldProps = {
  value?: string;
  onChange: (value: string | undefined) => void;
  placeholder?: string;
  /** YYYY-MM-DD — dias antes desta data ficam desabilitados. */
  min?: string;
  /** YYYY-MM-DD — dias depois desta data ficam desabilitados. */
  max?: string;
  /** Só decorativo: sombreia os dias entre as duas datas quando ambas existirem. */
  rangeStart?: string;
  rangeEnd?: string;
  /** "input" = chip com borda, pro uso geral. "inline" = sem borda/fundo,
   * pra encaixar numa linha já existente (ex. campo Prazo de tarefas). */
  variant?: "input" | "inline";
  ariaLabel?: string;
  className?: string;
};

/**
 * Campo de data próprio (popover + calendário do design system), no lugar
 * do `<input type="date">` nativo. `value`/`onChange` continuam strings
 * `YYYY-MM-DD` puras — o `Date` é só um detalhe interno pro
 * `react-day-picker`, nunca vaza pro chamador (evita bug de fuso: nunca
 * usa `.toISOString()`).
 */
export function DateField({
  value,
  onChange,
  placeholder = "Selecionar data",
  min,
  max,
  rangeStart,
  rangeEnd,
  variant = "input",
  ariaLabel,
  className,
}: DateFieldProps) {
  const [open, setOpen] = React.useState(false);
  const triggerRef = React.useRef<HTMLButtonElement>(null);

  const selected = value ? parseIsoDateLocal(value) : undefined;
  const minDate = min ? parseIsoDateLocal(min) : undefined;
  const maxDate = max ? parseIsoDateLocal(max) : undefined;

  const disabledMatchers: Matcher[] = [];
  if (minDate) disabledMatchers.push({ before: minDate });
  if (maxDate) disabledMatchers.push({ after: maxDate });

  const isAllowed = (d: Date) => {
    if (minDate && d < minDate) return false;
    if (maxDate && d > maxDate) return false;
    return true;
  };

  const rangeStartDate = rangeStart ? parseIsoDateLocal(rangeStart) : undefined;
  const rangeEndDate = rangeEnd ? parseIsoDateLocal(rangeEnd) : undefined;
  const hasRange = rangeStartDate && rangeEndDate;

  const pick = (d: Date | undefined) => {
    onChange(d ? formatDateToIso(d) : undefined);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          ref={triggerRef}
          type="button"
          aria-label={ariaLabel ?? placeholder}
          className={cn(
            "inline-flex cursor-pointer items-center gap-1.5 text-left text-sm outline-none transition-colors focus-visible:ring-1 focus-visible:ring-ring",
            variant === "input" &&
              "w-full rounded-md border border-input bg-background px-3 py-2 shadow-sm hover:bg-accent/40",
            variant === "inline" && "-mx-1 rounded px-1 py-0.5 hover:bg-muted/40",
            !value && "text-muted-foreground",
            className,
          )}
        >
          {variant === "input" && (
            <CalendarIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          )}
          <span className="truncate">{value ? formatIsoDate(value) : placeholder}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto max-w-[calc(100vw-2rem)] p-0">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={pick}
          defaultMonth={selected}
          locale={ptBR}
          formatters={{ formatCaption }}
          disabled={disabledMatchers.length > 0 ? disabledMatchers : undefined}
          modifiers={
            hasRange ? { inRange: { after: rangeStartDate, before: rangeEndDate } } : undefined
          }
          modifiersClassNames={hasRange ? { inRange: "bg-accent/50 rounded-none" } : undefined}
        />
        <div className="flex items-center gap-1 border-t border-border p-2">
          {isAllowed(today) && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 flex-1 text-xs"
              onClick={() => pick(today)}
            >
              Hoje
            </Button>
          )}
          {isAllowed(tomorrow) && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 flex-1 text-xs"
              onClick={() => pick(tomorrow)}
            >
              Amanhã
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 flex-1 text-xs text-muted-foreground"
            onClick={() => pick(undefined)}
          >
            Limpar
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
