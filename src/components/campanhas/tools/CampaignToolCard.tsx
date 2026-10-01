import { ChevronRight } from "lucide-react";
import { CAMPAIGN_TOOLS, type CampaignToolKey } from "./campaign-tools";

export function CampaignToolCard({
  tool,
  count,
  onOpen,
  compact = false,
}: {
  tool: CampaignToolKey;
  count?: number;
  onOpen: () => void;
  /** Versão secundária (Home da campanha): botão de uma linha, sem a
   * descrição visível (vira `title`), pra não competir com Tarefas/
   * Influenciadores. */
  compact?: boolean;
}) {
  const t = CAMPAIGN_TOOLS[tool];
  const Icon = t.icon;
  if (compact) {
    return (
      <button
        type="button"
        onClick={onOpen}
        aria-haspopup="dialog"
        title={t.description}
        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border/60 bg-background px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        <Icon className="h-3.5 w-3.5 text-text-secondary" />
        {t.label}
        {typeof count === "number" && count > 0 && (
          <span
            className="rounded-full bg-muted px-1.5 text-[10px] tabular-nums text-text-secondary"
            aria-label={`${count} ${count === 1 ? "item" : "itens"}`}
          >
            {count}
          </span>
        )}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-haspopup="dialog"
      className="group flex w-full items-center gap-3 rounded-xl border border-border/60 bg-background px-3 py-2.5 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground">
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-sm font-medium text-foreground">{t.label}</span>
          {typeof count === "number" && count > 0 && (
            <span
              className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] tabular-nums text-foreground"
              aria-label={`${count} ${count === 1 ? "item" : "itens"}`}
            >
              {count}
            </span>
          )}
        </span>
        <span className="block truncate text-xs text-text-secondary">{t.description}</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-text-secondary transition-transform group-hover:translate-x-0.5" />
    </button>
  );
}
