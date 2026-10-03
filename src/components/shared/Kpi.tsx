import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { TYPOGRAPHY } from "@/lib/design-tokens";

/* ============================================================
 * KPI CANÔNICO (Design System §8.3) — um só componente, duas variantes:
 *
 *  - `KpiStrip` + `KpiCell`: 2–5 células iguais, separadas por divisor, no
 *    padrão de card. Para vários números de mesmo peso.
 *  - `KpiLead` + `KpiLeadValue` + `KpiLeadItem`: UM número dominante e até 3
 *    de apoio em linha, sem card. Para quando um número responde a página.
 *
 * Regras embutidas: zero continua visível, esmaecido (nunca omitido);
 * `warning`/`danger` só aparecem com valor real (> 0); clicável só quando o
 * clique aplica filtro ou rola a página (`onClick`).
 * ============================================================ */

export type KpiTone = "neutral" | "warning" | "danger" | "success";

const TONE_VALUE_CLASS: Record<KpiTone, string> = {
  neutral: "text-foreground",
  warning: "text-warning-soft-foreground",
  danger: "text-danger-soft-foreground",
  success: "text-success-soft-foreground",
};

function isZero(value: string | number): boolean {
  return value === 0 || value === "0";
}

/** Cor do valor: esmaecida no zero; tom de atenção só com valor real. */
function valueClass(value: string | number, tone: KpiTone): string {
  if (isZero(value)) return "text-text-secondary";
  return TONE_VALUE_CLASS[tone];
}

/* ------------------------------ Strip ------------------------------ */

export function KpiStrip({
  "aria-label": ariaLabel,
  className,
  children,
}: {
  "aria-label": string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Card role="group" aria-label={ariaLabel} className={cn("overflow-hidden", className)}>
      {/* `-mt-px -ml-px` + borda esquerda/superior em cada célula: divisores
          corretos em qualquer quebra de linha, com o excesso cortado pelo card. */}
      <div className="-ml-px -mt-px grid grid-cols-2 sm:grid-cols-3 lg:grid-flow-col lg:auto-cols-fr">
        {children}
      </div>
    </Card>
  );
}

export function KpiCell({
  label,
  value,
  complement,
  tone = "neutral",
  labelExtra,
  progress,
  onClick,
  active,
}: {
  label: string;
  value: string | number;
  /** Segunda linha em `text-[11px] text-secondary` (texto ou um pequeno elemento). */
  complement?: ReactNode;
  tone?: KpiTone;
  labelExtra?: ReactNode;
  /** Barra presa a ESTA métrica (nunca solta, sem rótulo). */
  progress?: { pct: number; ariaLabel: string; tone?: "danger" | "brand" };
  onClick?: () => void;
  active?: boolean;
}) {
  const body = (
    <>
      <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
        <span className={TYPOGRAPHY.labelCaps}>{label}</span>
        {labelExtra}
      </span>
      <span
        className={cn(
          "mt-0.5 block whitespace-nowrap",
          TYPOGRAPHY.kpiValue,
          valueClass(value, tone),
        )}
      >
        {value}
      </span>
      {complement && (
        <span className={cn("mt-0.5 block truncate", TYPOGRAPHY.metadata)}>{complement}</span>
      )}
      {progress && (
        <span
          role="progressbar"
          aria-label={progress.ariaLabel}
          aria-valuenow={Math.round(progress.pct)}
          aria-valuemin={0}
          aria-valuemax={100}
          className="mt-1.5 block h-1 w-full overflow-hidden rounded-full bg-muted"
        >
          <span
            className={cn(
              "block h-full rounded-full",
              progress.tone === "danger" ? "bg-danger" : "bg-brand",
            )}
            style={{ width: `${progress.pct}%` }}
          />
        </span>
      )}
    </>
  );
  const cellClass = "min-w-0 border-l border-t border-border/60 px-4 py-3 text-left md:px-5";
  if (!onClick) return <div className={cellClass}>{body}</div>;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        cellClass,
        "transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
        active && "bg-muted/60",
      )}
    >
      {body}
    </button>
  );
}

/* ------------------------------ Lead ------------------------------- */

export function KpiLead({
  "aria-label": ariaLabel,
  className,
  children,
}: {
  "aria-label": string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-label={ariaLabel}
      className={cn("flex flex-wrap items-center gap-x-7 gap-y-3", className)}
    >
      {children}
    </section>
  );
}

/** O número dominante da página. */
export function KpiLeadValue({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="shrink-0">
      <span className="flex items-baseline gap-2">
        <span className={cn(TYPOGRAPHY.kpiLead, valueClass(value, "neutral"))}>{value}</span>
        <span className="text-sm text-text-secondary">{label}</span>
      </span>
    </div>
  );
}

/** Número de apoio (até 3): texto simples; vira botão quando `onClick`. */
export function KpiLeadItem({
  label,
  value,
  tone = "neutral",
  onClick,
  active,
}: {
  label: string;
  value: string | number;
  tone?: KpiTone;
  onClick?: () => void;
  active?: boolean;
}) {
  const content = (
    <>
      <span className="text-text-secondary">{label}</span>{" "}
      <span className={cn("font-semibold", valueClass(value, tone))}>{value}</span>
    </>
  );
  if (!onClick) return <span className="text-sm">{content}</span>;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-full px-2.5 py-1 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active ? "bg-muted" : "hover:bg-muted/60",
      )}
    >
      {content}
    </button>
  );
}
