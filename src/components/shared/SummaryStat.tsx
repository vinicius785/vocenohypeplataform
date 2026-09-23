import type { ReactNode } from "react";

export const SUMMARY_TONE_CLASS = {
  warning: "text-warning",
  success: "text-success",
  danger: "text-danger",
} as const;

/** Item de faixa de resumo operacional compacto — um valor por vez,
 * nunca um card grande. Cor semântica só quando `tone` é passada (alerta
 * real), nunca por decoração. Extraído de `CampanhasSection.tsx` (era
 * local ali) pra ser reaproveitado tal qual na página de Projeto —
 * mesma linguagem visual, nenhuma segunda implementação. */
export function SummaryStat({
  label,
  labelExtra,
  value,
  complement,
  tone,
  progress,
}: {
  label: string;
  /** Elemento pequeno ao lado do label — ex.: badge de saúde operacional
   * junto de "Pendências". Opcional, nunca compete visualmente com o
   * valor principal abaixo. */
  labelExtra?: ReactNode;
  value: string;
  /** Segunda linha, menor e secundária — ex.: "58 de 105 tarefas" abaixo
   * de "55%". Opcional; sem ela o item fica com uma linha só, como já
   * era em Campanhas. */
  complement?: string;
  tone?: keyof typeof SUMMARY_TONE_CLASS;
  /** Barra de progresso presa a ESTA métrica específica — nunca uma
   * barra solta sem rótulo/numerador visível. */
  progress?: { pct: number; ariaLabel: string; tone?: "danger" | "brand" };
}) {
  return (
    <div className="min-w-[104px] flex-1 border-b border-r border-border/60 px-4 py-3 last:border-r-0 sm:border-b-0">
      <div className="flex items-center gap-1.5">
        <p className="text-[10px] font-medium uppercase tracking-wide text-text-secondary">
          {label}
        </p>
        {labelExtra}
      </div>
      <p
        className={`mt-1 truncate text-base font-bold tabular-nums ${
          tone ? SUMMARY_TONE_CLASS[tone] : "text-foreground"
        }`}
      >
        {value}
      </p>
      {complement && (
        <p className="mt-0.5 truncate text-[11px] text-text-secondary">{complement}</p>
      )}
      {progress && (
        <div
          role="progressbar"
          aria-label={progress.ariaLabel}
          aria-valuenow={Math.round(progress.pct)}
          aria-valuemin={0}
          aria-valuemax={100}
          className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-muted"
        >
          <div
            className={`h-full rounded-full ${progress.tone === "danger" ? "bg-danger" : "bg-brand"}`}
            style={{ width: `${progress.pct}%` }}
          />
        </div>
      )}
    </div>
  );
}
