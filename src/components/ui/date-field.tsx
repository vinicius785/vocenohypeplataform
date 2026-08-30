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

function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

/** Próxima ocorrência (estritamente no futuro, nunca hoje) do dia da
 * semana `targetDow` (0=domingo...6=sábado) a partir de `from`. */
function nextWeekday(from: Date, targetDow: number): Date {
  const add = (targetDow - from.getDay() + 7) % 7 || 7;
  return addDays(from, add);
}

/** Atalhos de data no mesmo espírito do seletor do ClickUp — Hoje/Amanhã
 * pro imediato, "Semana que vem"/"Próximo fim de semana" pros próximos
 * marcos naturais, e 2/4/8 semanas pra prazos de médio prazo. Cada um só
 * aparece se a data resultante estiver dentro de `min`/`max` (quando
 * informados). */
function buildQuickOptions(today: Date): { label: string; date: Date }[] {
  return [
    { label: "Hoje", date: today },
    { label: "Amanhã", date: addDays(today, 1) },
    { label: "Semana que vem", date: nextWeekday(today, 1) },
    { label: "Próximo fim de semana", date: nextWeekday(today, 6) },
    { label: "2 semanas", date: addDays(today, 14) },
    { label: "4 semanas", date: addDays(today, 28) },
    { label: "8 semanas", date: addDays(today, 56) },
  ];
}

/** Legenda curta à direita de cada atalho: dia da semana pros próximos 6
 * dias (como o ClickUp mostra "dom"/"seg"), data curta ("13 set") pros
 * atalhos mais distantes — nunca os dois ao mesmo tempo. */
function quickOptionHint(date: Date, today: Date): string {
  const diffDays = Math.round((date.getTime() - today.getTime()) / 86400000);
  if (diffDays <= 6) return format(date, "EEE", { locale: ptBR });
  return format(date, "d MMM", { locale: ptBR });
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
  today.setHours(0, 0, 0, 0);
  const quickOptions = buildQuickOptions(today).filter((o) => isAllowed(o.date));

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
        <div className="flex max-w-full">
          <div className="flex w-36 shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-border p-1.5">
            {quickOptions.map((o) => (
              <Button
                key={o.label}
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 justify-between px-2 text-xs font-normal"
                onClick={() => pick(o.date)}
              >
                <span>{o.label}</span>
                <span className="text-muted-foreground">{quickOptionHint(o.date, today)}</span>
              </Button>
            ))}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mt-1 h-7 justify-start px-2 text-xs font-normal text-muted-foreground"
              onClick={() => pick(undefined)}
            >
              Limpar
            </Button>
          </div>
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
        </div>
      </PopoverContent>
    </Popover>
  );
}
