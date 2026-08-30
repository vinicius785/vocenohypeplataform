"use client";

import * as React from "react";
import { CalendarIcon, Repeat, X } from "lucide-react";
import type { Matcher } from "react-day-picker";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

import { cn, formatDateToIso, formatIsoDate, parseIsoDateLocal } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  type TaskRecurrence,
  type TaskRecurrenceUnit,
  RECURRENCE_UNIT_LABEL,
  WEEKDAY_SHORT_LABELS,
  describeRecurrence,
} from "@/lib/task-recurrence";

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

const RECURRENCE_UNIT_OPTIONS: TaskRecurrenceUnit[] = ["dias", "semanas", "meses"];

/** Formulário de recorrência — substitui o conteúdo do popover inteiro
 * enquanto ativo (em vez de abrir um diálogo à parte), no mesmo espírito
 * do seletor do ClickUp ("Configurar recorrência" dentro do próprio
 * calendário). Só grava de verdade quando o consumidor confirma
 * (`onSave`) — nunca no meio da edição. */
function RecurrenceForm({
  initial,
  onCancel,
  onSave,
}: {
  initial?: TaskRecurrence;
  onCancel: () => void;
  onSave: (r: TaskRecurrence) => void;
}) {
  const [intervalValue, setIntervalValue] = React.useState(initial?.interval ?? 1);
  const [unit, setUnit] = React.useState<TaskRecurrenceUnit>(initial?.unit ?? "semanas");
  const [weekdays, setWeekdays] = React.useState<number[]>(initial?.weekdays ?? []);

  const toggleWeekday = (d: number) =>
    setWeekdays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()));

  const confirm = () => {
    onSave({
      interval: Math.max(1, Math.floor(intervalValue) || 1),
      unit,
      weekdays: unit === "semanas" && weekdays.length > 0 ? weekdays : undefined,
    });
  };

  return (
    <div className="w-72 p-3">
      <p className="text-xs font-semibold text-foreground">Recorrência</p>
      <p className="mt-1 text-[11px] text-muted-foreground">
        Ao concluir, a tarefa volta sozinha pra "Aberto" com um novo prazo — nunca cria uma cópia.
      </p>

      <div className="mt-3 flex items-center gap-2">
        <span className="text-xs text-muted-foreground">A cada</span>
        <input
          type="number"
          min={1}
          value={intervalValue}
          onChange={(e) => setIntervalValue(Number(e.target.value))}
          className="h-8 w-16 rounded-md border border-input bg-background px-2 text-sm outline-none focus:ring-1 focus:ring-ring"
        />
        <select
          value={unit}
          onChange={(e) => setUnit(e.target.value as TaskRecurrenceUnit)}
          className="h-8 flex-1 rounded-md border border-input bg-background px-2 text-sm outline-none focus:ring-1 focus:ring-ring"
        >
          {RECURRENCE_UNIT_OPTIONS.map((u) => (
            <option key={u} value={u}>
              {RECURRENCE_UNIT_LABEL[u].plural}
            </option>
          ))}
        </select>
      </div>

      {unit === "semanas" && (
        <div className="mt-3">
          <p className="mb-1.5 text-[11px] text-muted-foreground">
            Em dias específicos (opcional — sem isso, repete no mesmo dia da conclusão)
          </p>
          <div className="flex flex-wrap gap-1">
            {WEEKDAY_SHORT_LABELS.map((label, i) => (
              <button
                key={label}
                type="button"
                onClick={() => toggleWeekday(i)}
                className={`h-7 w-9 rounded-md text-[11px] font-medium capitalize transition-colors ${
                  weekdays.includes(i)
                    ? "bg-foreground text-background"
                    : "border border-border text-muted-foreground hover:bg-muted"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 flex items-center justify-end gap-2 border-t border-border pt-3">
        <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="button" size="sm" className="h-7 text-xs" onClick={confirm}>
          Salvar
        </Button>
      </div>
    </div>
  );
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
  /** Presença de `onRecurrenceChange` liga a seção de recorrência dentro
   * do popover (item "Configurar recorrência", igual ao ClickUp) — sem
   * ele, o `DateField` fica exatamente como em qualquer outro lugar do
   * app (Reuniões, Financeiro, Metas etc.), sem nenhuma UI extra. Hoje só
   * o campo "Entrega" de tarefas (`TaskBoard.tsx`) passa isso. */
  recurrence?: TaskRecurrence;
  onRecurrenceChange?: (r: TaskRecurrence | undefined) => void;
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
  recurrence,
  onRecurrenceChange,
}: DateFieldProps) {
  const [open, setOpen] = React.useState(false);
  const [showRecurrenceForm, setShowRecurrenceForm] = React.useState(false);
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
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setShowRecurrenceForm(false);
      }}
    >
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
          {recurrence && <Repeat className="h-3 w-3 shrink-0" />}
          <span className="truncate">{value ? formatIsoDate(value) : placeholder}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto max-w-[calc(100vw-2rem)] p-0">
        {showRecurrenceForm && onRecurrenceChange ? (
          <RecurrenceForm
            initial={recurrence}
            onCancel={() => setShowRecurrenceForm(false)}
            onSave={(r) => {
              onRecurrenceChange(r);
              setShowRecurrenceForm(false);
            }}
          />
        ) : (
          <div className="flex max-w-full">
            <div
              className={cn(
                "flex shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-border p-1.5",
                onRecurrenceChange ? "w-48" : "w-36",
              )}
            >
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
              {onRecurrenceChange && (
                <div className="mt-1 border-t border-border pt-1">
                  {recurrence ? (
                    <div className="flex items-center gap-0.5">
                      <button
                        type="button"
                        onClick={() => setShowRecurrenceForm(true)}
                        className="flex h-7 min-w-0 flex-1 items-center gap-1.5 rounded-md px-2 text-left text-[11px] font-normal text-foreground hover:bg-muted"
                      >
                        <Repeat className="h-3 w-3 shrink-0" />
                        <span className="truncate">{describeRecurrence(recurrence)}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onRecurrenceChange(undefined)}
                        aria-label="Remover recorrência"
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-destructive"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 w-full justify-start gap-1.5 px-2 text-[11px] font-normal text-muted-foreground"
                      onClick={() => setShowRecurrenceForm(true)}
                    >
                      <Repeat className="h-3 w-3 shrink-0" />
                      <span className="truncate">Configurar recorrência</span>
                    </Button>
                  )}
                </div>
              )}
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
        )}
      </PopoverContent>
    </Popover>
  );
}
