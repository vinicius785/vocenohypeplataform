import type { TeamInsightCategory, TeamInsightV2 } from "@/components/time-v2/team-insights-v2";

/** Só o rótulo ganha cor (nunca fundo): Atenção âmbar, Destaque verde, resto neutro. */
const CATEGORY: Record<TeamInsightCategory, { label: string; className: string }> = {
  atencao: { label: "Atenção", className: "text-amber-600 dark:text-amber-400" },
  operacao: { label: "Operação", className: "text-text-secondary" },
  tendencia: { label: "Tendência", className: "text-text-secondary" },
  destaque: { label: "Destaque", className: "text-emerald-600 dark:text-emerald-400" },
};

/** Uma linha de insight: [avatar] nome · categoria, fato, leitura gerencial e UMA ação. Lista
 * editorial compacta separada por divisor — nunca card colorido. */
export function InsightRow({
  insight,
  avatar,
  onOpen,
}: {
  insight: TeamInsightV2;
  avatar?: React.ReactNode;
  onOpen?: () => void;
}) {
  const cat = CATEGORY[insight.category];
  const label = insight.label ?? cat.label;
  return (
    <div className="flex items-start gap-3 py-2.5">
      {avatar}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {insight.memberName && (
            <span className="truncate text-sm font-semibold text-foreground">
              {insight.memberName}
            </span>
          )}
          {!insight.memberName && (
            <span className="truncate text-sm font-semibold text-foreground">Time</span>
          )}
          <span className={`shrink-0 text-[11px] font-medium ${cat.className}`}>{label}</span>
        </div>
        <p className="mt-0.5 text-[13px] leading-snug text-foreground">{insight.evidence}</p>
        <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-text-secondary">
          {insight.reading}
        </p>
        {insight.caveat && (
          <p className="mt-0.5 text-[11px] italic text-text-secondary/80">{insight.caveat}</p>
        )}
        {onOpen && insight.actionLabel && (
          <button
            type="button"
            onClick={onOpen}
            className="mt-1 cursor-pointer text-[11px] font-medium text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            {insight.actionLabel} →
          </button>
        )}
      </div>
    </div>
  );
}
