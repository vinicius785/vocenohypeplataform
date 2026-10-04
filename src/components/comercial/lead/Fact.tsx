import type { ReactNode } from "react";

/** Rótulo em caixa-alta + valor — o "fato" de uma linha de resumo (sem
 * caixa, sem borda), usado no resumo da negociação e no da proposta. */
export function Fact({
  label,
  children,
  tone = "neutral",
}: {
  label: string;
  children: ReactNode;
  tone?: "neutral" | "warning";
}) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-medium uppercase tracking-wide text-text-secondary">{label}</p>
      <div
        className={`mt-0.5 text-sm font-medium tabular-nums ${
          tone === "warning" ? "text-warning-soft-foreground" : "text-foreground"
        }`}
      >
        {children}
      </div>
    </div>
  );
}
