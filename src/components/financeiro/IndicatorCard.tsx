import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { fmtBRL } from "@/lib/financeiro-entries";

export type IndicatorTone = "neutral" | "success" | "danger" | "warning" | "primary";

const TONE_CLS: Record<IndicatorTone, string> = {
  neutral: "text-foreground",
  primary: "text-violet-600 dark:text-violet-400",
  success: "text-emerald-600 dark:text-emerald-400",
  warning: "text-amber-600 dark:text-amber-400",
  danger: "text-rose-600 dark:text-rose-400",
};

/**
 * Card de indicador principal da Visão Geral — sempre com período
 * considerado + tooltip explicando o cálculo. Quando `value` é `null`
 * (dado indisponível — ex.: saldo atual sem configuração), mostra "—" e
 * `unavailableReason` no lugar do valor, nunca R$ 0,00.
 */
export function IndicatorCard({
  label,
  value,
  unavailableReason,
  periodo,
  comparison,
  tooltip,
  tone = "neutral",
  action,
  onClick,
}: {
  label: string;
  value: number | null;
  unavailableReason?: string;
  periodo: string;
  comparison?: { deltaPct: number; label: string } | null;
  tooltip: string;
  tone?: IndicatorTone;
  action?: { label: string; onClick: () => void };
  onClick?: () => void;
}) {
  const isUnavailable = value == null;
  const body = (
    <div className="flex h-full w-full flex-col items-start rounded-2xl border border-border bg-card p-4 text-left">
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span
        className={`mt-1.5 text-xl font-semibold tabular-nums ${isUnavailable ? "text-muted-foreground" : TONE_CLS[tone]}`}
      >
        {isUnavailable ? "—" : fmtBRL(value)}
      </span>
      {isUnavailable ? (
        <span className="mt-0.5 text-[11px] text-muted-foreground">{unavailableReason}</span>
      ) : (
        <span className="mt-0.5 text-[11px] text-muted-foreground">{periodo}</span>
      )}
      {!isUnavailable && comparison && (
        <span
          className={`mt-1 text-[11px] tabular-nums ${comparison.deltaPct >= 0 ? "text-emerald-600" : "text-rose-600"}`}
        >
          {comparison.deltaPct >= 0 ? "▲" : "▼"} {Math.abs(comparison.deltaPct).toFixed(0)}%{" "}
          {comparison.label}
        </span>
      )}
      {isUnavailable && action && (
        <button
          type="button"
          onClick={(ev) => {
            ev.stopPropagation();
            action.onClick();
          }}
          className="mt-1.5 cursor-pointer text-[11px] font-medium text-foreground underline underline-offset-4 hover:no-underline"
        >
          {action.label}
        </button>
      )}
    </div>
  );

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          {onClick ? (
            <button type="button" onClick={onClick} className="h-full w-full cursor-pointer">
              {body}
            </button>
          ) : (
            body
          )}
        </TooltipTrigger>
        <TooltipContent className="max-w-xs text-xs">{tooltip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
