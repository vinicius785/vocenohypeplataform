import { useState } from "react";
import {
  Wallet,
  TrendingUp,
  Clock,
  AlertTriangle,
  Layers,
  ArrowRight,
  CalendarClock,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { formatBRL, type Lead } from "@/lib/comercial";
import {
  OPPORTUNITY_KANBAN_ORDER,
  OPPORTUNITY_STAGE_LABEL,
  OPPORTUNITY_STAGE_COLOR,
  deriveOpportunityNextStep,
  type OpportunityStage,
} from "@/lib/comercial-engine";
import {
  computeComercialKpis,
  groupPipelineByStage,
  computeComercialPriorities,
  type DateRange,
  type ComercialPriorityItem,
  type ComercialPriorityReason,
} from "@/lib/comercial-metrics";
import type { LeadFiltersState } from "./LeadFiltersBar";

/**
 * Visão geral — responde só 6 perguntas: pipeline total, ganho no período,
 * sem próxima ação, paradas, distribuição por etapa e quem precisa de
 * atenção agora. Sem indicador duplicado em outro canto da tela, sem
 * bloco que não vira decisão.
 */
export function ComercialOverviewView({
  leads,
  range,
  onOpenLead,
  onFilterPipeline,
}: {
  leads: Lead[];
  range: DateRange;
  onOpenLead: (lead: Lead) => void;
  onFilterPipeline: (patch: Partial<LeadFiltersState>) => void;
}) {
  const kpis = computeComercialKpis(leads, range);
  const porEtapa = groupPipelineByStage(leads, OPPORTUNITY_KANBAN_ORDER);
  const priorities = computeComercialPriorities(leads);
  const [metric, setMetric] = useState<"valor" | "quantidade">("valor");
  const [showAll, setShowAll] = useState(false);
  const visiblePriorities = showAll ? priorities : priorities.slice(0, 6);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <IndicatorCard
          icon={<Wallet className="h-4 w-4" />}
          label="Pipeline total"
          value={formatBRL(kpis.pipelineTotal)}
          tooltip="Soma do valor das oportunidades em aberto — exclui ganhas e perdidas."
          tone="primary"
          onClick={() => onFilterPipeline({})}
        />
        <IndicatorCard
          icon={<TrendingUp className="h-4 w-4" />}
          label="Ganho no período"
          value={formatBRL(kpis.valorGanhoNoPeriodo)}
          tooltip="Soma das oportunidades marcadas como ganhas dentro do período selecionado."
          tone="success"
          onClick={() => onFilterPipeline({ stages: ["GANHO"] })}
        />
        <IndicatorCard
          icon={<Clock className="h-4 w-4" />}
          label="Sem próxima ação"
          value={`${kpis.oportunidadesSemProximaAcao} oportunidade${kpis.oportunidadesSemProximaAcao === 1 ? "" : "s"}`}
          secondary={formatBRL(kpis.valorSemProximaAcao)}
          tooltip="Oportunidades abertas sem uma próxima ação válida nem reunião futura agendada."
          tone={kpis.oportunidadesSemProximaAcao > 0 ? "warning" : "neutral"}
          onClick={() => onFilterPipeline({ nextAction: "sem" })}
        />
        <IndicatorCard
          icon={<AlertTriangle className="h-4 w-4" />}
          label="Paradas (5+ dias)"
          value={`${kpis.oportunidadesParadas} oportunidade${kpis.oportunidadesParadas === 1 ? "" : "s"}`}
          secondary={formatBRL(kpis.valorParadas)}
          tooltip="Oportunidades abertas sem mudar de etapa há 5 dias ou mais."
          tone={kpis.oportunidadesParadas > 0 ? "danger" : "neutral"}
          onClick={() => onFilterPipeline({ staleOnly: true })}
        />
      </div>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[65fr_35fr]">
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Layers className="h-4 w-4" /> Pipeline por etapa
            </h3>
            <div className="flex rounded-md border border-border p-0.5 text-[11px]">
              <button
                type="button"
                onClick={() => setMetric("valor")}
                className={`rounded-[5px] px-2 py-0.5 font-medium ${
                  metric === "valor" ? "bg-muted text-foreground" : "text-muted-foreground"
                }`}
              >
                Valor
              </button>
              <button
                type="button"
                onClick={() => setMetric("quantidade")}
                className={`rounded-[5px] px-2 py-0.5 font-medium ${
                  metric === "quantidade" ? "bg-muted text-foreground" : "text-muted-foreground"
                }`}
              >
                Quantidade
              </button>
            </div>
          </div>
          <StageBars
            buckets={porEtapa}
            metric={metric}
            onClickStage={(stage) => onFilterPipeline({ stages: [stage] })}
          />
        </div>

        <PrioritiesCard
          items={visiblePriorities}
          total={priorities.length}
          showAll={showAll}
          onShowAll={() => setShowAll(true)}
          onOpenLead={onOpenLead}
        />
      </div>
    </div>
  );
}

function IndicatorCard({
  icon,
  label,
  value,
  secondary,
  tooltip,
  tone,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  secondary?: string;
  tooltip: string;
  tone: "primary" | "success" | "warning" | "danger" | "neutral";
  onClick: () => void;
}) {
  const toneCls =
    tone === "primary"
      ? "text-violet-600 dark:text-violet-400"
      : tone === "success"
        ? "text-emerald-600 dark:text-emerald-400"
        : tone === "warning"
          ? "text-amber-600 dark:text-amber-400"
          : tone === "danger"
            ? "text-red-600 dark:text-red-400"
            : "text-foreground";
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onClick}
            className="flex h-full w-full flex-col items-start rounded-2xl border border-border bg-card p-4 text-left transition-colors hover:border-foreground/30"
          >
            <span
              className={`flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground`}
            >
              {icon} {label}
            </span>
            <span className={`mt-1.5 text-xl font-semibold tabular-nums ${toneCls}`}>{value}</span>
            {secondary && (
              <span className="mt-0.5 text-xs tabular-nums text-muted-foreground">{secondary}</span>
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs text-xs">{tooltip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function StageBars({
  buckets,
  metric,
  onClickStage,
}: {
  buckets: { stage: OpportunityStage; count: number; value: number }[];
  metric: "valor" | "quantidade";
  onClickStage: (stage: OpportunityStage) => void;
}) {
  const max = Math.max(1, ...buckets.map((b) => (metric === "valor" ? b.value : b.count)));
  return (
    <div className="space-y-2.5">
      {buckets.map((b) => {
        const raw = metric === "valor" ? b.value : b.count;
        const isEmpty = b.count === 0;
        return (
          <button
            key={b.stage}
            type="button"
            onClick={() => onClickStage(b.stage)}
            className={`block w-full rounded-md text-left transition-opacity hover:opacity-80 ${
              isEmpty ? "opacity-50" : ""
            }`}
          >
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="font-medium text-foreground">
                {OPPORTUNITY_STAGE_LABEL[b.stage]}
              </span>
              <span className="tabular-nums text-muted-foreground">
                {b.count} · {formatBRL(b.value)}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full rounded-full ${OPPORTUNITY_STAGE_COLOR[b.stage]}`}
                style={{ width: isEmpty ? "0%" : `${Math.max(3, (raw / max) * 100)}%` }}
              />
            </div>
          </button>
        );
      })}
    </div>
  );
}

const REASON_STYLE: Record<ComercialPriorityReason, { icon: typeof AlertTriangle; cls: string }> = {
  acao_vencida: { icon: AlertTriangle, cls: "text-red-600 dark:text-red-400" },
  sem_proxima_acao: { icon: Clock, cls: "text-amber-600 dark:text-amber-400" },
  parada: { icon: Clock, cls: "text-amber-600 dark:text-amber-400" },
  hoje: { icon: CalendarClock, cls: "text-violet-600 dark:text-violet-400" },
  proximos_dias: { icon: CalendarClock, cls: "text-muted-foreground" },
};

/** Texto de motivo (o "porquê" da prioridade) + detalhe (prazo/atraso) —
 * separado em duas funções pequenas pra não repetir a lógica de reason no
 * JSX. */
function priorityMotivo(item: ComercialPriorityItem): string {
  if (item.reason === "sem_proxima_acao") return "Sem próxima ação";
  if (item.reason === "hoje" || item.reason === "proximos_dias") return "Reunião agendada";
  const step = deriveOpportunityNextStep(item.lead);
  return step.actionLabel ?? OPPORTUNITY_STAGE_LABEL[step.stage];
}

function priorityDetail({ reason, days }: ComercialPriorityItem): string {
  switch (reason) {
    case "acao_vencida":
      return `vencida há ${days}d`;
    case "sem_proxima_acao":
    case "parada":
      return `parado há ${days}d`;
    case "hoje":
      return "hoje";
    case "proximos_dias":
      return `em ${days}d`;
  }
}

function PrioritiesCard({
  items,
  total,
  showAll,
  onShowAll,
  onOpenLead,
}: {
  items: ComercialPriorityItem[];
  total: number;
  showAll: boolean;
  onShowAll: () => void;
  onOpenLead: (lead: Lead) => void;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <h3 className="mb-3 text-sm font-medium text-foreground">Prioridades comerciais</h3>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhuma prioridade comercial pendente.</p>
      ) : (
        <>
          <ul className="space-y-1">
            {items.map((item) => {
              const { lead, reason } = item;
              const style = REASON_STYLE[reason];
              const Icon = style.icon;
              return (
                <li key={lead.id}>
                  <button
                    type="button"
                    onClick={() => onOpenLead(lead)}
                    className="flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left hover:bg-muted"
                  >
                    <Icon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${style.cls}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-xs font-medium text-foreground">
                          {lead.company || lead.name}
                        </span>
                        <span className="shrink-0 text-xs font-semibold tabular-nums text-foreground">
                          {formatBRL(lead.value || 0)}
                        </span>
                      </div>
                      <p className={`truncate text-[11px] ${style.cls}`}>
                        {priorityMotivo(item)} · {priorityDetail(item)}
                      </p>
                      {lead.responsible && (
                        <p className="truncate text-[11px] text-muted-foreground">
                          {lead.responsible}
                        </p>
                      )}
                    </div>
                    <ArrowRight className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground/50" />
                  </button>
                </li>
              );
            })}
          </ul>
          {!showAll && total > items.length && (
            <button
              type="button"
              onClick={onShowAll}
              className="mt-2 text-[11px] font-medium text-foreground hover:underline"
            >
              Ver todas ({total})
            </button>
          )}
        </>
      )}
    </div>
  );
}
