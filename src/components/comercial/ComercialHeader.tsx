import { Plus, Search } from "lucide-react";
import { COMERCIAL_PERIOD_OPTIONS, type ComercialPeriodMode } from "@/lib/comercial-metrics";

const inputCls =
  "h-9 w-full rounded-md border border-border bg-background px-2.5 text-sm outline-none focus:ring-2 focus:ring-ring";

/** Cabeçalho compacto — título, período, busca global e "Novo lead". A
 * navegação entre as 4 visões (Visão geral/Pipeline/Atividades/
 * Relatórios) vive como abas próprias no shell (`ComercialSection.tsx`),
 * não aqui, pra não competir visualmente com estes controles. */
export function ComercialHeader({
  query,
  onQueryChange,
  period,
  onPeriodChange,
  onNewLead,
}: {
  query: string;
  onQueryChange: (v: string) => void;
  period: ComercialPeriodMode;
  onPeriodChange: (v: ComercialPeriodMode) => void;
  onNewLead: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Comercial</h2>
        <p className="text-sm text-muted-foreground">Central de vendas — pipeline e forecast.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={period}
          onChange={(e) => onPeriodChange(e.target.value as ComercialPeriodMode)}
          className="h-9 rounded-md border border-border bg-background px-2.5 text-xs font-medium outline-none focus:ring-2 focus:ring-ring"
        >
          {COMERCIAL_PERIOD_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Buscar oportunidade..."
            className={`${inputCls} w-56 pl-8`}
          />
        </div>
        <button
          type="button"
          onClick={onNewLead}
          className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90"
        >
          <Plus className="h-3.5 w-3.5" /> Novo lead
        </button>
      </div>
    </div>
  );
}
