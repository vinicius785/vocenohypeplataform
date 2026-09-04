import type { Insight } from "@/lib/insights-engine";

/** Cor/label do tipo de insight — só no label/ícone pequeno, nunca fundo
 * forte (item 37 do pedido: "não usar fundos vermelho/verde/amarelo
 * forte, a cor pode aparecer só em ícone/indicador/label"). */
const NATURE_CONFIG: Record<Insight["nature"], { label: string; className: string }> = {
  destaque: { label: "Destaque", className: "text-emerald-600 dark:text-emerald-400" },
  atencao: { label: "Atenção", className: "text-amber-600 dark:text-amber-400" },
  tendencia: { label: "Tendência", className: "text-muted-foreground" },
};

/** Uma linha de insight — reaproveitada por `TeamInsights.tsx` (lista do
 * time, com "Ver Nome →") e por `MemberProfileDialog.tsx`'s "Insights
 * operacionais" (sem o link, já está na própria ficha). Lista editorial
 * compacta, separada por divisor — nunca card colorido. */
export function InsightRow({
  insight,
  avatar,
  onOpenMember,
  hideName,
}: {
  insight: Insight;
  avatar?: React.ReactNode;
  onOpenMember?: () => void;
  /** Omite o nome repetido — usado dentro da própria ficha do membro
   * (`MemberProfileDialog.tsx`), onde já é óbvio de quem se trata. */
  hideName?: boolean;
}) {
  const nature = NATURE_CONFIG[insight.nature];
  const firstName = insight.memberName.split(" ")[0];
  return (
    <div className="flex items-start gap-3 py-3">
      {avatar}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {!hideName && (
            <span className="truncate text-sm font-semibold text-foreground">
              {insight.memberName}
            </span>
          )}
          <span className={`shrink-0 text-[11px] font-medium ${nature.className}`}>
            {nature.label}
          </span>
        </div>
        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{insight.text}</p>
        {onOpenMember && (
          <button
            type="button"
            onClick={onOpenMember}
            className="mt-1 cursor-pointer text-[11px] font-medium text-foreground hover:underline"
          >
            Ver {firstName} →
          </button>
        )}
      </div>
    </div>
  );
}
