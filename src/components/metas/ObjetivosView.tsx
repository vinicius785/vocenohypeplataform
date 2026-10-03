import { useEffect, useMemo, useState } from "react";
import { Filter, Search, Target } from "lucide-react";
import { META_AREAS, type Indicador, type MetaArea, type Objetivo } from "@/lib/metas-store";
import {
  type IndicadorSaude,
  INDICADOR_SAUDE_LABEL,
  objetivoProgresso,
  objetivoResumoSaude,
  objetivoStats,
} from "@/lib/metas-engine";
import { FilterChips, FilterSearch } from "@/components/shared/FilterToolbar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { fmtMonthYear } from "./metas-ui-utils";
import { Avatar } from "./Avatar";
import { ObjetivoSummaryCard } from "./ObjetivoSummaryCard";
import { NativeSelect } from "@/components/ui/native-select";

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
      const key = o.dono || "Sem responsável";
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
      {/* Resumo — uma linha, não um painel: progresso médio e, SÓ quando
       * existir, o que pede atenção (clicável, vira filtro). "Saudáveis" não
       * aparece: é o estado normal e não pede decisão nenhuma. */}
      <div className="space-y-2">
        <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm text-text-secondary">
          <span className="text-2xl font-semibold tracking-tight text-foreground">
            {resumo.progressoMedio == null ? "—" : `${resumo.progressoMedio}%`}
          </span>
          <span>
            de progresso médio em {resumo.ativos} {resumo.ativos === 1 ? "objetivo" : "objetivos"}
          </span>
          {resumo.atencao > 0 && (
            <button
              type="button"
              onClick={() => setSaudeFilter((v) => (v === "atencao" ? "" : "atencao"))}
              className={`rounded font-medium text-warning hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${saudeFilter === "atencao" ? "underline" : ""}`}
            >
              · {resumo.atencao} em atenção
            </button>
          )}
          {resumo.emRisco > 0 && (
            <button
              type="button"
              onClick={() => setSaudeFilter((v) => (v === "em_risco" ? "" : "em_risco"))}
              className={`rounded font-medium text-danger hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${saudeFilter === "em_risco" ? "underline" : ""}`}
            >
              · {resumo.emRisco} em risco
            </button>
          )}
        </p>
        {resumo.progressoMedio != null && (
          <div className="h-1 w-full max-w-md overflow-hidden rounded-full bg-muted-foreground/15">
            <div
              className="h-full rounded-full bg-brand"
              style={{ width: `${resumo.progressoMedio}%` }}
            />
          </div>
        )}
      </div>

      {/* Toolbar única — busca + filtros, sincronizados com a mesma lista. */}
      <div className="flex flex-wrap items-center gap-2">
        <FilterSearch value={busca} onChange={setBusca} placeholder="Buscar objetivos..." />
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={`inline-flex h-9 items-center gap-1.5 rounded-md border border-input px-3 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                hasFilters ? "text-foreground" : "text-text-secondary hover:text-foreground"
              }`}
            >
              <Filter className="h-3.5 w-3.5" />{" "}
              {hasFilters ? `Filtros · ${activeChips.length}` : "Filtros"}
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72 space-y-2 p-3">
            {donosEmUso.length > 0 && (
              <NativeSelect
                value={donoFilter}
                onChange={(e) => setDonoFilter(e.target.value)}
                className="w-full"
              >
                <option value="">Responsável</option>
                {donosEmUso.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </NativeSelect>
            )}
            <NativeSelect
              value={areaFilter}
              onChange={(e) => setAreaFilter(e.target.value as typeof areaFilter)}
              className="w-full"
            >
              <option value="">Área</option>
              {META_AREAS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </NativeSelect>
            <NativeSelect
              value={saudeFilter}
              onChange={(e) => setSaudeFilter(e.target.value as typeof saudeFilter)}
              className="w-full"
            >
              <option value="">Status</option>
              {(Object.keys(INDICADOR_SAUDE_LABEL) as IndicadorSaude[]).map((s) => (
                <option key={s} value={s}>
                  {INDICADOR_SAUDE_LABEL[s]}
                </option>
              ))}
            </NativeSelect>
            {periodosEmUso.length > 0 && (
              <NativeSelect
                value={periodoFilter}
                onChange={(e) => setPeriodoFilter(e.target.value)}
                className="w-full"
              >
                <option value="">Período</option>
                {periodosEmUso.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </NativeSelect>
            )}
          </PopoverContent>
        </Popover>
      </div>

      <FilterChips
        chips={activeChips.map((c) => ({ id: c.key, label: c.label, onRemove: c.clear }))}
        onClear={clearAllFilters}
      />

      {objetivos.length === 0 ? (
        <div className="surface-card p-10 text-center">
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
              <p
                role="heading"
                aria-level={2}
                className="text-[15px] font-semibold text-foreground"
              >
                Meus objetivos
              </p>
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
                <p
                  role="heading"
                  aria-level={2}
                  className="text-[15px] font-semibold text-foreground"
                >
                  Objetivos do time
                </p>
                <SegmentedControl
                  aria-label="Agrupamento dos objetivos do time"
                  size="sm"
                  value={agrupamento}
                  onChange={setAgrupamento}
                  options={[
                    { value: "pessoa", label: "Por pessoa" },
                    { value: "objetivo", label: "Todos" },
                  ]}
                />
              </div>

              {agrupamento === "pessoa" ? (
                <div className="space-y-6">
                  {objetivosPorDono.map(([dono, objs]) => {
                    const donoMember = members.find((m) => m.name === dono);
                    return (
                      <div key={dono}>
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
            <div className="surface-card p-10 text-center">
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
