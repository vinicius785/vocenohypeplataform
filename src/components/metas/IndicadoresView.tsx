import { useMemo, useRef, useState } from "react";
import { Filter, Plus, Search } from "lucide-react";
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
import { CADENCE_LABEL, CADENCE_OPTIONS } from "./metas-ui-utils";
import { IndicadorGlobalRow } from "./IndicadorGlobalRow";
import { IndicadorQuickCreateDialog } from "./IndicadorQuickCreateDialog";
import { IndicadorQuickUpdate, type IndicadorQuickPatch } from "./IndicadorQuickUpdate";
import { useDropdown } from "./use-dropdown";

type Member = { name: string; photo?: string };
type SortKey = "prioridade" | "nome" | "atualizacao" | "impacto";
type QuickChip = "" | "precisa_atualizar" | "em_risco";

const STATUS_ATUALIZACAO_LABEL: Record<StatusAtualizacao, string> = {
  atualizado: "Atualizado",
  precisa_atualizar: "Precisa atualizar",
  muito_desatualizado: "Muito desatualizado",
};

/** Visão global de Indicadores — painel operacional pra ver/priorizar/
 * atualizar todas as métricas do negócio, já que cada uma pode
 * alimentar vários Objetivos ao mesmo tempo. Lista densa (não grid de
 * cards, item 37), nunca um badge de saúde único por indicador (item
 * 38 — saúde é sempre por vínculo, aqui só agregada). Impacto
 * pré-computado numa passada só sobre `indicadores`/`objetivos` (já
 * carregados por inteiro em memória — sem N+1, item 51). */
export function IndicadoresView({
  indicadores,
  objetivos,
  members,
  onOpenIndicador,
  onOpenObjetivo,
  onQuickUpdate,
  onCreate,
}: {
  indicadores: Indicador[];
  objetivos: Objetivo[];
  members: Member[];
  onOpenIndicador: (id: string) => void;
  onOpenObjetivo: (id: string) => void;
  onQuickUpdate: (
    ind: Indicador,
    patch: IndicadorQuickPatch,
    nota: string,
    dataISO: string,
  ) => void;
  onCreate: (ind: Indicador) => void;
}) {
  const [busca, setBusca] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | StatusAtualizacao>("");
  const [cadenciaFilter, setCadenciaFilter] = useState<"" | TrackingFrequency>("");
  const [objetivoFilter, setObjetivoFilter] = useState("");
  const [areaFilter, setAreaFilter] = useState<"" | MetaArea>("");
  const [quickChip, setQuickChip] = useState<QuickChip>("");
  const [sortKey, setSortKey] = useState<SortKey>("prioridade");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [quickUpdateTarget, setQuickUpdateTarget] = useState<Indicador | null>(null);
  const filtersRef = useRef<HTMLDivElement>(null);
  useDropdown(filtersRef, filtersOpen, () => setFiltersOpen(false));

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
    <div>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {resumo.total} indicador{resumo.total === 1 ? "" : "es"}
          {resumo.precisamAtualizar > 0 && (
            <>
              {" · "}
              <span className="font-medium text-amber-600 dark:text-amber-400">
                {resumo.precisamAtualizar} precisa{resumo.precisamAtualizar === 1 ? "" : "m"}{" "}
                atualizar
              </span>
            </>
          )}
          {resumo.impactamEmRisco > 0 && (
            <>
              {" · "}
              <span className="font-medium text-rose-600 dark:text-rose-400">
                {resumo.impactamEmRisco} impacta{resumo.impactamEmRisco === 1 ? "" : "m"} objetivos
                em risco
              </span>
            </>
          )}
        </p>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-2.5 py-1.5 text-xs font-medium text-background hover:opacity-90"
        >
          <Plus className="h-3.5 w-3.5" /> Novo indicador
        </button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs sm:flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar indicador..."
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
            <Filter className="h-3.5 w-3.5" /> {hasFilters ? `Filtros · ${filterCount}` : "Filtros"}
          </button>
          {filtersOpen && (
            <div className="absolute right-0 top-full z-20 mt-1 w-72 space-y-2 rounded-md border border-border bg-popover p-3 shadow-md">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
                className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
              >
                <option value="">Status de atualização</option>
                {(Object.keys(STATUS_ATUALIZACAO_LABEL) as StatusAtualizacao[]).map((s) => (
                  <option key={s} value={s}>
                    {STATUS_ATUALIZACAO_LABEL[s]}
                  </option>
                ))}
              </select>
              <select
                value={cadenciaFilter}
                onChange={(e) => setCadenciaFilter(e.target.value as typeof cadenciaFilter)}
                className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
              >
                <option value="">Toda cadência</option>
                {CADENCE_OPTIONS.map((f) => (
                  <option key={f} value={f}>
                    {CADENCE_LABEL[f]}
                  </option>
                ))}
              </select>
              <select
                value={areaFilter}
                onChange={(e) => setAreaFilter(e.target.value as typeof areaFilter)}
                className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
              >
                <option value="">Toda área</option>
                {META_AREAS.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
              {objetivos.length > 0 && (
                <select
                  value={objetivoFilter}
                  onChange={(e) => setObjetivoFilter(e.target.value)}
                  className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                >
                  <option value="">Todo objetivo</option>
                  {objetivos.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.titulo}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}
        </div>
        <select
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as SortKey)}
          className="h-9 rounded-md border border-input bg-background px-2 text-xs"
        >
          <option value="prioridade">Ordenar: Prioridade</option>
          <option value="nome">Ordenar: Nome</option>
          <option value="atualizacao">Ordenar: Última atualização</option>
          <option value="impacto">Ordenar: Objetivos impactados</option>
        </select>
        {hasFilters && (
          <button
            type="button"
            onClick={clearFilters}
            className="inline-flex h-9 items-center gap-1 px-1 text-xs text-muted-foreground hover:text-foreground"
          >
            Limpar filtros
          </button>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1">
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
            className={`rounded-full px-2.5 py-1 text-xs font-medium ${
              quickChip === key
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:bg-muted/60"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {indicadores.length === 0 ? (
        <div className="mt-4 rounded-lg border border-dashed border-border p-10 text-center">
          <p className="text-sm text-muted-foreground">Nenhum indicador cadastrado ainda.</p>
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
          >
            <Plus className="h-4 w-4" /> Criar o primeiro indicador
          </button>
        </div>
      ) : ordenados.length === 0 ? (
        <p className="mt-6 text-center text-sm text-muted-foreground">
          Nenhum indicador encontrado.
        </p>
      ) : (
        <div className="mt-3">
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
      )}

      <IndicadorQuickCreateDialog
        open={createOpen}
        members={members}
        onClose={() => setCreateOpen(false)}
        onCreate={(ind) => {
          setCreateOpen(false);
          onCreate(ind);
        }}
      />
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
