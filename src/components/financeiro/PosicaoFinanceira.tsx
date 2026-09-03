import { kpiTotals, fmtBRL, type Entry } from "@/lib/financeiro-entries";

/** Uma única área financeira principal — número protagonista (saldo
 * projetado) + composição em texto, sem seis KPIs com o mesmo peso.
 * "A receber"/"A pagar"/"Realizado" são clicáveis (navegam pra visão
 * correspondente), o resto é só leitura. */
export function PosicaoFinanceira({
  visible,
  onNavigateToAReceber,
  onNavigateToAPagar,
}: {
  visible: Entry[];
  onNavigateToAReceber: () => void;
  onNavigateToAPagar: () => void;
}) {
  const totals = kpiTotals(visible);
  const realizado = totals.saldoRealizado;

  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Saldo projetado
      </p>
      <p className="text-4xl font-bold tabular-nums text-foreground">
        {fmtBRL(totals.saldoProjetado)}
      </p>
      <p className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-muted-foreground">
        <span className="tabular-nums text-foreground">{fmtBRL(realizado)}</span> realizado
        <span className="mx-0.5">+</span>
        <button
          type="button"
          onClick={onNavigateToAReceber}
          className="cursor-pointer tabular-nums text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground"
        >
          {fmtBRL(totals.aReceber)}
        </button>
        a receber
        <span className="mx-0.5">−</span>
        <button
          type="button"
          onClick={onNavigateToAPagar}
          className="cursor-pointer tabular-nums text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground"
        >
          {fmtBRL(totals.aPagar)}
        </button>
        a pagar
        <span className="mx-0.5">=</span>
        <span className="font-medium tabular-nums text-foreground">
          {fmtBRL(totals.saldoProjetado)}
        </span>
        projetado
      </p>
    </div>
  );
}
