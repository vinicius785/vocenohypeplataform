import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import type { AeoResposta } from "@/lib/aeo-store";
import {
  kpiPrimeiroLugar,
  kpiPromptsSemPresenca,
  kpiTop3,
  kpiVisibilidadeGeral,
} from "@/lib/aeo-engine";

function DeltaBadge({ delta, unidade }: { delta: number | null; unidade: "pp" | "" }) {
  if (delta === null) return null;
  const Icon = delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus;
  const tone =
    delta > 0
      ? "text-emerald-600 dark:text-emerald-400"
      : delta < 0
        ? "text-rose-600 dark:text-rose-400"
        : "text-muted-foreground";
  return (
    <p className={`mt-1 inline-flex items-center gap-1 text-[11px] font-medium ${tone}`}>
      <Icon className="h-3 w-3" />
      {delta > 0 ? "+" : ""}
      {delta}
      {unidade} vs. rodada de comparação
    </p>
  );
}

/** Exatamente 4 cards, por pedido explícito — nunca mais que isso. */
export function KpiCards({
  respostas,
  rodadaId,
  rodadaComparacaoId,
}: {
  respostas: AeoResposta[];
  rodadaId: string;
  rodadaComparacaoId?: string;
}) {
  const visibilidade = kpiVisibilidadeGeral(respostas, rodadaId, rodadaComparacaoId);
  const top3 = kpiTop3(respostas, rodadaId, rodadaComparacaoId);
  const primeiro = kpiPrimeiroLugar(respostas, rodadaId, rodadaComparacaoId);
  const semPresenca = kpiPromptsSemPresenca(respostas, rodadaId, rodadaComparacaoId);

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div className="rounded-2xl border border-border bg-card p-4">
        <p className="text-xs font-medium text-muted-foreground">Visibilidade geral</p>
        <p className="mt-1 text-3xl font-light tracking-tighter text-foreground">
          {visibilidade.valor}%
        </p>
        <DeltaBadge delta={visibilidade.deltaPP} unidade="pp" />
      </div>
      <div className="rounded-2xl border border-border bg-card p-4">
        <p className="text-xs font-medium text-muted-foreground">Top 3</p>
        <p className="mt-1 text-3xl font-light tracking-tighter text-foreground">{top3.valor}%</p>
        <DeltaBadge delta={top3.deltaPP} unidade="pp" />
      </div>
      <div className="rounded-2xl border border-border bg-card p-4">
        <p className="text-xs font-medium text-muted-foreground">1º lugar</p>
        <p className="mt-1 text-3xl font-light tracking-tighter text-foreground">
          {primeiro.valor}%
        </p>
        <DeltaBadge delta={primeiro.deltaPP} unidade="pp" />
      </div>
      <div className="rounded-2xl border border-border bg-card p-4">
        <p className="text-xs font-medium text-muted-foreground">Prompts sem presença</p>
        <p className="mt-1 text-3xl font-light tracking-tighter text-foreground">
          {semPresenca.valor}
        </p>
        <DeltaBadge delta={semPresenca.delta} unidade="" />
      </div>
    </div>
  );
}
