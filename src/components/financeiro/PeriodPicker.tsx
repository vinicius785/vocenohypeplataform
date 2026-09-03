import { DateField } from "@/components/ui/date-field";
import { PERIOD_OPTIONS, type useFinanceiroFilteredEntries } from "./useFinanceiroFilteredEntries";

type Filtered = ReturnType<typeof useFinanceiroFilteredEntries>;

/** Seletor de período único, compartilhado por todas as abas — vive no
 * cabeçalho, não duplicado dentro de Lançamentos. */
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
    <div className="flex flex-wrap items-center gap-1.5">
      <select
        value={periodMode}
        onChange={(e) => setPeriodMode(e.target.value as typeof periodMode)}
        className="h-8 cursor-pointer rounded-md border border-border bg-background px-2 text-xs outline-none focus:ring-2 focus:ring-ring"
      >
        {PERIOD_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {(periodMode === "este_mes" || periodMode === "mes_passado") && (
        <div className="inline-flex items-center gap-1">
          <button
            type="button"
            onClick={() => setAnchorMonth((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
            className="cursor-pointer rounded-md border border-border px-1.5 py-1 text-xs hover:bg-muted"
            aria-label="Mês anterior"
          >
            ‹
          </button>
          <span className="min-w-24 text-center text-xs text-muted-foreground">
            {anchorMonth.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
          </span>
          <button
            type="button"
            onClick={() => setAnchorMonth((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
            className="cursor-pointer rounded-md border border-border px-1.5 py-1 text-xs hover:bg-muted"
            aria-label="Próximo mês"
          >
            ›
          </button>
        </div>
      )}
      {periodMode === "personalizado" && (
        <div className="flex items-center gap-1.5">
          <DateField
            value={customFrom}
            onChange={(v) => setCustomFrom(v ?? customFrom)}
            max={customTo}
            className="h-8 text-xs"
          />
          <span className="text-xs text-muted-foreground">até</span>
          <DateField
            value={customTo}
            onChange={(v) => setCustomTo(v ?? customTo)}
            min={customFrom}
            className="h-8 text-xs"
          />
        </div>
      )}
    </div>
  );
}
