import { KpiCell, KpiStrip } from "@/components/shared/Kpi";
import { formatBRL } from "@/lib/comercial";
import type { ComercialKpis } from "@/lib/comercial-metrics";
import type { LeadFilters } from "@/lib/comercial-filters";

function isFilterActive(filters: LeadFilters, patch: Partial<LeadFilters>): boolean {
  return Object.entries(patch).every(([k, v]) => {
    const cur = filters[k as keyof LeadFilters];
    if (Array.isArray(v))
      return (
        Array.isArray(cur) &&
        cur.length === v.length &&
        v.every((x) => (cur as unknown[]).includes(x))
      );
    return cur === v;
  });
}

/** Resumo comercial — KPI canônico (`KpiStrip`): pipeline total, ganho no
 * período, sem próxima ação e paradas. Os três últimos filtram o Kanban (por
 * isso são clicáveis); atenção/risco só ganham tom quando há valor real.
 * O funil foi removido (a distribuição por etapa já está no Pipeline).
 * Mesmo `computeComercialKpis` de antes. */
export function PipelineSummary({
  kpis,
  filters,
  onFilter,
}: {
  kpis: ComercialKpis;
  filters: LeadFilters;
  onFilter: (patch: Partial<LeadFilters>) => void;
}) {
  const ganhoAtivo = isFilterActive(filters, { stages: ["GANHO"] });
  const semAcaoAtivo = isFilterActive(filters, { activity: ["sem_proxima_acao"] });
  const paradasAtivo = isFilterActive(filters, { activity: ["parado_5d"] });

  return (
    <>
      <KpiStrip aria-label="Resumo comercial">
        <KpiCell
          label="Pipeline total"
          value={formatBRL(kpis.pipelineTotal)}
          complement={`${kpis.oportunidadesAbertas} oportunidade${kpis.oportunidadesAbertas === 1 ? "" : "s"} em aberto`}
          onClick={() => onFilter({})}
        />
        <KpiCell
          label="Ganho no período"
          value={formatBRL(kpis.valorGanhoNoPeriodo)}
          complement={`${kpis.negociosGanhosNoPeriodo} negócio${kpis.negociosGanhosNoPeriodo === 1 ? "" : "s"}`}
          active={ganhoAtivo}
          onClick={() => onFilter(ganhoAtivo ? {} : { stages: ["GANHO"] })}
        />
        <KpiCell
          label="Sem próxima ação"
          value={kpis.oportunidadesSemProximaAcao}
          tone="warning"
          complement={formatBRL(kpis.valorSemProximaAcao)}
          active={semAcaoAtivo}
          onClick={() => onFilter(semAcaoAtivo ? {} : { activity: ["sem_proxima_acao"] })}
        />
        <KpiCell
          label="Paradas 5+ dias"
          value={kpis.oportunidadesParadas}
          tone="danger"
          complement={formatBRL(kpis.valorParadas)}
          active={paradasAtivo}
          onClick={() => onFilter(paradasAtivo ? {} : { activity: ["parado_5d"] })}
        />
      </KpiStrip>
    </>
  );
}
