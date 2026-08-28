import type { ReactNode } from "react";

/** Um dos 5 cards de resumo no topo do dashboard da aba Time — número
 * grande e destacado + label pequeno + sublabel opcional (contexto extra,
 * ex. "9 vencem hoje"). `tone` só afeta a cor do número principal:
 * "danger" (vermelho, ex. atrasadas > 0) e "success" (verde/teal já usado
 * no app) chamam atenção; "neutral" é o padrão. Clicável quando `onClick`
 * é passado (ex. abrir/filtrar o painel correspondente). */
export function TeamMetricCard({
  label,
  value,
  sublabel,
  tone = "neutral",
  onClick,
}: {
  label: string;
  value: ReactNode;
  sublabel?: ReactNode;
  tone?: "neutral" | "danger" | "success";
  onClick?: () => void;
}) {
  const valueTone =
    tone === "danger"
      ? "text-destructive"
      : tone === "success"
        ? "text-emerald-600 dark:text-emerald-400"
        : "text-foreground";

  const className = `flex flex-col gap-1 rounded-2xl border border-border bg-card p-4 text-left transition-colors ${
    onClick ? "cursor-pointer hover:border-foreground/30" : ""
  }`;
  const content = (
    <>
      <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      <span className={`text-2xl font-semibold tabular-nums ${valueTone}`}>{value}</span>
      {sublabel && <span className="text-xs text-muted-foreground">{sublabel}</span>}
    </>
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={className}>
        {content}
      </button>
    );
  }
  return <div className={className}>{content}</div>;
}
