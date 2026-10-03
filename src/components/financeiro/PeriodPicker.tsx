import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { DateField } from "@/components/ui/date-field";
import { NativeSelect } from "@/components/ui/native-select";
import { PERIOD_OPTIONS, type useFinanceiroFilteredEntries } from "./useFinanceiroFilteredEntries";

type Filtered = ReturnType<typeof useFinanceiroFilteredEntries>;

const stepCls =
  "flex h-9 w-8 cursor-pointer items-center justify-center rounded-md border border-border text-text-secondary hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** Contexto global do Financeiro — um grupo compacto: ícone de calendário,
 * o período e, quando é mensal, o mês com setas. Vive na linha de contexto
 * logo abaixo do cabeçalho (uma vez só, vale pra Resumo, Lançamentos e Por
 * campanha), nunca dentro de filtros. */
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

  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Período">
      <CalendarDays className="h-4 w-4 text-text-secondary" aria-hidden="true" />
      <NativeSelect
        value={periodMode}
        onChange={(e) => setPeriodMode(e.target.value as typeof periodMode)}
        aria-label="Período"
        className="w-auto min-w-36"
        selectClassName="font-medium"
      >
        {PERIOD_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </NativeSelect>
      {(periodMode === "este_mes" || periodMode === "mes_passado") && (
        <div className="inline-flex items-center gap-1">
          <button
            type="button"
            onClick={() => setAnchorMonth((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
            className={stepCls}
            aria-label="Mês anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-28 text-center text-sm text-foreground">
            {anchorMonth.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
          </span>
          <button
            type="button"
            onClick={() => setAnchorMonth((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
            className={stepCls}
            aria-label="Próximo mês"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
      {periodMode === "personalizado" && (
        <div className="flex items-center gap-1.5">
          <DateField
            value={customFrom}
            onChange={(v) => setCustomFrom(v ?? customFrom)}
            max={customTo}
            className="h-9 text-sm"
          />
          <span className="text-sm text-text-secondary">até</span>
          <DateField
            value={customTo}
            onChange={(v) => setCustomTo(v ?? customTo)}
            min={customFrom}
            className="h-9 text-sm"
          />
        </div>
      )}
    </div>
  );
}
