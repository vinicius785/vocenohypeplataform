import { useMemo, useState } from "react";
import { Filter, Gauge, Plus, Search } from "lucide-react";
import {
  META_AREAS,
  type Indicador,
  type MetaArea,
  type Objetivo,
  type TrackingFrequency,
} from "@/lib/metas-store";
import {
  indicadorPrioridade,
  indicadorSaudeParaObjetivo,
  indicadorStatusAtualizacao,
  type StatusAtualizacao,
} from "@/lib/metas-engine";
import { Button } from "@/components/ui/button";
import { FilterSearch } from "@/components/shared/FilterToolbar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CADENCE_LABEL, CADENCE_OPTIONS } from "./metas-ui-utils";
import { IndicadorGlobalRow } from "./IndicadorGlobalRow";
import { IndicadorQuickUpdate, type IndicadorQuickPatch } from "./IndicadorQuickUpdate";
import { NativeSelect } from "@/components/ui/native-select";

type SortKey = "prioridade" | "nome" | "atualizacao" | "impacto";
type QuickChip = "" | "precisa_atualizar" | "em_risco";

const STATUS_ATUALIZACAO_LABEL: Record<StatusAtualizacao, string> = {
  atualizado: "Atualizado",
  precisa_atualizar: "Precisa atualizar",
  muito_desatualizado: "Muito desatualizado",
};

const SORT_LABEL: Record<SortKey, string> = {
  prioridade: "Prioridade",
  nome: "Nome",
  atualizacao: "Última atualização",
  impacto: "Objetivos impactados",
};

/** Visão global de Indicadores — painel operacional pra ver/priorizar/
 * atualizar todas as métricas do negócio, já que cada uma pode
 * alimentar vários Objetivos ao mesmo tempo. Lista estruturada (não
 * grid de cards), nunca um badge de saúde único por indicador (saúde é
 * sempre por vínculo, aqui só agregada em "impacta objetivos em
 * risco"). Impacto pré-computado numa passada só sobre
 * `indicadores`/`objetivos` (já carregados por inteiro em memória —
 * sem N+1). */
export function IndicadoresView({
  indicadores,
  objetivos,
  onOpenIndicador,
  onOpenObjetivo,
  onQuickUpdate,
  onRequestCreate,
}: {
  indicadores: Indicador[];
  objetivos: Objetivo[];
  onOpenIndicador: (id: string) => void;
  onOpenObjetivo: (id: string) => void;
  onQuickUpdate: (
    ind: Indicador,
    patch: IndicadorQuickPatch,
    nota: string,
    dataISO: string,
  ) => void;
  onRequestCreate: () => void;
}) {
  const [busca, setBusca] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | StatusAtualizacao>("");
  const [cadenciaFilter, setCadenciaFilter] = useState<"" | TrackingFrequency>("");
  const [objetivoFilter, setObjetivoFilter] = useState("");
  const [areaFilter, setAreaFilter] = useState<"" | MetaArea>("");
  const [quickChip, setQuickChip] = useState<QuickChip>("");
  const [sortKey, setSortKey] = useState<SortKey>("prioridade");
  const [quickUpdateTarget, setQuickUpdateTarget] = useState<Indicador | null>(null);

  const impactoPorIndicador = useMemo(() => {
    const map = new Map<string, { objetivos: Objetivo[]; emRiscoCount: number }>();
    for (const ind of indicadores) {
      const objs = objetivos.filter((o) => ind.objetivoIds?.includes(o.id));
      let emRiscoCount = 0;
      for (const o of objs) {
        const s = indicadorSaudeParaObjetivo(ind, o.id);
        if (s === "em_risco" || s === "atrasado") emRiscoCount++;
      }
      map.set(ind.id, { objetivos: objs, emRiscoCount });
    }
    return map;
  }, [indicadores, objetivos]);

  const resumo = useMemo(() => {
    let precisamAtualizar = 0;
    let impactamEmRisco = 0;
    for (const ind of indicadores) {
      if (indicadorStatusAtualizacao(ind) !== "atualizado") precisamAtualizar++;
      if ((impactoPorIndicador.get(ind.id)?.emRiscoCount ?? 0) > 0) impactamEmRisco++;
    }
    return { total: indicadores.length, precisamAtualizar, impactamEmRisco };
  }, [indicadores, impactoPorIndicador]);

  const visiveis = useMemo(
    () =>
      indicadores.filter((ind) => {
        const impacto = impactoPorIndicador.get(ind.id);
        const status = indicadorStatusAtualizacao(ind);
        if (busca.trim() && !ind.titulo.toLowerCase().includes(busca.trim().toLowerCase())) {
          return false;
        }
        if (statusFilter && status !== statusFilter) return false;
        if (cadenciaFilter && ind.frequencia !== cadenciaFilter) return false;
        if (areaFilter && ind.area !== areaFilter) return false;
        if (objetivoFilter && !ind.objetivoIds?.includes(objetivoFilter)) return false;
        if (quickChip === "precisa_atualizar" && status === "atualizado") return false;
        if (quickChip === "em_risco" && (impacto?.emRiscoCount ?? 0) === 0) return false;
        return true;
      }),
    [
      indicadores,
      impactoPorIndicador,
      busca,
      statusFilter,
      cadenciaFilter,
      areaFilter,
      objetivoFilter,
      quickChip,
    ],
  );

  const ordenados = useMemo(() => {
    const arr = [...visiveis];
    arr.sort((a, b) => {
      if (sortKey === "nome") return a.titulo.localeCompare(b.titulo);
      if (sortKey === "atualizacao") {
        return (
          new Date(a.updatedAt ?? a.createdAt).getTime() -
          new Date(b.updatedAt ?? b.createdAt).getTime()
        );
      }
      const impA = impactoPorIndicador.get(a.id);
      const impB = impactoPorIndicador.get(b.id);
      if (sortKey === "impacto") {
        return (impB?.objetivos.length ?? 0) - (impA?.objetivos.length ?? 0);
      }
      const pa = indicadorPrioridade(
        indicadorStatusAtualizacao(a),
        impA?.objetivos.length ?? 0,
        impA?.emRiscoCount ?? 0,
      );
      const pb = indicadorPrioridade(
        indicadorStatusAtualizacao(b),
        impB?.objetivos.length ?? 0,
        impB?.emRiscoCount ?? 0,
      );
      return pb - pa;
    });
    return arr;
  }, [visiveis, sortKey, impactoPorIndicador]);

  const hasFilters = !!(statusFilter || cadenciaFilter || areaFilter || objetivoFilter);
  const filterCount = [statusFilter, cadenciaFilter, areaFilter, objetivoFilter].filter(
    Boolean,
  ).length;
  const clearFilters = () => {
    setStatusFilter("");
    setCadenciaFilter("");
    setAreaFilter("");
    setObjetivoFilter("");
  };

  return (
    <div className="space-y-6">
      {/* Toolbar única — busca + filtros + ordenação, sincronizados. */}
      <div className="flex flex-wrap items-center gap-2">
        <FilterSearch value={busca} onChange={setBusca} placeholder="Buscar indicador..." />
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={`inline-flex h-9 items-center gap-1.5 rounded-md border border-input px-3 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                hasFilters ? "text-foreground" : "text-text-secondary hover:text-foreground"
              }`}
            >
              <Filter className="h-3.5 w-3.5" />{" "}
              {hasFilters ? `Filtros · ${filterCount}` : "Filtros"}
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72 space-y-2 p-3">
            <NativeSelect
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <option value="">Status de atualização</option>
              {(Object.keys(STATUS_ATUALIZACAO_LABEL) as StatusAtualizacao[]).map((s) => (
                <option key={s} value={s}>
                  {STATUS_ATUALIZACAO_LABEL[s]}
                </option>
              ))}
            </NativeSelect>
            <NativeSelect
              value={cadenciaFilter}
              onChange={(e) => setCadenciaFilter(e.target.value as typeof cadenciaFilter)}
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <option value="">Toda cadência</option>
              {CADENCE_OPTIONS.map((f) => (
                <option key={f} value={f}>
                  {CADENCE_LABEL[f]}
                </option>
              ))}
            </NativeSelect>
            <NativeSelect
              value={areaFilter}
              onChange={(e) => setAreaFilter(e.target.value as typeof areaFilter)}
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <option value="">Toda área</option>
              {META_AREAS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </NativeSelect>
            {objetivos.length > 0 && (
              <NativeSelect
                value={objetivoFilter}
                onChange={(e) => setObjetivoFilter(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                <option value="">Todo objetivo</option>
                {objetivos.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.titulo}
                  </option>
                ))}
              </NativeSelect>
            )}
          </PopoverContent>
        </Popover>
        <NativeSelect
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as SortKey)}
          aria-label="Ordenar por"
          className="h-9 rounded-md border border-input bg-background px-2 text-xs text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
            <option key={k} value={k}>
              Ordenar: {SORT_LABEL[k]}
            </option>
          ))}
        </NativeSelect>
        {hasFilters && (
          <button
            type="button"
            onClick={clearFilters}
            className="inline-flex h-9 items-center gap-1 rounded px-1 text-xs text-text-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            Limpar filtros
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {(
          [
            ["", `Todos ${indicadores.length}`],
            ["precisa_atualizar", `Precisam atualizar ${resumo.precisamAtualizar}`],
            ["em_risco", `Impactam objetivos em risco ${resumo.impactamEmRisco}`],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key || "todos"}
            type="button"
            onClick={() => setQuickChip(key)}
            className={`rounded-full px-2.5 py-1 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
              quickChip === key
                ? "bg-muted text-foreground"
                : "text-text-secondary hover:bg-muted/60"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {indicadores.length === 0 ? (
        <div className="surface-card p-10 text-center">
          <Gauge className="mx-auto h-8 w-8 text-text-secondary/50" />
          <p className="mt-3 text-sm font-medium text-foreground">Nenhum indicador cadastrado</p>
          <p className="mt-1 text-sm text-text-secondary">
            Crie o primeiro indicador pra começar a acompanhar uma métrica.
          </p>
          <Button variant="primary" size="comfortable" className="mt-5" onClick={onRequestCreate}>
            <Plus className="h-4 w-4" /> Novo indicador
          </Button>
        </div>
      ) : ordenados.length === 0 ? (
        <div className="surface-card p-10 text-center">
          <Search className="mx-auto h-8 w-8 text-text-secondary/50" />
          <p className="mt-3 text-sm font-medium text-foreground">Nenhum indicador encontrado</p>
          <p className="mt-1 text-sm text-text-secondary">
            Ajuste a busca, os filtros ou o chip selecionado.
          </p>
        </div>
      ) : (
        <div className="surface-card p-5">
          <div className="hidden grid-cols-[1fr_5.5rem_6rem_6rem_9rem_2rem] gap-3 px-1 pb-2 text-[11px] font-semibold uppercase tracking-wide text-text-secondary sm:grid">
            <span>Indicador</span>
            <span className="text-right">Valor atual</span>
            <span className="text-right">Atualização</span>
            <span className="text-center">Saúde</span>
            <span>Objetivos vinculados</span>
            <span className="sr-only">Ações</span>
          </div>
          <div className="divide-y divide-border/60">
            {ordenados.map((ind) => (
              <IndicadorGlobalRow
                key={ind.id}
                indicador={ind}
                objetivosVinculados={impactoPorIndicador.get(ind.id)?.objetivos ?? []}
                status={indicadorStatusAtualizacao(ind)}
                onOpen={() => onOpenIndicador(ind.id)}
                onQuickUpdate={() => setQuickUpdateTarget(ind)}
                onOpenObjetivo={onOpenObjetivo}
              />
            ))}
          </div>
        </div>
      )}

      <IndicadorQuickUpdate
        indicador={quickUpdateTarget}
        objetivosVinculados={
          quickUpdateTarget ? (impactoPorIndicador.get(quickUpdateTarget.id)?.objetivos ?? []) : []
        }
        onClose={() => setQuickUpdateTarget(null)}
        onSave={(ind, patch, nota, dataISO) => {
          setQuickUpdateTarget(null);
          onQuickUpdate(ind, patch, nota, dataISO);
        }}
      />
    </div>
  );
}
