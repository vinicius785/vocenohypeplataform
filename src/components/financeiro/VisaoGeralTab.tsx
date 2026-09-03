import { useMemo } from "react";
import { kpiTotals, fmtBRL } from "@/lib/financeiro-entries";
import {
  matchesFilters,
  previousPeriodRange,
  type useFinanceiroFilteredEntries,
} from "./useFinanceiroFilteredEntries";
import { Kpi } from "./shared";

type Filtered = ReturnType<typeof useFinanceiroFilteredEntries>;

function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? null : null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

/** Seta+% pequenos, sem cor exagerada — subir despesa não é "ruim" por si
 * só, então não colore por sinal de crescimento (regra explícita do
 * pedido). Só o texto discreto, sem verde/vermelho aqui. */
function Delta({ pct }: { pct: number | null }) {
  if (pct == null) return null;
  const arrow = pct >= 0 ? "↑" : "↓";
  return (
    <span className="text-[10px] text-muted-foreground">
      {arrow} {Math.abs(pct).toFixed(1)}% vs. período anterior
    </span>
  );
}

export function VisaoGeralTab({ filtered }: { filtered: Filtered }) {
  const { all, visible, range, filters } = filtered;

  const totals = useMemo(() => kpiTotals(visible), [visible]);

  const previousTotals = useMemo(() => {
    const prevRange = previousPeriodRange(range);
    const prevEntries = all.filter(
      (e) =>
        e.vencimento >= prevRange.from &&
        e.vencimento <= prevRange.to &&
        matchesFilters(e, filters),
    );
    return kpiTotals(prevEntries);
  }, [all, range, filters]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-x-6 gap-y-3 overflow-x-auto pb-1">
        <Kpi
          label="Receita realizada"
          value={fmtBRL(totals.receitaRealizada)}
          sub={<Delta pct={pctChange(totals.receitaRealizada, previousTotals.receitaRealizada)} />}
        />
        <Kpi label="A receber" value={fmtBRL(totals.aReceber)} />
        <Kpi
          label="Despesas realizadas"
          value={fmtBRL(totals.despesaRealizada)}
          sub={<Delta pct={pctChange(totals.despesaRealizada, previousTotals.despesaRealizada)} />}
        />
        <Kpi label="A pagar" value={fmtBRL(totals.aPagar)} />
        <Kpi label="Saldo realizado" value={fmtBRL(totals.saldoRealizado)} />
        <Kpi label="Saldo projetado" value={fmtBRL(totals.saldoProjetado)} />
      </div>

      {visible.length === 0 && (
        <p className="rounded-lg border border-border bg-background px-4 py-12 text-center text-xs text-muted-foreground">
          Nenhum lançamento encontrado neste período.
        </p>
      )}
    </div>
  );
}
