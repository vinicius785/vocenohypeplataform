import { useState } from "react";
import { CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { DateField } from "@/components/ui/date-field";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  PERIOD_OPTIONS,
  type PeriodMode,
  type useFinanceiroFilteredEntries,
} from "./useFinanceiroFilteredEntries";

type Filtered = ReturnType<typeof useFinanceiroFilteredEntries>;

const MONTHLY: PeriodMode[] = ["este_mes", "mes_passado"];

/** "Mês passado" fica de fora dos atalhos: é só a seta "‹" do mês atual. */
const PRESETS = PERIOD_OPTIONS.filter((o) => o.value !== "mes_passado");

function monthLabel(d: Date): string {
  const s = d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function fmtShort(iso: string): string {
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${d}/${m}/${y}` : iso;
}

const segCls =
  "flex h-full items-center justify-center text-text-secondary transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent";

/**
 * Contexto global do Financeiro — UMA unidade: `[ ‹ | Outubro de 2026 ▾ | › ]`.
 * Responde "que período estou vendo?" no próprio rótulo; as setas trocam o mês;
 * o centro abre os atalhos (Este mês, Hoje, últimos 30 dias, personalizado…).
 * Não é filtro de dados: aparece uma vez e vale para Resumo, Lançamentos e Por
 * campanha. Em Lançamentos fica na linha de busca/filtros (`AdvancedFilterBar`);
 * nas telas sem essa linha, à direita da navegação do Financeiro. Fora do modo mensal as setas ficam desativadas
 * (escolha "Este mês" para navegar mês a mês).
 */
export function PeriodPicker({ filtered }: { filtered: Filtered }) {
  const {
    periodMode,
    setPeriodMode,
    anchorMonth,
    setAnchorMonth,
    customFrom,
    setCustomFrom,
    customTo,
    setCustomTo,
  } = filtered;
  const [open, setOpen] = useState(false);

  const monthly = MONTHLY.includes(periodMode);
  const shownMonth =
    periodMode === "mes_passado"
      ? new Date(anchorMonth.getFullYear(), anchorMonth.getMonth() - 1, 1)
      : anchorMonth;

  const label = monthly
    ? monthLabel(shownMonth)
    : periodMode === "personalizado"
      ? `${fmtShort(customFrom)} – ${fmtShort(customTo)}`
      : (PERIOD_OPTIONS.find((o) => o.value === periodMode)?.label ?? "Período");

  const now = new Date();
  const isCurrentMonth =
    periodMode === "este_mes" &&
    anchorMonth.getFullYear() === now.getFullYear() &&
    anchorMonth.getMonth() === now.getMonth();

  const stepMonth = (delta: number) => {
    setPeriodMode("este_mes");
    setAnchorMonth(new Date(shownMonth.getFullYear(), shownMonth.getMonth() + delta, 1));
  };

  const choose = (value: PeriodMode) => {
    if (value === "este_mes") setAnchorMonth(new Date());
    setPeriodMode(value);
    if (value !== "personalizado") setOpen(false);
  };

  return (
    <div className="flex min-w-0 items-center gap-2" role="group" aria-label="Período">
      <span className="text-sm text-text-secondary">Período</span>
      <div className="inline-flex h-9 min-w-0 items-stretch divide-x divide-border overflow-hidden rounded-md border border-border bg-background">
        <button
          type="button"
          onClick={() => stepMonth(-1)}
          disabled={!monthly}
          aria-label="Mês anterior"
          className={cn(segCls, "w-8 shrink-0")}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={`Período: ${label}. Alterar`}
              className={cn(segCls, "min-w-0 gap-2 px-3 text-sm font-medium text-foreground")}
            >
              <CalendarDays className="h-4 w-4 shrink-0 text-text-secondary" aria-hidden="true" />
              <span className="truncate">{label}</span>
              <ChevronDown
                className="h-3.5 w-3.5 shrink-0 text-text-secondary"
                aria-hidden="true"
              />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-60 p-1.5">
            <div role="listbox" aria-label="Atalhos de período">
              {PRESETS.map((o) => {
                const active = o.value === "este_mes" ? isCurrentMonth : periodMode === o.value;
                return (
                  <button
                    key={o.value}
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => choose(o.value)}
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
            {periodMode === "personalizado" && (
              <div className="mt-1.5 space-y-2 border-t border-border/60 px-1.5 pb-1.5 pt-2.5">
                <label className="block text-xs text-text-secondary">
                  De
                  <DateField
                    value={customFrom}
                    onChange={(v) => setCustomFrom(v ?? customFrom)}
                    max={customTo}
                    className="mt-1 h-9 text-sm"
                  />
                </label>
                <label className="block text-xs text-text-secondary">
                  Até
                  <DateField
                    value={customTo}
                    onChange={(v) => setCustomTo(v ?? customTo)}
                    min={customFrom}
                    className="mt-1 h-9 text-sm"
                  />
                </label>
              </div>
            )}
          </PopoverContent>
        </Popover>
        <button
          type="button"
          onClick={() => stepMonth(1)}
          disabled={!monthly}
          aria-label="Próximo mês"
          className={cn(segCls, "w-8 shrink-0")}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
