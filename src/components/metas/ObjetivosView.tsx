import { useEffect, useMemo, useRef, useState } from "react";
import { Filter, Search, Target, X } from "lucide-react";
import { META_AREAS, type Indicador, type MetaArea, type Objetivo } from "@/lib/metas-store";
import {
  type IndicadorSaude,
  INDICADOR_SAUDE_LABEL,
  objetivoProgresso,
  objetivoResumoSaude,
  objetivoStats,
} from "@/lib/metas-engine";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { fmtMonthYear } from "./metas-ui-utils";
import { Avatar } from "./Avatar";
import { ObjetivoSummaryCard } from "./ObjetivoSummaryCard";
import { useDropdown } from "./use-dropdown";

type Member = { name: string; photo?: string };

const AGRUPAMENTO_KEY = "metas.agrupamento";

/** Visão "Objetivos" — responde "estamos chegando onde queremos?".
 * Protagonista azul com o progresso médio (dado dominante) + apoio
 * (ativos/saudáveis/atenção/risco), toolbar única (busca + filtros +
 * chips removíveis), "Meus objetivos" em destaque, "Objetivos do time"
 * agrupável por pessoa/objetivo. Estado 100% local — não recalcula nada
 * que `MetasSection` já não tenha computado, só reapresenta. */
export function ObjetivosView({
  objetivos,
  indicadores,
  members,
  meName,
  onOpenObjetivo,
}: {
  objetivos: Objetivo[];
  indicadores: Indicador[];
  members: Member[];
  meName: string;
  onOpenObjetivo: (id: string) => void;
}) {
  const [busca, setBusca] = useState("");
  const [areaFilter, setAreaFilter] = useState<"" | MetaArea>("");
  const [donoFilter, setDonoFilter] = useState("");
  const [saudeFilter, setSaudeFilter] = useState<"" | IndicadorSaude>("");
  const [periodoFilter, setPeriodoFilter] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filtersRef = useRef<HTMLDivElement>(null);
  useDropdown(filtersRef, filtersOpen, () => setFiltersOpen(false));

  const [agrupamento, setAgrupamento] = useState<"pessoa" | "objetivo">(() => {
    try {
      return sessionStorage.getItem(AGRUPAMENTO_KEY) === "objetivo" ? "objetivo" : "pessoa";
    } catch {
      return "pessoa";
    }
  });
  useEffect(() => {
    try {
      sessionStorage.setItem(AGRUPAMENTO_KEY, agrupamento);
    } catch {
      /* ignore */
    }
  }, [agrupamento]);

  const donosEmUso = useMemo(
    () => Array.from(new Set(objetivos.map((o) => o.dono).filter((d): d is string => !!d))).sort(),
    [objetivos],
  );
  const periodosEmUso = useMemo(() => {
    const yms = new Set<string>();
    for (const o of objetivos) if (o.dataFim) yms.add(o.dataFim.slice(0, 7));
    return Array.from(yms)
      .sort()
      .map((ym) => ({ value: ym, label: fmtMonthYear(`${ym}-01`) }));
  }, [objetivos]);

  const resumo = useMemo(() => {
    const ativos = objetivos.filter((o) => !o.cancelado);
    let saudaveis = 0;
    let atencao = 0;
    let emRisco = 0;
    let progressoSum = 0;
    let progressoCount = 0;
    for (const o of ativos) {
      const stats = objetivoStats(o.id, indicadores);
      const resumoSaude = objetivoResumoSaude(o, stats);
      if (resumoSaude === "saudavel") saudaveis++;
      else if (resumoSaude === "atencao") atencao++;
      else if (resumoSaude === "em_risco") emRisco++;
      const p = objetivoProgresso(o.id, indicadores);
      if (p != null) {
        progressoSum += p;
        progressoCount++;
      }
    }
    return {
      ativos: ativos.length,
      saudaveis,
      atencao,
      emRisco,
      progressoMedio: progressoCount > 0 ? Math.round(progressoSum / progressoCount) : null,
    };
  }, [objetivos, indicadores]);

  const matches = (o: Objetivo): boolean => {
    if (areaFilter && o.area !== areaFilter) return false;
    if (donoFilter && o.dono !== donoFilter) return false;
    if (periodoFilter && o.dataFim?.slice(0, 7) !== periodoFilter) return false;
    if (saudeFilter && objetivoResumoSaude(o, objetivoStats(o.id, indicadores)) !== saudeFilter) {
      return false;
    }
    if (busca.trim() && !o.titulo.toLowerCase().includes(busca.trim().toLowerCase())) return false;
    return true;
  };

  const visiveis = useMemo(
    () => objetivos.filter(matches),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [objetivos, indicadores, areaFilter, donoFilter, saudeFilter, periodoFilter, busca],
  );

  const meusObjetivos = visiveis.filter((o) => o.dono === meName);
  const outrosObjetivos = visiveis.filter((o) => o.dono !== meName);
  const objetivosPorDono = useMemo(() => {
    const map = new Map<string, Objetivo[]>();
    for (const o of outrosObjetivos) {
      const key = o.dono || "Sem dono";
      map.set(key, [...(map.get(key) ?? []), o]);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [outrosObjetivos]);

  const hasFilters = !!(areaFilter || donoFilter || saudeFilter || periodoFilter);
  const activeChips: { key: string; label: string; clear: () => void }[] = [
    donoFilter && { key: "dono", label: donoFilter, clear: () => setDonoFilter("") },
    areaFilter && { key: "area", label: areaFilter, clear: () => setAreaFilter("") },
    saudeFilter && {
      key: "saude",
      label: INDICADOR_SAUDE_LABEL[saudeFilter],
      clear: () => setSaudeFilter(""),
    },
    periodoFilter && {
      key: "periodo",
      label: periodosEmUso.find((p) => p.value === periodoFilter)?.label ?? periodoFilter,
      clear: () => setPeriodoFilter(""),
    },
  ].filter((c): c is { key: string; label: string; clear: () => void } => !!c);

  const clearAllFilters = () => {
    setAreaFilter("");
    setDonoFilter("");
    setSaudeFilter("");
    setPeriodoFilter("");
  };

  const indicadoresPorObjetivo = (o: Objetivo) =>
    indicadores.filter((i) => i.objetivoIds?.includes(o.id));

  return (
    <div className="space-y-6">
      {/* Protagonista — progresso médio é o dado dominante; os demais
       * (ativos/saudáveis/atenção/risco) são apoio dentro da mesma
       * composição, nunca 4 cards do mesmo peso. */}
      <div className="rounded-[28px] bg-brand p-6 dark:shadow-none md:p-7">
        <span className="inline-flex items-center rounded-full bg-black/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-brand-foreground">
          Progresso médio
        </span>
        <p className="mt-4 whitespace-nowrap text-[48px] font-bold leading-none tracking-tight text-brand-foreground sm:text-[56px] md:text-[64px]">
          {resumo.progressoMedio == null ? "—" : `${resumo.progressoMedio}%`}
        </p>
        <div className="mt-6 flex flex-wrap items-end gap-x-8 gap-y-3">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-brand-foreground-secondary">
              Ativos
            </p>
            <p className="text-lg font-semibold text-brand-foreground">{resumo.ativos}</p>
          </div>
          <button
            type="button"
            onClick={() => setSaudeFilter((s) => (s === "saudavel" ? "" : "saudavel"))}
            className="text-left"
          >
            <p className="text-[11px] font-medium uppercase tracking-wide text-brand-foreground-secondary">
              Saudáveis
            </p>
            <p className="text-lg font-semibold text-brand-foreground underline-offset-4 hover:underline">
              {resumo.saudaveis}
            </p>
          </button>
          <button
            type="button"
            onClick={() => setSaudeFilter((s) => (s === "atencao" ? "" : "atencao"))}
            className="text-left"
          >
            <p className="text-[11px] font-medium uppercase tracking-wide text-brand-foreground-secondary">
              Em atenção
            </p>
            <p className="text-lg font-semibold text-brand-foreground underline-offset-4 hover:underline">
              {resumo.atencao}
            </p>
          </button>
          <button
            type="button"
            onClick={() => setSaudeFilter((s) => (s === "em_risco" ? "" : "em_risco"))}
            className="text-left"
          >
            <p className="text-[11px] font-medium uppercase tracking-wide text-brand-foreground-secondary">
              Em risco
            </p>
            <p className="text-lg font-semibold text-brand-foreground underline-offset-4 hover:underline">
              {resumo.emRisco}
            </p>
          </button>
        </div>
      </div>

      {/* Toolbar única — busca + filtros, sincronizados com a mesma lista. */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-card p-2 dark:shadow-none">
        <div className="relative w-full max-w-xs sm:flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-secondary" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar objetivos..."
            className="h-9 border-0 bg-background pl-8 text-sm focus-visible:ring-brand"
          />
        </div>
        <div ref={filtersRef} className="relative">
          <button
            type="button"
            onClick={() => setFiltersOpen((v) => !v)}
            aria-expanded={filtersOpen}
            className={`inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
              hasFilters
                ? "bg-brand-subtle text-brand"
                : "bg-background text-text-secondary hover:text-foreground"
            }`}
          >
            <Filter className="h-3.5 w-3.5" />{" "}
            {hasFilters ? `Filtros · ${activeChips.length}` : "Filtros"}
          </button>
          {filtersOpen && (
            <div className="absolute right-0 top-full z-20 mt-1.5 w-72 space-y-2 rounded-2xl bg-popover p-3 shadow-lg dark:shadow-none">
              {donosEmUso.length > 0 && (
                <select
                  value={donoFilter}
                  onChange={(e) => setDonoFilter(e.target.value)}
                  className="h-9 w-full rounded-md border-0 bg-muted px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                >
                  <option value="">Responsável</option>
                  {donosEmUso.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              )}
              <select
                value={areaFilter}
                onChange={(e) => setAreaFilter(e.target.value as typeof areaFilter)}
                className="h-9 w-full rounded-md border-0 bg-muted px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                <option value="">Área</option>
                {META_AREAS.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
              <select
                value={saudeFilter}
                onChange={(e) => setSaudeFilter(e.target.value as typeof saudeFilter)}
                className="h-9 w-full rounded-md border-0 bg-muted px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                <option value="">Status</option>
                {(Object.keys(INDICADOR_SAUDE_LABEL) as IndicadorSaude[]).map((s) => (
                  <option key={s} value={s}>
                    {INDICADOR_SAUDE_LABEL[s]}
                  </option>
                ))}
              </select>
              {periodosEmUso.length > 0 && (
                <select
                  value={periodoFilter}
                  onChange={(e) => setPeriodoFilter(e.target.value)}
                  className="h-9 w-full rounded-md border-0 bg-muted px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                >
                  <option value="">Período</option>
                  {periodosEmUso.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}
        </div>
      </div>

      {activeChips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {activeChips.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={c.clear}
              className="inline-flex items-center gap-1 rounded-full bg-brand-subtle px-2.5 py-1 text-xs font-medium text-brand hover:bg-brand-subtle/70"
            >
              {c.label} <X className="h-3 w-3" />
            </button>
          ))}
          <button
            type="button"
            onClick={clearAllFilters}
            className="text-xs font-medium text-text-secondary hover:text-foreground"
          >
            Limpar filtros
          </button>
        </div>
      )}

      {objetivos.length === 0 ? (
        <div className="rounded-[24px] bg-card p-10 text-center dark:shadow-none">
          <Target className="mx-auto h-8 w-8 text-text-secondary/50" />
          <p className="mt-3 text-sm font-medium text-foreground">Nenhum objetivo cadastrado</p>
          <p className="mt-1 text-sm text-text-secondary">
            Crie o primeiro objetivo pelo botão "Criar" no topo da página.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {meusObjetivos.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-[15px] font-semibold text-foreground">Meus objetivos</h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {meusObjetivos.map((o) => (
                  <ObjetivoSummaryCard
                    key={o.id}
                    objetivo={o}
                    indicadores={indicadoresPorObjetivo(o)}
                    members={members}
                    onOpen={() => onOpenObjetivo(o.id)}
                  />
                ))}
              </div>
            </section>
          )}

          {outrosObjetivos.length > 0 && (
            <section className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-[15px] font-semibold text-foreground">Objetivos do time</h2>
                <SegmentedControl
                  aria-label="Agrupamento dos objetivos do time"
                  size="sm"
                  value={agrupamento}
                  onChange={setAgrupamento}
                  options={[
                    { value: "pessoa", label: "Por pessoa" },
                    { value: "objetivo", label: "Por objetivo" },
                  ]}
                />
              </div>

              {agrupamento === "pessoa" ? (
                <div className="space-y-6">
                  {objetivosPorDono.map(([dono, objs]) => {
                    const donoMember = members.find((m) => m.name === dono);
                    return (
                      <div key={dono} className="rounded-[24px] bg-card p-5 dark:shadow-none">
                        <div className="flex items-center gap-2.5">
                          <Avatar name={dono} photo={donoMember?.photo} size="md" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-foreground">{dono}</p>
                            <p className="text-xs text-text-secondary">
                              {objs.length} {objs.length === 1 ? "objetivo" : "objetivos"}
                            </p>
                          </div>
                        </div>
                        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                          {objs.map((o) => (
                            <ObjetivoSummaryCard
                              key={o.id}
                              objetivo={o}
                              indicadores={indicadoresPorObjetivo(o)}
                              members={members}
                              onOpen={() => onOpenObjetivo(o.id)}
                              compact
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {outrosObjetivos.map((o) => (
                    <ObjetivoSummaryCard
                      key={o.id}
                      objetivo={o}
                      indicadores={indicadoresPorObjetivo(o)}
                      members={members}
                      onOpen={() => onOpenObjetivo(o.id)}
                    />
                  ))}
                </div>
              )}
            </section>
          )}

          {meusObjetivos.length === 0 && outrosObjetivos.length === 0 && (
            <div className="rounded-[24px] bg-card p-10 text-center dark:shadow-none">
              <Search className="mx-auto h-8 w-8 text-text-secondary/50" />
              <p className="mt-3 text-sm font-medium text-foreground">Nenhum objetivo encontrado</p>
              <p className="mt-1 text-sm text-text-secondary">
                {busca.trim()
                  ? "Ajuste a busca ou remova filtros ativos."
                  : "Nenhum objetivo corresponde aos filtros selecionados."}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
