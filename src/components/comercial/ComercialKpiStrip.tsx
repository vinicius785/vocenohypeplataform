import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { formatBRL } from "@/lib/comercial";
import type { ComercialKpis } from "@/lib/comercial-metrics";

/**
 * Faixa de indicadores do cabeçalho — compactos, "—" (nunca `0`) quando o
 * dado não é computável hoje, e clicáveis quando dá pra funcionar como
 * filtro de verdade (ver `LeadFiltersBar`).
 */
export function ComercialKpiStrip({
  kpis,
  onToggleStale,
  onToggleOverdue,
  onToggleNoNextAction,
  staleActive,
  overdueActive,
  noNextActionActive,
}: {
  kpis: ComercialKpis;
  onToggleStale: () => void;
  onToggleOverdue: () => void;
  onToggleNoNextAction: () => void;
  staleActive: boolean;
  overdueActive: boolean;
  noNextActionActive: boolean;
}) {
  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex gap-x-6 overflow-x-auto whitespace-nowrap pb-1">
        <Kpi label="Pipeline total" value={formatBRL(kpis.pipelineTotal)} />
        <Kpi
          label="Forecast ponderado"
          value="—"
          tooltip="Sem probabilidade de fechamento configurada por etapa/lead — o forecast ponderado só aparece quando essa regra existir."
        />
        <Kpi
          label="Ganho no período"
          value={formatBRL(kpis.valorGanhoNoPeriodo)}
          tooltip={
            kpis.ganhosSemDataRegistrada > 0
              ? `${kpis.ganhosSemDataRegistrada} negócio(s) ganho(s) antes desta métrica existir não têm data registrada e ficam fora deste recorte.`
              : undefined
          }
        />
        <Kpi label="Oportunidades abertas" value={String(kpis.oportunidadesAbertas)} />
        <Kpi
          label="Sem próxima ação"
          value={String(kpis.oportunidadesSemProximaAcao)}
          tooltip="Etapas abertas sem uma próxima ação definida pelo motor — hoje, só 'Proposta enviada' (aguardando retorno do cliente)."
          active={noNextActionActive}
          onClick={onToggleNoNextAction}
        />
        <Kpi
          label="Paradas (5+ dias)"
          value={String(kpis.oportunidadesParadas)}
          tooltip="Não muda de etapa há 5 dias ou mais."
          active={staleActive}
          onClick={onToggleStale}
        />
        <Kpi
          label="Ações vencidas"
          value={String(kpis.atividadesVencidas)}
          tooltip="Reunião agendada com data já passada."
          active={overdueActive}
          onClick={onToggleOverdue}
        />
      </div>
    </TooltipProvider>
  );
}

function Kpi({
  label,
  value,
  tooltip,
  active,
  onClick,
}: {
  label: string;
  value: string;
  tooltip?: string;
  active?: boolean;
  onClick?: () => void;
}) {
  const content = (
    <div
      className={`flex shrink-0 items-baseline gap-2 border-l border-border pl-6 first:border-l-0 first:pl-0 ${
        onClick ? "cursor-pointer rounded-md" : ""
      } ${active ? "text-foreground" : ""}`}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
    >
      <span
        className={`text-xl font-semibold tabular-nums ${active ? "text-foreground" : "text-foreground"}`}
      >
        {value}
      </span>
      <span className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
        {tooltip && <Info className="h-3 w-3 shrink-0 text-muted-foreground/70" />}
        {active && <span className="h-1.5 w-1.5 rounded-full bg-foreground" />}
      </span>
    </div>
  );

  if (!tooltip) return content;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{content}</TooltipTrigger>
      <TooltipContent className="max-w-xs text-xs">{tooltip}</TooltipContent>
    </Tooltip>
  );
}
