import { Card } from "@/components/ui/card";
import { KpiCell, KpiStrip } from "@/components/shared/Kpi";
import { formatBRL } from "@/lib/comercial";
import { OPPORTUNITY_KANBAN_ORDER, OPPORTUNITY_STAGE_LABEL } from "@/lib/comercial-engine";
import { groupPipelineByStage, type ComercialKpis } from "@/lib/comercial-metrics";
import type { Lead } from "@/lib/comercial";
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
 * Embaixo, o funil: etapas NEUTRAS (posição + contagem), sem uma cor por
 * etapa — cor fica reservada para significado (ganho, atenção, risco).
 * Mesmos `computeComercialKpis`/`groupPipelineByStage` de antes. */
export function PipelineSummary({
  kpis,
  openLeads,
  filters,
  onFilter,
}: {
  kpis: ComercialKpis;
  openLeads: Lead[];
  filters: LeadFilters;
  onFilter: (patch: Partial<LeadFilters>) => void;
}) {
  const buckets = groupPipelineByStage(openLeads, OPPORTUNITY_KANBAN_ORDER).filter(
    (b) => b.count > 0,
  );
  const maxValue = Math.max(...buckets.map((b) => b.value), 1);

  const ganhoAtivo = isFilterActive(filters, { stages: ["GANHO"] });
  const semAcaoAtivo = isFilterActive(filters, { activity: ["sem_proxima_acao"] });
  const paradasAtivo = isFilterActive(filters, { activity: ["parado_5d"] });

  return (
    <div className="space-y-4">
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

      {buckets.length > 0 && (
        <Card className="p-4 md:p-5">
          <p className="text-[15px] font-semibold text-foreground">Funil em aberto</p>
          {/* Barras neutras: a altura mostra o valor, o número da etapa e a
              contagem mostram a posição — nenhuma etapa ganha cor própria. */}
          <div className="mt-4 flex items-end gap-2">
            {buckets.map((b) => (
              <div key={b.stage} className="flex flex-1 flex-col items-center gap-1.5">
                <div className="mx-auto flex h-16 w-full max-w-20 items-end">
                  <div
                    className="w-full rounded-md bg-muted-foreground/30"
                    style={{ height: `${Math.max(18, (b.value / maxValue) * 100)}%` }}
                  />
                </div>
                <span className="line-clamp-2 text-center text-[11px] leading-tight text-text-secondary">
                  {OPPORTUNITY_KANBAN_ORDER.indexOf(b.stage) + 1}.{" "}
                  {OPPORTUNITY_STAGE_LABEL[b.stage]}
                </span>
                <span className="text-[11px] font-semibold tabular-nums text-foreground">
                  {b.count}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
