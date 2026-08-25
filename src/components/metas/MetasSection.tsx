import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, X, ChevronDown, Target, TrendingUp } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
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
  type MetaArea,
  type TrackingFrequency,
} from "@/lib/metas-store";
import { indicadorSaude, type IndicadorSaude, INDICADOR_SAUDE_LABEL } from "@/lib/metas-engine";
import { MetaCard } from "./MetaCard";
import { ObjetivoDialog } from "./ObjetivoDialog";
import { IndicadorDialog } from "./IndicadorDialog";
import { colorFor, initialsOf } from "./metas-ui-utils";

const FREQUENCY_LABEL: Record<TrackingFrequency, string> = {
  continuo: "Contínuo",
  semanal: "Semanal",
  mensal: "Mensal",
  trimestral: "Trimestral",
  personalizado: "Personalizado",
};

/** Menu suspenso simples fecha ao clicar fora — mesmo padrão já usado em
 * `InfluencerBoard.tsx` (`useDropdown`). */
function useDropdown() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);
  return { open, setOpen, ref };
}

export function MetasSection() {
  const [items, setItems] = useState<MetaItem[]>(() => loadMetas());
  const me = getMe();
  const members = useMemo(() => loadTeamMembers(), []);

  const [areaFilter, setAreaFilter] = useState("");
  const [donoFilter, setDonoFilter] = useState("");
  const [colaboradorFilter, setColaboradorFilter] = useState("");
  const [tipoFilter, setTipoFilter] = useState<"" | "objetivo" | "indicador">("");
  const [saudeFilter, setSaudeFilter] = useState<"" | IndicadorSaude>("");
  const [frequenciaFilter, setFrequenciaFilter] = useState<"" | TrackingFrequency>("");
  const [origemFilter, setOrigemFilter] = useState<"" | "manual" | "auto">("");
  const [busca, setBusca] = useState("");

  const [objetivoDialog, setObjetivoDialog] = useState<{ data?: Objetivo } | null>(null);
  const [indicadorDialog, setIndicadorDialog] = useState<{ data?: Indicador } | null>(null);
  const [updateDialog, setUpdateDialog] = useState<Indicador | null>(null);
  const novoMenu = useDropdown();
  const { confirm, confirmDialog } = useConfirm();

  const persist = (next: MetaItem[]) => {
    setItems(next);
    saveMetas(next);
  };
  useEffect(() => onMetasChange(() => setItems(loadMetas())), []);

  const objetivos = useMemo(
    () => items.filter((m): m is Objetivo => m.kind === "objetivo"),
    [items],
  );
  const indicadores = useMemo(
    () => items.filter((m): m is Indicador => m.kind === "indicador"),
    [items],
  );
  const indicadoresStandalone = useMemo(
    () => indicadores.filter((i) => !i.objetivoId),
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

  // Visão geral: soma de saúde de TODO indicador (dentro de objetivo ou
  // standalone) — é isso que representa "o estado real da operação",
  // não só a contagem de objetivos.
  const overview = useMemo(() => {
    let saudaveis = 0,
      atencao = 0,
      emRisco = 0,
      concluidos = 0;
    for (const ind of indicadores) {
      const s = indicadorSaude(ind);
      if (s === "saudavel") saudaveis++;
      else if (s === "atencao") atencao++;
      else if (s === "em_risco" || s === "atrasado") emRisco++;
      else if (s === "concluido") concluidos++;
    }
    return { objetivos: objetivos.length, saudaveis, atencao, emRisco, concluidos };
  }, [indicadores, objetivos.length]);

  const matchesFilters = (m: MetaItem): boolean => {
    if (areaFilter && m.area !== areaFilter) return false;
    if (donoFilter && m.dono !== donoFilter) return false;
    if (colaboradorFilter && !(m.colaboradores ?? []).includes(colaboradorFilter)) return false;
    if (tipoFilter && m.kind !== tipoFilter) return false;
    if (frequenciaFilter && m.frequencia !== frequenciaFilter) return false;
    if (origemFilter && (m.kind !== "indicador" || m.dataSource !== origemFilter)) return false;
    if (saudeFilter) {
      const saude = m.kind === "indicador" ? indicadorSaude(m) : undefined;
      // Pra objetivo, o filtro de saúde não se aplica diretamente (a
      // saúde é resumida no card a partir dos indicadores dele) — só
      // filtra indicadores por esse critério.
      if (m.kind === "indicador" && saude !== saudeFilter) return false;
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
    busca;
  const clearFilters = () => {
    setAreaFilter("");
    setDonoFilter("");
    setColaboradorFilter("");
    setTipoFilter("");
    setSaudeFilter("");
    setFrequenciaFilter("");
    setOrigemFilter("");
    setBusca("");
  };

  // "Cards visíveis": objetivos + indicadores standalone que passam nos
  // filtros — indicador vinculado a um objetivo aparece dentro do card
  // do objetivo, não como card próprio (evita duplicar a mesma métrica
  // duas vezes na tela).
  const visibleCards = useMemo(
    () => [...objetivos, ...indicadoresStandalone].filter(matchesFilters),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      objetivos,
      indicadoresStandalone,
      areaFilter,
      donoFilter,
      colaboradorFilter,
      tipoFilter,
      saudeFilter,
      frequenciaFilter,
      origemFilter,
      busca,
    ],
  );

  const minhasMetas = visibleCards.filter((m) => m.dono === me.name);
  const outrasMetas = visibleCards.filter((m) => m.dono !== me.name);
  const porDono = useMemo(() => {
    const map = new Map<string, MetaItem[]>();
    for (const m of outrasMetas) {
      const key = m.dono || "Sem dono";
      map.set(key, [...(map.get(key) ?? []), m]);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [outrasMetas]);

  const renderCard = (item: MetaItem) => (
    <MetaCard
      key={item.id}
      item={item}
      indicadoresDoObjetivo={
        item.kind === "objetivo" ? indicadores.filter((i) => i.objetivoId === item.id) : []
      }
      members={members}
      onEdit={(m) =>
        m.kind === "objetivo" ? setObjetivoDialog({ data: m }) : setIndicadorDialog({ data: m })
      }
      onDelete={(m) => void handleDelete(m)}
      onQuickUpdate={(ind) => setUpdateDialog(ind)}
      onToggleBinario={(ind) => toggleBinario(ind)}
      onOpenChild={(ind) => setIndicadorDialog({ data: ind })}
    />
  );

  const handleDelete = async (m: MetaItem) => {
    if (m.kind === "objetivo") {
      const filhos = indicadores.filter((i) => i.objetivoId === m.id);
      const ok = await confirm(
        filhos.length > 0
          ? `Excluir o objetivo "${m.titulo}"? Os ${filhos.length} indicador(es) vinculados continuam existindo, só deixam de fazer parte deste objetivo.`
          : `Excluir o objetivo "${m.titulo}"?`,
      );
      if (!ok) return;
      persist(
        items
          .filter((x) => x.id !== m.id)
          .map((x) =>
            x.kind === "indicador" && x.objetivoId === m.id ? { ...x, objetivoId: undefined } : x,
          ),
      );
    } else {
      const ok = await confirm(`Excluir o indicador "${m.titulo}"?`);
      if (!ok) return;
      persist(items.filter((x) => x.id !== m.id));
    }
  };

  const saveObjetivo = (objetivo: Objetivo, linkedIndicadores: Indicador[]) => {
    const linkedIds = new Set(linkedIndicadores.map((i) => i.id));
    const next = items
      .filter((x) => x.id !== objetivo.id)
      .map((x) =>
        x.kind === "indicador" && x.objetivoId === objetivo.id && !linkedIds.has(x.id)
          ? { ...x, objetivoId: undefined } // desvinculado nesta edição
          : x,
      )
      .filter((x) => !linkedIndicadores.some((i) => i.id === x.id));
    persist([...next, objetivo, ...linkedIndicadores]);
    setObjetivoDialog(null);
  };

  const saveIndicador = (ind: Indicador) => {
    const exists = items.some((x) => x.id === ind.id);
    persist(exists ? items.map((x) => (x.id === ind.id ? ind : x)) : [...items, ind]);
    setIndicadorDialog(null);
  };

  const toggleBinario = (ind: Indicador) => {
    const nextConcluido = !ind.concluido;
    const entry = {
      id: crypto.randomUUID(),
      author: me.name,
      initials: initialsOf(me.name) || "?",
      color: colorFor(me.name),
      nota: nextConcluido ? "Marcou como concluído" : "Reabriu o indicador",
      createdAt: new Date().toISOString(),
    };
    persist(
      items.map((x) =>
        x.id === ind.id && x.kind === "indicador"
          ? {
              ...x,
              concluido: nextConcluido,
              updatedAt: entry.createdAt,
              atualizacoes: [...(x.atualizacoes ?? []), entry],
            }
          : x,
      ),
    );
  };

  const logUpdate = (ind: Indicador, valor: number | undefined, nota: string) => {
    const entry = {
      id: crypto.randomUUID(),
      valor,
      nota: nota.trim() || undefined,
      author: me.name,
      initials: initialsOf(me.name) || "?",
      color: colorFor(me.name),
      createdAt: new Date().toISOString(),
    };
    persist(
      items.map((x) =>
        x.id === ind.id && x.kind === "indicador"
          ? {
              ...x,
              valorAtual: valor ?? x.valorAtual,
              updatedAt: entry.createdAt,
              atualizacoes: [...(x.atualizacoes ?? []), entry],
            }
          : x,
      ),
    );
    setUpdateDialog(null);
  };

  return (
    <div className="mx-auto w-full max-w-6xl">
      <SectionHeader
        title="Metas"
        subtitle="Objetivos e indicadores operacionais do time."
        kpis={[
          { label: "OBJETIVOS", value: overview.objetivos },
          {
            label: "SAUDÁVEIS",
            value: overview.saudaveis,
            tone: "text-emerald-600 dark:text-emerald-400",
          },
          { label: "ATENÇÃO", value: overview.atencao, tone: "text-amber-600 dark:text-amber-400" },
          {
            label: "EM RISCO",
            value: overview.emRisco,
            tone: overview.emRisco > 0 ? "text-rose-600 dark:text-rose-400" : undefined,
          },
          { label: "CONCLUÍDOS", value: overview.concluidos },
        ]}
        action={
          <div ref={novoMenu.ref} className="relative">
            <button
              type="button"
              onClick={() => novoMenu.setOpen((o) => !o)}
              className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90"
            >
              <Plus className="h-3.5 w-3.5" /> Nova meta
              <ChevronDown className="h-3 w-3 opacity-70" />
            </button>
            {novoMenu.open && (
              <div className="absolute right-0 top-full z-20 mt-1 w-52 rounded-md border border-border bg-popover p-1 shadow-md">
                <button
                  type="button"
                  onClick={() => {
                    setObjetivoDialog({});
                    novoMenu.setOpen(false);
                  }}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs font-medium text-foreground hover:bg-muted"
                >
                  <Target className="h-3.5 w-3.5" /> Criar Objetivo
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIndicadorDialog({});
                    novoMenu.setOpen(false);
                  }}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs font-medium text-foreground hover:bg-muted"
                >
                  <TrendingUp className="h-3.5 w-3.5" /> Criar Indicador
                </button>
              </div>
            )}
          </div>
        }
      />

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por título..."
          className="h-9 w-48 rounded-md border border-input bg-background px-2.5 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <select
          value={areaFilter}
          onChange={(e) => setAreaFilter(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-2.5 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="">Todas as áreas</option>
          {META_AREAS.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        {donosEmUso.length > 0 && (
          <select
            value={donoFilter}
            onChange={(e) => setDonoFilter(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-2.5 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">Todos os donos</option>
            {donosEmUso.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        )}
        {colaboradoresEmUso.length > 0 && (
          <select
            value={colaboradorFilter}
            onChange={(e) => setColaboradorFilter(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-2.5 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
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
          className="h-9 rounded-md border border-input bg-background px-2.5 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="">Objetivos e indicadores</option>
          <option value="objetivo">Só objetivos</option>
          <option value="indicador">Só indicadores</option>
        </select>
        <select
          value={saudeFilter}
          onChange={(e) => setSaudeFilter(e.target.value as typeof saudeFilter)}
          className="h-9 rounded-md border border-input bg-background px-2.5 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="">Toda saúde</option>
          {(Object.keys(INDICADOR_SAUDE_LABEL) as IndicadorSaude[]).map((s) => (
            <option key={s} value={s}>
              {INDICADOR_SAUDE_LABEL[s]}
            </option>
          ))}
        </select>
        <select
          value={frequenciaFilter}
          onChange={(e) => setFrequenciaFilter(e.target.value as typeof frequenciaFilter)}
          className="h-9 rounded-md border border-input bg-background px-2.5 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
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
          className="h-9 rounded-md border border-input bg-background px-2.5 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="">Manual e automático</option>
          <option value="manual">Só manual</option>
          <option value="auto">Só automático</option>
        </select>
        {hasFilters && (
          <button
            type="button"
            onClick={clearFilters}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" /> Limpar filtros
          </button>
        )}
      </div>

      {visibleCards.length === 0 ? (
        <div className="mt-8 rounded-lg border border-dashed border-border p-10 text-center">
          <p className="text-sm text-muted-foreground">
            {items.length === 0
              ? "Nenhuma meta cadastrada ainda."
              : "Nenhum resultado pra esse filtro."}
          </p>
          {items.length === 0 && (
            <button
              type="button"
              onClick={() => setObjetivoDialog({})}
              className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
            >
              <Plus className="h-4 w-4" /> Criar o primeiro objetivo
            </button>
          )}
        </div>
      ) : (
        <div className="mt-8 space-y-10">
          {minhasMetas.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-foreground">Minhas metas</h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {minhasMetas.map(renderCard)}
              </div>
            </section>
          )}

          {porDono.length > 0 && (
            <section className="space-y-6">
              <h2 className="text-sm font-semibold text-foreground">Metas do time</h2>
              {porDono.map(([dono, metas]) => (
                <div key={dono} className="space-y-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {dono}
                  </h3>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {metas.map(renderCard)}
                  </div>
                </div>
              ))}
            </section>
          )}
        </div>
      )}

      <ObjetivoDialog
        open={!!objetivoDialog}
        initial={objetivoDialog?.data}
        indicadoresDoObjetivo={
          objetivoDialog?.data
            ? indicadores.filter((i) => i.objetivoId === objetivoDialog.data!.id)
            : []
        }
        indicadoresDisponiveis={indicadoresStandalone}
        members={members}
        onClose={() => setObjetivoDialog(null)}
        onSave={saveObjetivo}
        onDelete={
          objetivoDialog?.data
            ? () => {
                void handleDelete(objetivoDialog.data!);
                setObjetivoDialog(null);
              }
            : undefined
        }
      />
      <IndicadorDialog
        open={!!indicadorDialog}
        initial={indicadorDialog?.data}
        members={members}
        onClose={() => setIndicadorDialog(null)}
        onSave={saveIndicador}
        onDelete={
          indicadorDialog?.data
            ? () => {
                void handleDelete(indicadorDialog.data!);
                setIndicadorDialog(null);
              }
            : undefined
        }
      />
      <UpdateProgressDialog
        indicador={updateDialog}
        onClose={() => setUpdateDialog(null)}
        onSave={logUpdate}
      />
      {confirmDialog}
    </div>
  );
}

function UpdateProgressDialog({
  indicador,
  onClose,
  onSave,
}: {
  indicador: Indicador | null;
  onClose: () => void;
  onSave: (ind: Indicador, valor: number | undefined, nota: string) => void;
}) {
  const [valor, setValor] = useState("");
  const [nota, setNota] = useState("");

  useEffect(() => {
    if (indicador) {
      setValor(indicador.valorAtual != null ? String(indicador.valorAtual) : "");
      setNota("");
    }
  }, [indicador]);

  if (!indicador) return null;

  return (
    <Dialog open={!!indicador} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogTitle className="flex items-center gap-2 text-base font-semibold">
          <Target className="h-4 w-4" /> Atualizar indicador
        </DialogTitle>
        <DialogDescription className="text-xs text-muted-foreground">
          {indicador.titulo}
        </DialogDescription>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-muted-foreground">
              Valor atual{indicador.unidade ? ` (${indicador.unidade})` : ""}
            </label>
            <input
              type="number"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              autoFocus
              className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground">
              Nota (opcional)
            </label>
            <input
              type="text"
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              placeholder="O que mudou desde a última atualização?"
              className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        </div>

        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => onSave(indicador, valor ? Number(valor) : undefined, nota)}
            className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90"
          >
            Salvar
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
