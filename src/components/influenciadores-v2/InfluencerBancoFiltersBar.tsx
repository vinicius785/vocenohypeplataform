import { Search, Filter, ArrowUpDown, X, LayoutGrid, List } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { NICHOS } from "@/components/influenciadores/InfluencerBoard";
import { type BankInflu } from "@/lib/banco-influs-store";
import {
  type InfluencerBancoFiltersState,
  type InfluencerBancoSort,
  DEFAULT_INFLUENCER_BANCO_FILTERS,
  countActiveInfluencerBancoFilters,
} from "@/lib/influencer-banco-v2";

const SORT_LABEL: Record<InfluencerBancoSort, string> = {
  recentes: "Atualização recente",
  nome: "Nome (A-Z)",
  seguidores: "Mais seguidores",
  campanhas: "Mais campanhas",
  avaliacao: "Melhor avaliação",
};

const pillCls = (active: boolean) =>
  `rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
    active
      ? "border-foreground bg-foreground text-background"
      : "border-border text-text-secondary hover:bg-muted"
  }`;

/** Mesmo padrão de `CampanhaFiltersBar.tsx` (pills num Popover, chips
 * removíveis) — nunca inventa um padrão de filtro novo. Nenhuma opção de
 * ordenação por "confiabilidade" (removida de propósito). */
export function InfluencerBancoFiltersBar({
  query,
  onQueryChange,
  filters,
  onFiltersChange,
  list,
  viewMode,
  onViewModeChange,
}: {
  query: string;
  onQueryChange: (v: string) => void;
  filters: InfluencerBancoFiltersState;
  onFiltersChange: (f: InfluencerBancoFiltersState) => void;
  list: BankInflu[];
  viewMode: "grade" | "lista";
  onViewModeChange: (v: "grade" | "lista") => void;
}) {
  const activeCount = countActiveInfluencerBancoFilters(filters);
  const redesPresentes = Array.from(new Set(list.flatMap((i) => i.redes.map((r) => r.plataforma))));

  const chips: { key: keyof InfluencerBancoFiltersState; label: string }[] = [];
  if (filters.nicho) chips.push({ key: "nicho", label: filters.nicho });
  if (filters.rede) chips.push({ key: "rede", label: filters.rede });
  if (filters.seguidoresMin)
    chips.push({ key: "seguidoresMin", label: `≥ ${filters.seguidoresMin} seguidores` });
  if (filters.comHistorico)
    chips.push({
      key: "comHistorico",
      label: filters.comHistorico === "com" ? "Com histórico" : "Sem histórico",
    });
  if (filters.avaliado)
    chips.push({
      key: "avaliado",
      label: filters.avaliado === "avaliado" ? "Avaliados" : "Não avaliados",
    });
  if (filters.notaMin) chips.push({ key: "notaMin", label: `Nota ≥ ${filters.notaMin}` });

  const clearChip = (key: keyof InfluencerBancoFiltersState) =>
    onFiltersChange({ ...filters, [key]: DEFAULT_INFLUENCER_BANCO_FILTERS[key] });

  return (
    <div className="rounded-2xl bg-card p-3 dark:shadow-none">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary" />
          <input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Buscar por nome, @handle, telefone ou e-mail..."
            className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand"
          />
        </div>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5">
              <Filter className="h-3.5 w-3.5" />
              Filtros
              {activeCount > 0 && (
                <Badge variant="secondary" className="ml-0.5 h-5 px-1.5 text-[10px]">
                  {activeCount}
                </Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-72 space-y-3 p-3">
            <div>
              <p className="mb-1.5 text-[11px] font-medium text-text-secondary">Nicho</p>
              <div className="flex flex-wrap gap-1.5">
                {NICHOS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={pillCls(filters.nicho === n)}
                    onClick={() =>
                      onFiltersChange({ ...filters, nicho: filters.nicho === n ? "" : n })
                    }
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            {redesPresentes.length > 0 && (
              <div>
                <p className="mb-1.5 text-[11px] font-medium text-text-secondary">Rede social</p>
                <div className="flex flex-wrap gap-1.5">
                  {redesPresentes.map((r) => (
                    <button
                      key={r}
                      type="button"
                      className={pillCls(filters.rede === r)}
                      onClick={() =>
                        onFiltersChange({ ...filters, rede: filters.rede === r ? "" : r })
                      }
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <p className="mb-1.5 text-[11px] font-medium text-text-secondary">
                Seguidores (mínimo)
              </p>
              <input
                type="number"
                min={0}
                value={filters.seguidoresMin}
                onChange={(e) => onFiltersChange({ ...filters, seguidoresMin: e.target.value })}
                placeholder="Ex: 10000"
                className="h-8 w-full rounded-md border border-input bg-background px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand"
              />
            </div>

            <div>
              <p className="mb-1.5 text-[11px] font-medium text-text-secondary">Histórico</p>
              <div className="flex flex-wrap gap-1.5">
                {(["com", "sem"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    className={pillCls(filters.comHistorico === v)}
                    onClick={() =>
                      onFiltersChange({
                        ...filters,
                        comHistorico: filters.comHistorico === v ? "" : v,
                      })
                    }
                  >
                    {v === "com" ? "Com histórico" : "Sem histórico"}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-1.5 text-[11px] font-medium text-text-secondary">
                Avaliação do time
              </p>
              <div className="flex flex-wrap gap-1.5">
                {(["avaliado", "nao_avaliado"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    className={pillCls(filters.avaliado === v)}
                    onClick={() =>
                      onFiltersChange({ ...filters, avaliado: filters.avaliado === v ? "" : v })
                    }
                  >
                    {v === "avaliado" ? "Avaliados" : "Não avaliados"}
                  </button>
                ))}
              </div>
              <input
                type="number"
                min={1}
                max={5}
                value={filters.notaMin}
                onChange={(e) => onFiltersChange({ ...filters, notaMin: e.target.value })}
                placeholder="Nota mínima (1-5)"
                className="mt-1.5 h-8 w-full rounded-md border border-input bg-background px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand"
              />
            </div>

            {activeCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-text-secondary"
                onClick={() => onFiltersChange(DEFAULT_INFLUENCER_BANCO_FILTERS)}
              >
                Limpar filtros
              </Button>
            )}
          </PopoverContent>
        </Popover>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5">
              <ArrowUpDown className="h-3.5 w-3.5" />
              {SORT_LABEL[filters.sort]}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-56 p-1">
            {(Object.keys(SORT_LABEL) as InfluencerBancoSort[]).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => onFiltersChange({ ...filters, sort: s })}
                className={`block w-full rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-muted ${
                  filters.sort === s ? "font-medium text-foreground" : "text-text-secondary"
                }`}
              >
                {SORT_LABEL[s]}
              </button>
            ))}
          </PopoverContent>
        </Popover>

        <div className="ml-auto flex items-center gap-0.5 rounded-md border border-border p-0.5">
          <button
            type="button"
            onClick={() => onViewModeChange("grade")}
            className={`rounded px-2 py-1 ${viewMode === "grade" ? "bg-muted text-foreground" : "text-text-secondary"}`}
            aria-label="Visualizar em grade"
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => onViewModeChange("lista")}
            className={`rounded px-2 py-1 ${viewMode === "lista" ? "bg-muted text-foreground" : "text-text-secondary"}`}
            aria-label="Visualizar em lista"
          >
            <List className="h-4 w-4" />
          </button>
        </div>
      </div>

      {chips.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {chips.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => clearChip(c.key)}
              className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-text-secondary hover:bg-muted/70"
            >
              {c.label}
              <X className="h-3 w-3" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
