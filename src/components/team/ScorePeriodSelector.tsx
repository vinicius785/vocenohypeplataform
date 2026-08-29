import { SCORE_PERIOD_OPTIONS, type ScorePeriodMode } from "@/lib/performance-engine";

/** Seletor de período do Score Operacional (item 3) — mesmo padrão
 * `<select>` de modo já usado em Financeiro (`PeriodMode`), só sem o
 * modo "personalizado" (não pedido aqui). */
export function ScorePeriodSelector({
  value,
  onChange,
}: {
  value: ScorePeriodMode;
  onChange: (v: ScorePeriodMode) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as ScorePeriodMode)}
      className="h-8 rounded-md border border-border bg-background px-2 text-xs outline-none focus:ring-2 focus:ring-ring"
    >
      {SCORE_PERIOD_OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
