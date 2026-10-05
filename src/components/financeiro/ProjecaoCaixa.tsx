import {
  PROJECTION_HORIZON_OPTIONS,
  computeSaldoAtual,
  fmtBRL,
  projectionBreakdown,
  projectionHorizonTo,
  type Entry,
  type ProjectionHorizon,
} from "@/lib/financeiro-entries";
import type { SaldoInicialConfig } from "@/lib/financeiro-saldo-inicial-store";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { SECONDARY_SURFACE } from "./PosicaoFinanceira";

function Cell({
  label,
  value,
  strong,
  tone,
}: {
  label: string;
  value: string;
  strong?: boolean;
  tone?: "danger";
}) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-text-secondary">{label}</p>
      <p
        className={`mt-0.5 whitespace-nowrap tabular-nums ${
          strong ? "text-xl font-semibold" : "text-base font-medium"
        } ${tone === "danger" ? "text-danger" : "text-foreground"}`}
      >
        {value}
      </p>
    </div>
  );
}

/** Projeção de caixa em uma linha: saldo atual + entradas previstas − saídas previstas = saldo
 * projetado, até um horizonte escolhido. As previstas são os lançamentos em aberto (a receber, a
 * pagar e vencidos) que vencem até o horizonte — as mesmas parcelas de `computeSaldoProjetado`. */
export function ProjecaoCaixa({
  all,
  saldoInicial,
  horizon,
  onHorizonChange,
  onConfigureSaldo,
}: {
  all: Entry[];
  saldoInicial: SaldoInicialConfig;
  horizon: ProjectionHorizon;
  onHorizonChange: (h: ProjectionHorizon) => void;
  onConfigureSaldo: () => void;
}) {
  const saldoAtual = computeSaldoAtual(saldoInicial, all);
  const { entradas, saidas } = projectionBreakdown(all, projectionHorizonTo(horizon));
  const projetado = saldoAtual == null ? null : saldoAtual + entradas - saidas;

  return (
    <section
      id="projecao-caixa"
      aria-labelledby="fin-projecao"
      className={`scroll-mt-6 rounded-2xl ${SECONDARY_SURFACE} p-5`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="fin-projecao" className="text-[15px] font-semibold text-foreground">
          Projeção de caixa
        </h2>
        <NativeSelect
          value={horizon}
          onChange={(e) => onHorizonChange(e.target.value as ProjectionHorizon)}
          aria-label="Horizonte da projeção"
          size="sm"
        >
          {PROJECTION_HORIZON_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
        <Cell label="Saldo atual" value={saldoAtual == null ? "—" : fmtBRL(saldoAtual)} />
        <Cell label="+ Entradas previstas" value={fmtBRL(entradas)} />
        <Cell label="− Saídas previstas" value={fmtBRL(saidas)} />
        <Cell
          label="= Saldo projetado"
          value={projetado == null ? "—" : fmtBRL(projetado)}
          strong
          tone={projetado != null && projetado < 0 ? "danger" : undefined}
        />
      </div>
      {saldoAtual == null && (
        <p className="mt-3 text-xs text-text-secondary">
          O saldo projetado precisa do saldo atual.{" "}
          <Button
            variant="link"
            size="sm"
            className="h-auto p-0 text-xs"
            onClick={onConfigureSaldo}
          >
            Configurar saldo inicial
          </Button>
        </p>
      )}
    </section>
  );
}
