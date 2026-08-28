import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Filter, Plus, Search, Target, TrendingUp, X } from "lucide-react";
import { SectionHeader } from "../SectionHeader";
import { useConfirm } from "@/hooks/use-confirm";
import { getMe } from "@/lib/chat-store";
import { loadTeamMembers } from "@/lib/projetos";
import {
  META_AREAS,
  TRACKING_FREQUENCIES,
  loadMetas,
  saveMetas,
  onMetasChange,
  type MetaItem,
  type Objetivo,
  type Indicador,
  type TrackingFrequency,
  type ComparisonOperator,
} from "@/lib/metas-store";
import {
  indicadorSaude,
  objetivoProgresso,
  objetivoResumoSaude,
  objetivoStats,
  direcaoParaComparadorPadrao,
  type IndicadorSaude,
  INDICADOR_SAUDE_LABEL,
} from "@/lib/metas-engine";
import { ObjetivoSummaryCard } from "./ObjetivoSummaryCard";
import { IndicadorRow } from "./IndicadorRow";
import { ObjetivoPage } from "./ObjetivoPage";
import { IndicadorPage } from "./IndicadorPage";
import { ObjetivoQuickDialog } from "./ObjetivoQuickDialog";
import { IndicadorQuickCreateDialog } from "./IndicadorQuickCreateDialog";
import { IndicadorQuickUpdate, type IndicadorQuickPatch } from "./IndicadorQuickUpdate";
import { colorFor, fmtMonthYear, initialsOf } from "./metas-ui-utils";
import { useDropdown } from "./use-dropdown";

const AGRUPAMENTO_KEY = "metas.agrupamento";

const FREQUENCY_LABEL: Record<TrackingFrequency, string> = {
  continuo: "Contínuo",
  semanal: "Semanal",
  mensal: "Mensal",
  trimestral: "Trimestral",
  personalizado: "Personalizado",
};

type MetasView =
  | { kind: "list" }
  | { kind: "objetivo"; id: string }
  // `fromObjetivoId` só serve pra rotular o botão "voltar" — a lista
  // completa de objetivos que o indicador alimenta aparece na própria
  // página dele (`IndicadorPage`), já que agora pode estar em vários.
  | { kind: "indicador"; id: string; fromObjetivoId?: string };

export function MetasSection() {
  const [items, setItems] = useState<MetaItem[]>(() => loadMetas());
  const me = getMe();
  const members = useMemo(() => loadTeamMembers(), []);

  const [viewStack, setViewStack] = useState<MetasView[]>([{ kind: "list" }]);
  const view = viewStack[viewStack.length - 1];
  const push = (v: MetasView) => setViewStack((s) => [...s, v]);
  const pop = () => setViewStack((s) => (s.length > 1 ? s.slice(0, -1) : s));

  const [areaFilter, setAreaFilter] = useState("");
  const [donoFilter, setDonoFilter] = useState("");
  const [colaboradorFilter, setColaboradorFilter] = useState("");
  const [tipoFilter, setTipoFilter] = useState<"" | "objetivo" | "indicador">("");
  const [saudeFilter, setSaudeFilter] = useState<"" | IndicadorSaude>("");
  const [frequenciaFilter, setFrequenciaFilter] = useState<"" | TrackingFrequency>("");
  const [origemFilter, setOrigemFilter] = useState<"" | "manual" | "auto">("");
  const [periodoFilter, setPeriodoFilter] = useState(""); // "YYYY-MM" (mês de dataFim)
  const [busca, setBusca] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filtersRef = useRef<HTMLDivElement>(null);
  useDropdown(filtersRef, filtersOpen, () => setFiltersOpen(false));

  // "Por pessoa"/"Por objetivo" — persiste só durante a sessão (sessionStorage),
  // sem precisar de backend nem sobreviver ao fechar a aba.
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

  const [objetivoDialog, setObjetivoDialog] = useState<{ data?: Objetivo } | null>(null);
  const [indicadorCreateDialog, setIndicadorCreateDialog] = useState(false);
  const [quickUpdateTarget, setQuickUpdateTarget] = useState<Indicador | null>(null);
  const novoMenu = useRef<HTMLDivElement>(null);
  const [novoOpen, setNovoOpen] = useState(false);
  useDropdown(novoMenu, novoOpen, () => setNovoOpen(false));
  const { confirm, confirmDialog } = useConfirm();

  const persist = (next: MetaItem[]) => {
    setItems(next);
    saveMetas(next);
  };
  useEffect(() => onMetasChange(() => setItems(loadMetas())), []);

  // Se o objetivo/indicador aberto sumir (excluído em outra aba, por
  // exemplo), volta pra lista em vez de ficar preso numa página vazia —
  // nunca chama setState direto durante o render.
  useEffect(() => {
    if (view.kind === "objetivo" && !items.some((x) => x.id === view.id)) {
      setViewStack([{ kind: "list" }]);
    }
    if (view.kind === "indicador" && !items.some((x) => x.id === view.id)) {
      setViewStack((s) => (s.length > 1 ? s.slice(0, -1) : [{ kind: "list" }]));
    }
  }, [view, items]);

  const objetivos = useMemo(
    () => items.filter((m): m is Objetivo => m.kind === "objetivo"),
    [items],
  );
  const indicadores = useMemo(
    () => items.filter((m): m is Indicador => m.kind === "indicador"),
    [items],
  );
  const indicadoresStandalone = useMemo(
    () => indicadores.filter((i) => !i.objetivoIds?.length),
    [indicadores],
  );

  const donosEmUso = useMemo(
    () => Array.from(new Set(items.map((m) => m.dono).filter((d): d is string => !!d))).sort(),
    [items],
  );
  const colaboradoresEmUso = useMemo(
    () => Array.from(new Set(items.flatMap((m) => m.colaboradores ?? []))).sort(),
    [items],
  );
  // "YYYY-MM" real (de dataFim) → rótulo "Mês Ano" — ordenado
  // cronologicamente (a chave YYYY-MM já ordena certo como string).
  const periodosEmUso = useMemo(() => {
    const yms = new Set<string>();
    for (const m of items) if (m.dataFim) yms.add(m.dataFim.slice(0, 7));
    return Array.from(yms)
      .sort()
      .map((ym) => ({ value: ym, label: fmtMonthYear(`${ym}-01`) }));
  }, [items]);

  // Resumo do topo (item novo): conta OBJETIVOS (não indicadores soltos)
  // por saúde consolidada + progresso médio real — antes o resumo
  // tabulava saúde de indicador solto, que não respondia "quantos
  // objetivos estão em risco".
  const resumoObjetivos = useMemo(() => {
    const ativos = objetivos.filter((o) => !o.cancelado);
    let saudaveis = 0;
    let emRisco = 0;
    let progressoSum = 0;
    let progressoCount = 0;
    for (const o of ativos) {
      const stats = objetivoStats(o.id, indicadores);
      const resumo = objetivoResumoSaude(o, stats);
      if (resumo === "saudavel") saudaveis++;
      else if (resumo === "em_risco") emRisco++;
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

  const matchesFilters = (m: MetaItem): boolean => {
    if (areaFilter && m.area !== areaFilter) return false;
    if (donoFilter && m.dono !== donoFilter) return false;
    if (colaboradorFilter && !(m.colaboradores ?? []).includes(colaboradorFilter)) return false;
    if (tipoFilter && m.kind !== tipoFilter) return false;
    if (frequenciaFilter && m.frequencia !== frequenciaFilter) return false;
    if (origemFilter && (m.kind !== "indicador" || m.dataSource !== origemFilter)) return false;
    if (periodoFilter && m.dataFim?.slice(0, 7) !== periodoFilter) return false;
    if (saudeFilter) {
      if (m.kind === "indicador" && indicadorSaude(m) !== saudeFilter) return false;
      if (
        m.kind === "objetivo" &&
        objetivoResumoSaude(m, objetivoStats(m.id, indicadores)) !== saudeFilter
      )
        return false;
    }
    if (busca.trim() && !m.titulo.toLowerCase().includes(busca.trim().toLowerCase())) return false;
    return true;
  };

  const hasFilters =
    areaFilter ||
    donoFilter ||
    colaboradorFilter ||
    tipoFilter ||
    saudeFilter ||
    frequenciaFilter ||
    origemFilter ||
    periodoFilter;
  const clearFilters = () => {
    setAreaFilter("");
    setDonoFilter("");
    setColaboradorFilter("");
    setTipoFilter("");
    setSaudeFilter("");
    setPeriodoFilter("");
    setFrequenciaFilter("");
    setOrigemFilter("");
  };

  const visibleObjetivos = useMemo(
    () => objetivos.filter(matchesFilters),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      objetivos,
      indicadores,
      areaFilter,
      donoFilter,
      colaboradorFilter,
      tipoFilter,
      saudeFilter,
      frequenciaFilter,
      origemFilter,
      periodoFilter,
      busca,
    ],
  );
  const visibleIndicadoresStandalone = useMemo(
    () => indicadoresStandalone.filter(matchesFilters),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      indicadoresStandalone,
      areaFilter,
      donoFilter,
      colaboradorFilter,
      tipoFilter,
      saudeFilter,
      frequenciaFilter,
      origemFilter,
      periodoFilter,
      busca,
    ],
  );

  const meusObjetivos = visibleObjetivos.filter((o) => o.dono === me.name);
  const outrosObjetivos = visibleObjetivos.filter((o) => o.dono !== me.name);
  const objetivosPorDono = useMemo(() => {
    const map = new Map<string, Objetivo[]>();
    for (const o of outrosObjetivos) {
      const key = o.dono || "Sem dono";
      map.set(key, [...(map.get(key) ?? []), o]);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [outrosObjetivos]);

  // --- mutações ---------------------------------------------------------

  const saveObjetivoBasic = (obj: Objetivo) => {
    const isNew = !items.some((x) => x.id === obj.id);
    persist(isNew ? [...items, obj] : items.map((x) => (x.id === obj.id ? obj : x)));
    setObjetivoDialog(null);
    if (isNew) push({ kind: "objetivo", id: obj.id });
  };

  const createIndicadorStandalone = (ind: Indicador) => {
    persist([...items, ind]);
    setIndicadorCreateDialog(false);
    push({ kind: "indicador", id: ind.id });
  };

  // Indicador criado de dentro de um objetivo já nasce vinculado
  // (`objetivoIds`/`niveis.esperado` já vêm assim do formulário) — só
  // falta semear o VÍNCULO com meta/operador explícitos (`alvos`), pra
  // não depender do fallback global assim que a página do indicador for
  // aberta a partir deste objetivo. Sem mudança nenhuma no formulário
  // de criação em si.
  const createIndicadorForObjetivo = (ind: Indicador, objetivoId: string) => {
    const withAlvo: Indicador =
      ind.niveis.esperado != null
        ? {
            ...ind,
            alvos: {
              ...ind.alvos,
              [objetivoId]: {
                meta: ind.niveis.esperado,
                comparador: direcaoParaComparadorPadrao(ind.direcao),
              },
            },
          }
        : ind;
    persist([...items, withAlvo]);
  };

  // Indicador é universal: vincular só ADICIONA objetivoId à lista dele
  // (nunca mexe em dono/colaboradores/período — isso é sempre do próprio
  // indicador agora, não herdado de nenhum objetivo). `cfg` (opcional)
  // já grava peso/meta/operador do vínculo na mesma tacada, vindo do
  // novo diálogo "Vincular ao objetivo" — sem `cfg`, o vínculo nasce sem
  // override nenhum e cai no fallback global (`niveis.esperado`/`direcao`).
  const linkIndicador = (
    objetivoId: string,
    indId: string,
    cfg?: { peso?: number; meta?: number; comparador?: ComparisonOperator },
  ) => {
    persist(
      items.map((x) => {
        if (x.id !== indId || x.kind !== "indicador") return x;
        const next: Indicador = {
          ...x,
          objetivoIds: Array.from(new Set([...(x.objetivoIds ?? []), objetivoId])),
        };
        if (cfg?.peso != null) next.pesos = { ...x.pesos, [objetivoId]: cfg.peso };
        if (cfg?.meta != null || cfg?.comparador != null) {
          next.alvos = { ...x.alvos, [objetivoId]: { meta: cfg.meta, comparador: cfg.comparador } };
        }
        return next;
      }),
    );
  };

  const unlinkIndicador = (objetivoId: string, indId: string) => {
    persist(
      items.map((x) => {
        if (x.id !== indId || x.kind !== "indicador") return x;
        const { [objetivoId]: _removido, ...restoPesos } = x.pesos ?? {};
        const { [objetivoId]: _removidoAlvo, ...restoAlvos } = x.alvos ?? {};
        return {
          ...x,
          objetivoIds: (x.objetivoIds ?? []).filter((id) => id !== objetivoId),
          pesos: Object.keys(restoPesos).length ? restoPesos : undefined,
          alvos: Object.keys(restoAlvos).length ? restoAlvos : undefined,
        };
      }),
    );
  };

  const savePesos = (objetivoId: string, pesos: Record<string, number>) => {
    persist(
      items.map((x) =>
        x.kind === "indicador" && pesos[x.id] != null
          ? { ...x, pesos: { ...x.pesos, [objetivoId]: pesos[x.id] } }
          : x,
      ),
    );
  };

  const updateIndicadorPatch = (
    ind: Indicador,
    patch: IndicadorQuickPatch,
    nota: string,
    dataISO: string,
  ) => {
    // Meio-dia local (não meia-noite UTC) — mesmo cuidado de fuso já usado
    // em outras partes do app: uma atualização registrada como "hoje" não
    // pode virar "ontem" só por causa do UTC-3 do Brasil.
    const createdAt = new Date(`${dataISO}T12:00:00`).toISOString();
    const entry = {
      id: crypto.randomUUID(),
      valor: patch.valorAtual,
      nota: nota.trim() || undefined,
      author: me.name,
      initials: initialsOf(me.name) || "?",
      color: colorFor(me.name),
      createdAt,
    };
    persist(
      items.map((x) =>
        x.id === ind.id && x.kind === "indicador"
          ? {
              ...x,
              ...patch,
              updatedAt: entry.createdAt,
              atualizacoes: [...(x.atualizacoes ?? []), entry],
            }
          : x,
      ),
    );
  };

  const saveIndicadorAdvanced = (ind: Indicador) => {
    persist(items.map((x) => (x.id === ind.id ? ind : x)));
  };

  const handleDeleteObjetivo = async (obj: Objetivo) => {
    const filhos = indicadores.filter((i) => i.objetivoIds?.includes(obj.id));
    const ok = await confirm(
      filhos.length > 0
        ? `Excluir o objetivo "${obj.titulo}"? Os ${filhos.length} indicador(es) vinculados continuam existindo, só deixam de fazer parte deste objetivo.`
        : `Excluir o objetivo "${obj.titulo}"?`,
    );
    if (!ok) return;
    persist(
      items
        .filter((x) => x.id !== obj.id)
        .map((x) =>
          x.kind === "indicador" && x.objetivoIds?.includes(obj.id)
            ? { ...x, objetivoIds: x.objetivoIds.filter((id) => id !== obj.id) }
            : x,
        ),
    );
    if (view.kind === "objetivo" && view.id === obj.id) setViewStack([{ kind: "list" }]);
  };

  const handleDeleteIndicador = async (ind: Indicador) => {
    const vinculados = objetivos.filter((o) => ind.objetivoIds?.includes(o.id));
    const ok = await confirm(
      vinculados.length > 0
        ? `Excluir o indicador "${ind.titulo}"? Ele está sendo utilizado em ${vinculados.length} objetivo(s): ${vinculados.map((o) => o.titulo).join(", ")}.`
        : `Excluir o indicador "${ind.titulo}"?`,
    );
    if (!ok) return;
    persist(items.filter((x) => x.id !== ind.id));
    if (view.kind === "indicador" && view.id === ind.id) pop();
  };

  // --- render -------------------------------------------------------------

  if (view.kind === "objetivo") {
    const objetivo = objetivos.find((o) => o.id === view.id);
    if (!objetivo) return null;
    return (
      <>
        <ObjetivoPage
          objetivo={objetivo}
          indicadoresDoObjetivo={indicadores.filter((i) => i.objetivoIds?.includes(objetivo.id))}
          indicadoresDisponiveis={indicadores}
          members={members}
          onBack={pop}
          onOpenIndicador={(id) => push({ kind: "indicador", id, fromObjetivoId: objetivo.id })}
          onEdit={() => setObjetivoDialog({ data: objetivo })}
          onDelete={() => void handleDeleteObjetivo(objetivo)}
          onCreateIndicador={(ind) => createIndicadorForObjetivo(ind, objetivo.id)}
          onLinkIndicador={(id, cfg) => linkIndicador(objetivo.id, id, cfg)}
          onUnlinkIndicador={(id) => unlinkIndicador(objetivo.id, id)}
          onSavePesos={(pesos) => savePesos(objetivo.id, pesos)}
          onQuickUpdate={updateIndicadorPatch}
        />
        <ObjetivoQuickDialog
          open={!!objetivoDialog}
          initial={objetivoDialog?.data}
          members={members}
          onClose={() => setObjetivoDialog(null)}
          onSave={saveObjetivoBasic}
        />
        {confirmDialog}
      </>
    );
  }

  if (view.kind === "indicador") {
    const indicador = indicadores.find((i) => i.id === view.id);
    if (!indicador) return null;
    const cameFromObjetivo = view.fromObjetivoId
      ? objetivos.find((o) => o.id === view.fromObjetivoId)
      : undefined;
    const objetivosVinculados = objetivos.filter((o) => indicador.objetivoIds?.includes(o.id));
    return (
      <>
        <IndicadorPage
          indicador={indicador}
          cameFromObjetivo={cameFromObjetivo}
          objetivosVinculados={objetivosVinculados}
          allIndicadores={indicadores}
          members={members}
          onBack={pop}
          onOpenObjetivo={(id) => push({ kind: "objetivo", id })}
          onDelete={() => void handleDeleteIndicador(indicador)}
          onUpdate={updateIndicadorPatch}
          onSaveAdvanced={saveIndicadorAdvanced}
          onUnlinkObjetivo={(objetivoId) => unlinkIndicador(objetivoId, indicador.id)}
        />
        {confirmDialog}
      </>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl">
      <SectionHeader
        title="Metas"
        subtitle="Objetivos e indicadores operacionais do time."
        kpis={[
          { label: "OBJETIVOS ATIVOS", value: resumoObjetivos.ativos },
          {
            label: "SAUDÁVEIS",
            value: resumoObjetivos.saudaveis,
            tone: "text-emerald-600 dark:text-emerald-400",
            onClick: () => setSaudeFilter((s) => (s === "saudavel" ? "" : "saudavel")),
          },
          {
            label: "EM RISCO",
            value: resumoObjetivos.emRisco,
            tone: resumoObjetivos.emRisco > 0 ? "text-rose-600 dark:text-rose-400" : undefined,
            onClick: () => setSaudeFilter((s) => (s === "em_risco" ? "" : "em_risco")),
          },
          {
            label: "PROGRESSO MÉDIO",
            value:
              resumoObjetivos.progressoMedio == null ? "—" : `${resumoObjetivos.progressoMedio}%`,
          },
        ]}
        action={
          <div ref={novoMenu} className="relative">
            <button
              type="button"
              onClick={() => setNovoOpen((o) => !o)}
              className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90"
            >
              <Plus className="h-3.5 w-3.5" /> Criar
              <ChevronDown className="h-3 w-3 opacity-70" />
            </button>
            {novoOpen && (
              <div className="absolute right-0 top-full z-20 mt-1 w-64 rounded-md border border-border bg-popover p-1 shadow-md">
                <button
                  type="button"
                  onClick={() => {
                    setObjetivoDialog({});
                    setNovoOpen(false);
                  }}
                  className="flex w-full items-start gap-2 rounded px-2 py-2 text-left hover:bg-muted"
                >
                  <Target className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    <span className="block text-xs font-medium text-foreground">
                      Criar Objetivo
                    </span>
                    <span className="block text-[11px] text-muted-foreground">
                      Um resultado maior acompanhado por um ou mais indicadores.
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIndicadorCreateDialog(true);
                    setNovoOpen(false);
                  }}
                  className="flex w-full items-start gap-2 rounded px-2 py-2 text-left hover:bg-muted"
                >
                  <TrendingUp className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    <span className="block text-xs font-medium text-foreground">
                      Criar Indicador
                    </span>
                    <span className="block text-[11px] text-muted-foreground">
                      Uma métrica individual para acompanhar.
                    </span>
                  </span>
                </button>
              </div>
            )}
          </div>
        }
      />

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs sm:flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar..."
            className="h-9 w-full rounded-md border border-input bg-background pl-8 pr-2.5 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        {donosEmUso.length > 0 && (
          <select
            value={donoFilter}
            onChange={(e) => setDonoFilter(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-2 text-xs"
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
          onChange={(e) => setAreaFilter(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-2 text-xs"
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
          className="h-9 rounded-md border border-input bg-background px-2 text-xs"
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
            className="h-9 rounded-md border border-input bg-background px-2 text-xs"
          >
            <option value="">Período</option>
            {periodosEmUso.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        )}

        <div ref={filtersRef} className="relative">
          <button
            type="button"
            onClick={() => setFiltersOpen((v) => !v)}
            className={`inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-xs font-medium ${
              colaboradorFilter || tipoFilter || frequenciaFilter || origemFilter
                ? "border-foreground bg-muted text-foreground"
                : "border-border text-muted-foreground hover:bg-muted/40"
            }`}
          >
            <Filter className="h-3.5 w-3.5" /> Mais filtros
            {(colaboradorFilter || tipoFilter || frequenciaFilter || origemFilter) && (
              <span className="rounded-full bg-foreground px-1.5 text-[10px] text-background">
                •
              </span>
            )}
          </button>
          {filtersOpen && (
            <div className="absolute right-0 top-full z-20 mt-1 w-72 space-y-2 rounded-md border border-border bg-popover p-3 shadow-md">
              {colaboradoresEmUso.length > 0 && (
                <select
                  value={colaboradorFilter}
                  onChange={(e) => setColaboradorFilter(e.target.value)}
                  className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                >
                  <option value="">Todos os colaboradores</option>
                  {colaboradoresEmUso.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              )}
              <select
                value={tipoFilter}
                onChange={(e) => setTipoFilter(e.target.value as typeof tipoFilter)}
                className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
              >
                <option value="">Objetivos e indicadores</option>
                <option value="objetivo">Só objetivos</option>
                <option value="indicador">Só indicadores</option>
              </select>
              <select
                value={frequenciaFilter}
                onChange={(e) => setFrequenciaFilter(e.target.value as typeof frequenciaFilter)}
                className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
              >
                <option value="">Toda frequência</option>
                {TRACKING_FREQUENCIES.map((f) => (
                  <option key={f} value={f}>
                    {FREQUENCY_LABEL[f]}
                  </option>
                ))}
              </select>
              <select
                value={origemFilter}
                onChange={(e) => setOrigemFilter(e.target.value as typeof origemFilter)}
                className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
              >
                <option value="">Manual e automático</option>
                <option value="manual">Só manual</option>
                <option value="auto">Só automático</option>
              </select>
            </div>
          )}
        </div>

        {hasFilters && (
          <button
            type="button"
            onClick={clearFilters}
            className="inline-flex h-9 items-center gap-1 px-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" /> Limpar filtros
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <div className="mt-8 rounded-lg border border-dashed border-border p-10 text-center">
          <p className="text-sm text-muted-foreground">Nenhuma meta cadastrada ainda.</p>
          <button
            type="button"
            onClick={() => setObjetivoDialog({})}
            className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
          >
            <Plus className="h-4 w-4" /> Criar o primeiro objetivo
          </button>
        </div>
      ) : (
        <div className="mt-8 space-y-10">
          {meusObjetivos.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-foreground">Meus objetivos</h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {meusObjetivos.map((o) => (
                  <ObjetivoSummaryCard
                    key={o.id}
                    objetivo={o}
                    indicadores={indicadores.filter((i) => i.objetivoIds?.includes(o.id))}
                    members={members}
                    onOpen={() => push({ kind: "objetivo", id: o.id })}
                  />
                ))}
              </div>
            </section>
          )}

          {outrosObjetivos.length > 0 && (
            <section className="space-y-6">
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
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                      {objs.map((o) => (
                        <ObjetivoSummaryCard
                          key={o.id}
                          objetivo={o}
                          indicadores={indicadores.filter((i) => i.objetivoIds?.includes(o.id))}
                          members={members}
                          onOpen={() => push({ kind: "objetivo", id: o.id })}
                        />
                      ))}
                    </div>
                  </div>
                ))
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {outrosObjetivos.map((o) => (
                    <ObjetivoSummaryCard
                      key={o.id}
                      objetivo={o}
                      indicadores={indicadores.filter((i) => i.objetivoIds?.includes(o.id))}
                      members={members}
                      onOpen={() => push({ kind: "objetivo", id: o.id })}
                    />
                  ))}
                </div>
              )}
            </section>
          )}

          {visibleIndicadoresStandalone.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-foreground">Indicadores independentes</h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {visibleIndicadoresStandalone.map((ind) => (
                  <IndicadorRow
                    key={ind.id}
                    indicador={ind}
                    members={members}
                    onOpen={() => push({ kind: "indicador", id: ind.id })}
                    onQuickUpdate={() => setQuickUpdateTarget(ind)}
                  />
                ))}
              </div>
            </section>
          )}

          {meusObjetivos.length === 0 &&
            outrosObjetivos.length === 0 &&
            visibleIndicadoresStandalone.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Nenhum objetivo corresponde aos filtros selecionados.
              </p>
            )}
        </div>
      )}

      <ObjetivoQuickDialog
        open={!!objetivoDialog}
        initial={objetivoDialog?.data}
        members={members}
        onClose={() => setObjetivoDialog(null)}
        onSave={saveObjetivoBasic}
      />
      <IndicadorQuickCreateDialog
        open={indicadorCreateDialog}
        members={members}
        onClose={() => setIndicadorCreateDialog(false)}
        onCreate={createIndicadorStandalone}
      />
      <IndicadorQuickUpdate
        indicador={quickUpdateTarget}
        onClose={() => setQuickUpdateTarget(null)}
        onSave={(ind, patch, nota, dataISO) => {
          setQuickUpdateTarget(null);
          updateIndicadorPatch(ind, patch, nota, dataISO);
        }}
      />
      {confirmDialog}
    </div>
  );
}
