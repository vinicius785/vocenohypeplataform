import type { ReactNode } from "react";
import { TrendingDown, TrendingUp, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { TYPOGRAPHY, type SemanticTone } from "@/lib/design-tokens";
import { formatMetricDelta, type MetricDelta } from "@/lib/component-utils";

const TONE_VALUE_CLASS: Record<SemanticTone, string> = {
  neutral: "text-foreground",
  brand: "text-brand",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
  info: "text-info",
};

const DIRECTION_CLASS: Record<"up" | "down" | "flat", string> = {
  up: "text-success",
  down: "text-danger",
  flat: "text-text-secondary",
};

const TONE_SOFT_CLASS: Record<Exclude<SemanticTone, "neutral">, string> = {
  brand: "bg-brand-subtle text-brand",
  success: "bg-success-soft text-success-soft-foreground",
  warning: "bg-warning-soft text-warning-soft-foreground",
  danger: "bg-danger-soft text-danger-soft-foreground",
  info: "bg-info-soft text-info-soft-foreground",
};

const DIRECTION_ICON = { up: TrendingUp, down: TrendingDown, flat: Minus };

/**
 * Card de indicador canônico — substitui, na migração, as 8 implementações
 * encontradas na auditoria (financeiro `Kpi`/`IndicatorCard`, Comercial
 * `IndicatorCard` local, `TeamMetricCard`, `RoadmapOverviewTab` `StatCard`,
 * `portal.$token.tsx` `KpiCard`, Campanhas `Kpi`, AEO `KpiCards`).
 *
 * `value === null` é o estado "sem dados" — nunca mostra R$ 0 / 0 no lugar
 * de um dado que não existe, mostra "—" com o motivo.
 */
export function MetricCard({
  label,
  value,
  unavailableReason,
  complement,
  delta,
  icon,
  tone = "neutral",
  onClick,
  compact = false,
  tooltip,
  action,
}: {
  label: string;
  value: string | null;
  unavailableReason?: string;
  complement?: string;
  delta?: MetricDelta;
  icon?: ReactNode;
  tone?: SemanticTone;
  onClick?: () => void;
  compact?: boolean;
  /** Aditivo (Etapa 4) — explica o cálculo/período exato do indicador.
   * Complemento, nunca única fonte da informação (o `label`/`complement`
   * já dizem o essencial sem o tooltip). */
  tooltip?: string;
  /** Aditivo (Etapa 4) — ação secundária mostrada só no estado
   * indisponível (`value === null`), ex.: "Configurar saldo". */
  action?: { label: string; onClick: () => void };
}) {
  const deltaInfo = formatMetricDelta(delta ?? null);
  const isUnavailable = value == null;

  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        {tooltip ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  className={cn(TYPOGRAPHY.label, "cursor-default underline decoration-dotted")}
                >
                  {label}
                </span>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">{tooltip}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          <span className={TYPOGRAPHY.label}>{label}</span>
        )}
        {icon && (
          // Ícone com presença discreta mas intencional: círculo de fundo
          // suave (`brand-subtle` ou tom semântico), não só o glifo cru
          // cinza — pedido explícito da rodada corretiva.
          <span
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
              tone === "neutral" ? "bg-muted text-text-secondary" : TONE_SOFT_CLASS[tone],
            )}
          >
            {icon}
          </span>
        )}
      </div>
      <span
        className={cn(
          // whitespace-nowrap: um valor negativo formatado como "-R$
          // 1.200,00" tem espaço quebrável entre o sinal e o valor
          // (Intl.NumberFormat pt-BR) — sem isso o "-" quebrava pra uma
          // linha separada do número em cards estreitos. Achado ao vivo
          // nesta etapa.
          "leading-none whitespace-nowrap",
          compact ? TYPOGRAPHY.numberMedium : TYPOGRAPHY.numberLarge,
          isUnavailable ? "text-text-secondary" : TONE_VALUE_CLASS[tone],
        )}
      >
        {isUnavailable ? "—" : value}
      </span>
      {isUnavailable ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className={TYPOGRAPHY.caption}>{unavailableReason}</span>
          {action && (
            <button
              type="button"
              onClick={(ev) => {
                ev.stopPropagation();
                action.onClick();
              }}
              className="text-xs font-medium text-brand underline-offset-2 hover:underline"
            >
              {action.label}
            </button>
          )}
        </div>
      ) : (
        (complement || deltaInfo) && (
          <div className="flex flex-wrap items-center gap-2">
            {deltaInfo && (
              <span
                className={cn(
                  "inline-flex items-center gap-0.5 text-xs font-medium",
                  DIRECTION_CLASS[deltaInfo.direction],
                )}
              >
                {(() => {
                  const Icon = DIRECTION_ICON[deltaInfo.direction];
                  return <Icon className="h-3 w-3" />;
                })()}
                {deltaInfo.text}
              </span>
            )}
            {complement && <span className={TYPOGRAPHY.caption}>{complement}</span>}
          </div>
        )
      )}
    </>
  );

  return (
    <Card
      variant={onClick ? "interactive" : "default"}
      className={cn("dark:shadow-none", compact ? "p-4" : "p-5 md:p-6")}
    >
      {onClick ? (
        <button type="button" onClick={onClick} className="flex w-full flex-col gap-2 text-left">
          {body}
        </button>
      ) : (
        <div className="flex flex-col gap-2">{body}</div>
      )}
    </Card>
  );
}
