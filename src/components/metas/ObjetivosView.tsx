import { useEffect, useMemo, useRef, useState } from "react";
import { Filter, Search, X } from "lucide-react";
import { META_AREAS, type Indicador, type MetaArea, type Objetivo } from "@/lib/metas-store";
import {
  type IndicadorSaude,
  INDICADOR_SAUDE_LABEL,
  objetivoProgresso,
  objetivoResumoSaude,
  objetivoStats,
} from "@/lib/metas-engine";
import { fmtMonthYear } from "./metas-ui-utils";
import { ObjetivoSummaryCard } from "./ObjetivoSummaryCard";
import { useDropdown } from "./use-dropdown";

type Member = { name: string; photo?: string };

const AGRUPAMENTO_KEY = "metas.agrupamento";

/** Visão "Objetivos" — responde "estamos chegando onde queremos?".
 * Resumo em uma linha discreta (não cards), busca + um único popover de
 * filtros (Responsável/Área/Status/Período — o resto dos filtros
 * antigos, que serviam pra indicadores soltos, migrou pra aba
 * Indicadores), cards simplificados (uma linha de saúde só, nunca
 * várias contagens ao mesmo tempo). Estado 100% local — não recalcula
 * nada que `MetasSection` já não tenha computado, só reapresenta. */
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
    let emRisco = 0;
    let progressoSum = 0;
    let progressoCount = 0;
    for (const o of ativos) {
      const stats = objetivoStats(o.id, indicadores);
      const resumoSaude = objetivoResumoSaude(o, stats);
      if (resumoSaude === "saudavel") saudaveis++;
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

  const indicadoresPorObjetivo = (o: Objetivo) =>
    indicadores.filter((i) => i.objetivoIds?.includes(o.id));

  return (
    <div>
      <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
        <span>
          {resumo.ativos} objetivo{resumo.ativos === 1 ? "" : "s"} ativo
          {resumo.ativos === 1 ? "" : "s"}
        </span>
        <span>·</span>
        <button
          type="button"
          onClick={() => setSaudeFilter((s) => (s === "saudavel" ? "" : "saudavel"))}
          className="font-medium text-emerald-600 hover:underline dark:text-emerald-400"
        >
          {resumo.saudaveis} saudáve{resumo.saudaveis === 1 ? "l" : "is"}
        </button>
        <span>·</span>
        <button
          type="button"
          onClick={() => setSaudeFilter((s) => (s === "em_risco" ? "" : "em_risco"))}
          className={`font-medium hover:underline ${resumo.emRisco > 0 ? "text-rose-600 dark:text-rose-400" : "text-muted-foreground"}`}
        >
          {resumo.emRisco} em risco
        </button>
        <span>·</span>
        <span>
          {resumo.progressoMedio == null ? "—" : `${resumo.progressoMedio}%`} progresso médio
        </span>
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs sm:flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar objetivos..."
            className="h-9 w-full rounded-md border border-input bg-background pl-8 pr-2.5 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <div ref={filtersRef} className="relative">
          <button
            type="button"
            onClick={() => setFiltersOpen((v) => !v)}
            className={`inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-xs font-medium ${
              hasFilters
                ? "border-foreground bg-muted text-foreground"
                : "border-border text-muted-foreground hover:bg-muted/40"
            }`}
          >
            <Filter className="h-3.5 w-3.5" />{" "}
            {hasFilters ? `Filtros · ${activeChips.length}` : "Filtros"}
          </button>
          {filtersOpen && (
            <div className="absolute right-0 top-full z-20 mt-1 w-72 space-y-2 rounded-md border border-border bg-popover p-3 shadow-md">
              {donosEmUso.length > 0 && (
                <select
                  value={donoFilter}
                  onChange={(e) => setDonoFilter(e.target.value)}
                  className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
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
                className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
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
                className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
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
                  className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
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
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {activeChips.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={c.clear}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2.5 py-1 text-xs text-foreground hover:bg-muted"
            >
              {c.label} <X className="h-3 w-3" />
            </button>
          ))}
        </div>
      )}

      {objetivos.length === 0 ? (
        <div className="mt-8 rounded-lg border border-dashed border-border p-10 text-center">
          <p className="text-sm text-muted-foreground">Nenhum objetivo cadastrado ainda.</p>
        </div>
      ) : (
        <div className="mt-6 space-y-8">
          {meusObjetivos.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-foreground">Meus objetivos</h2>
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
                <h2 className="text-sm font-semibold text-foreground">Objetivos do time</h2>
                <div className="inline-flex items-center gap-0.5 rounded-md border border-border p-0.5 text-xs">
                  <button
                    type="button"
                    onClick={() => setAgrupamento("pessoa")}
                    className={`rounded px-2 py-1 font-medium ${
                      agrupamento === "pessoa"
                        ? "bg-muted text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Por pessoa
                  </button>
                  <button
                    type="button"
                    onClick={() => setAgrupamento("objetivo")}
                    className={`rounded px-2 py-1 font-medium ${
                      agrupamento === "objetivo"
                        ? "bg-muted text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Por objetivo
                  </button>
                </div>
              </div>

              {agrupamento === "pessoa" ? (
                objetivosPorDono.map(([dono, objs]) => (
                  <div key={dono} className="space-y-3">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {dono}
                    </h3>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
                ))
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
            <p className="text-sm text-muted-foreground">
              Nenhum objetivo corresponde aos filtros selecionados.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
