import { Search } from "lucide-react";

export type CampaignStatusFilter = "todas" | "ativas" | "planejadas" | "encerradas";

const OPTIONS: { key: CampaignStatusFilter; label: string }[] = [
  { key: "todas", label: "Todas" },
  { key: "ativas", label: "Ativas" },
  { key: "planejadas", label: "Planejadas" },
  { key: "encerradas", label: "Encerradas" },
];

/** Toolbar única — busca ocupando a maior parte da largura + segmentado
 * de status. Mesma altura entre os dois controles, sem filtros
 * avançados nesta rodada (não haveria o que filtrar além de status). */
export function ClientCampaignToolbar({
  query,
  onQueryChange,
  status,
  onStatusChange,
}: {
  query: string;
  onQueryChange: (v: string) => void;
  status: CampaignStatusFilter;
  onStatusChange: (v: CampaignStatusFilter) => void;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <div className="relative min-w-[200px] flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary" />
        <input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Buscar campanhas..."
          className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand"
        />
      </div>
      <div className="flex gap-1 rounded-md border border-border bg-card p-1">
        {OPTIONS.map((opt) => (
          <button
            key={opt.key}
            type="button"
            onClick={() => onStatusChange(opt.key)}
            className={`h-7 rounded-md px-2.5 text-xs font-medium transition-colors ${
              status === opt.key
                ? "bg-brand-subtle text-brand"
                : "text-text-secondary hover:bg-muted hover:text-foreground"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
