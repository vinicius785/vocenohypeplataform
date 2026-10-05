import type { ReactNode } from "react";
import { KpiCell, KpiStrip } from "@/components/shared/Kpi";
import type { AeoResposta } from "@/lib/aeo-store";
import {
  kpiPrimeiroLugar,
  kpiPromptsSemPresenca,
  kpiTop3,
  kpiVisibilidadeGeral,
} from "@/lib/aeo-engine";

/** Variação contra a rodada de comparação — cor só aqui, onde ela carrega significado.
 * `goodWhenUp=false` para "sem presença" (subir é ruim). */
function delta(d: number | null, unit: "pp" | "", goodWhenUp = true): ReactNode {
  if (d === null) return undefined;
  if (d === 0) return <span>Igual à rodada de comparação</span>;
  const good = goodWhenUp ? d > 0 : d < 0;
  return (
    <span className={good ? "text-success-soft-foreground" : "text-danger-soft-foreground"}>
      {d > 0 ? "+" : ""}
      {d}
      {unit} vs. comparação
    </span>
  );
}

/** Resumo executivo da rodada: UMA faixa de 4 números (mesmas funções do domínio de sempre). */
export function ResumoRodada({
  respostas,
  rodadaId,
  rodadaComparacaoId,
  onVerSemPresenca,
}: {
  respostas: AeoResposta[];
  rodadaId: string;
  rodadaComparacaoId?: string;
  onVerSemPresenca: () => void;
}) {
  const visibilidade = kpiVisibilidadeGeral(respostas, rodadaId, rodadaComparacaoId);
  const top3 = kpiTop3(respostas, rodadaId, rodadaComparacaoId);
  const primeiro = kpiPrimeiroLugar(respostas, rodadaId, rodadaComparacaoId);
  const sem = kpiPromptsSemPresenca(respostas, rodadaId, rodadaComparacaoId);

  return (
    <KpiStrip aria-label="Resumo da rodada">
      <KpiCell
        label="Visibilidade geral"
        value={`${visibilidade.valor}%`}
        complement={delta(visibilidade.deltaPP, "pp")}
      />
      <KpiCell label="Top 3" value={`${top3.valor}%`} complement={delta(top3.deltaPP, "pp")} />
      <KpiCell
        label="1º lugar"
        value={`${primeiro.valor}%`}
        complement={delta(primeiro.deltaPP, "pp")}
      />
      <KpiCell
        label="Sem presença"
        value={sem.valor}
        tone="warning"
        complement={delta(sem.delta, "", false) ?? "respostas sem citação da marca"}
        onClick={onVerSemPresenca}
      />
    </KpiStrip>
  );
}
