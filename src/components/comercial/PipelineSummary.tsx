import { AlertTriangle, Clock, TrendingUp } from "lucide-react";
import { formatBRL } from "@/lib/comercial";
import {
  OPPORTUNITY_KANBAN_ORDER,
  OPPORTUNITY_STAGE_COLOR,
  OPPORTUNITY_STAGE_LABEL,
} from "@/lib/comercial-engine";
import { groupPipelineByStage, type ComercialKpis } from "@/lib/comercial-metrics";
import type { Lead } from "@/lib/comercial";
import type { LeadFilters } from "@/lib/comercial-filters";

/** Resumo comercial assimétrico (migração visual — mesma direção do
 * Resumo Financeiro): card protagonista azul (pipeline total + distância
 * por etapa) + 3 indicadores secundários com escala/tom semântico
 * diferentes. Mesmos `computeComercialKpis`/`groupPipelineByStage` de
 * antes — nenhum cálculo novo, só composição visual. Reaproveita
 * `--brand-foreground`/`--brand-foreground-secondary`/`--brand-border`
 * já validados (contraste AA) na rodada do Financeiro. */

const SECONDARY_SURFACE = "bg-card border border-border/60 dark:border-0 dark:bg-[oklch(0.17_0_0)]";

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
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
      {/* Protagonista — pipeline total, único bloco azul da página */}
      <button
        type="button"
        onClick={() => onFilter({})}
        className="rounded-[28px] bg-brand p-7 text-left dark:shadow-none md:p-8 lg:col-span-7"
      >
        <span className="inline-flex items-center rounded-full bg-black/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-brand-foreground">
          Pipeline total
        </span>
        <p className="mt-5 whitespace-nowrap text-[40px] font-bold leading-none tracking-tight text-brand-foreground sm:text-[48px] md:text-[56px]">
          {formatBRL(kpis.pipelineTotal)}
        </p>
        <p className="mt-3 text-sm text-brand-foreground-secondary">
          {kpis.oportunidadesAbertas} oportunidade{kpis.oportunidadesAbertas === 1 ? "" : "s"} em
          aberto
        </p>

        {buckets.length > 0 && (
          // Cada barra usa a cor categórica centralizada da própria etapa
          // (`OPPORTUNITY_STAGE_COLOR`, mesma fonte do dot da coluna e do
          // badge do drawer) — sem opacidade reduzida, pra não perder
          // contraste em cima do azul. Altura mínima de 18% garante que
          // etapas com valor baixo continuam visíveis sem fingir que têm
          // o mesmo peso das maiores.
          <div className="mt-6 flex items-end gap-2">
            {buckets.map((b) => (
              <div key={b.stage} className="flex flex-1 flex-col items-center gap-1.5">
                <div className="flex h-16 w-full items-end">
                  <div
                    className={`w-full rounded-md ${OPPORTUNITY_STAGE_COLOR[b.stage]}`}
                    style={{ height: `${Math.max(18, (b.value / maxValue) * 100)}%` }}
                  />
                </div>
                <span className="line-clamp-2 text-center text-[10px] leading-tight text-brand-foreground-secondary">
                  {OPPORTUNITY_STAGE_LABEL[b.stage]}
                </span>
                <span className="text-[10px] font-semibold tabular-nums text-brand-foreground">
                  {b.count}
                </span>
              </div>
            ))}
          </div>
        )}
      </button>

      {/* Secundários — escalas diferentes do protagonista, clicáveis pra
       * filtrar o Kanban; estado ativo marcado com anel visível. */}
      <div className="flex flex-col gap-4 lg:col-span-5">
        <button
          type="button"
          onClick={() => onFilter(ganhoAtivo ? {} : { stages: ["GANHO"] })}
          className={`rounded-[22px] ${SECONDARY_SURFACE} p-5 text-left transition-colors hover:bg-muted/40 ${
            ganhoAtivo ? "ring-2 ring-brand" : ""
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-success-soft text-success">
              <TrendingUp className="h-4 w-4" />
            </span>
            {ganhoAtivo && (
              <span className="rounded-full bg-brand-subtle px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand">
                Filtrando
              </span>
            )}
          </div>
          <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-text-secondary">
            Ganho no período
          </p>
          <p className="mt-1 whitespace-nowrap text-[22px] font-bold tabular-nums leading-none text-foreground">
            {formatBRL(kpis.valorGanhoNoPeriodo)}
          </p>
          <p className="mt-1 text-[11px] text-text-secondary">
            {kpis.negociosGanhosNoPeriodo} negócio{kpis.negociosGanhosNoPeriodo === 1 ? "" : "s"}
          </p>
        </button>

        <div className="grid grid-cols-2 gap-4">
          <button
            type="button"
            onClick={() => onFilter(semAcaoAtivo ? {} : { activity: ["sem_proxima_acao"] })}
            className={`rounded-[22px] ${SECONDARY_SURFACE} p-4 text-left transition-colors hover:bg-muted/40 ${
              semAcaoAtivo ? "ring-2 ring-brand" : ""
            }`}
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-warning-soft text-warning">
              <Clock className="h-3.5 w-3.5" />
            </span>
            <p className="mt-2.5 text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
              Sem próxima ação
            </p>
            <p className="mt-1 whitespace-nowrap text-[19px] font-bold tabular-nums leading-none text-foreground">
              {kpis.oportunidadesSemProximaAcao}
            </p>
            <p className="mt-1 truncate text-[10px] text-text-secondary">
              {formatBRL(kpis.valorSemProximaAcao)}
            </p>
          </button>
          <button
            type="button"
            onClick={() => onFilter(paradasAtivo ? {} : { activity: ["parado_5d"] })}
            className={`rounded-[22px] ${SECONDARY_SURFACE} p-4 text-left transition-colors hover:bg-muted/40 ${
              paradasAtivo ? "ring-2 ring-brand" : ""
            }`}
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-danger-soft text-danger">
              <AlertTriangle className="h-3.5 w-3.5" />
            </span>
            <p className="mt-2.5 text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
              Paradas 5+ dias
            </p>
            <p className="mt-1 whitespace-nowrap text-[19px] font-bold tabular-nums leading-none text-foreground">
              {kpis.oportunidadesParadas}
            </p>
            <p className="mt-1 truncate text-[10px] text-text-secondary">
              {formatBRL(kpis.valorParadas)}
            </p>
          </button>
        </div>
      </div>
    </div>
  );
}
