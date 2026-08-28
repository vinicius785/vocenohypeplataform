import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { ChevronDown, Plus, Target, TrendingUp } from "lucide-react";
import { SectionHeader, type SectionTab } from "../SectionHeader";
import { useConfirm } from "@/hooks/use-confirm";
import { getMe } from "@/lib/chat-store";
import { loadTeamMembers } from "@/lib/projetos";
import {
  loadMetas,
  saveMetas,
  onMetasChange,
  type MetaItem,
  type Objetivo,
  type Indicador,
  type ComparisonOperator,
} from "@/lib/metas-store";
import { direcaoParaComparadorPadrao } from "@/lib/metas-engine";
import { ObjetivosView } from "./ObjetivosView";
import { IndicadoresView } from "./IndicadoresView";
import { ObjetivoPage } from "./ObjetivoPage";
import { IndicadorPage } from "./IndicadorPage";
import { ObjetivoQuickDialog } from "./ObjetivoQuickDialog";
import { IndicadorQuickCreateDialog } from "./IndicadorQuickCreateDialog";
import { type IndicadorQuickPatch } from "./IndicadorQuickUpdate";
import { colorFor, initialsOf } from "./metas-ui-utils";
import { useDropdown } from "./use-dropdown";

type MetasView =
  | { kind: "list" }
  | { kind: "objetivo"; id: string }
  // `fromObjetivoId` só serve pra rotular o botão "voltar" — a lista
  // completa de objetivos que o indicador alimenta aparece na própria
  // página dele (`IndicadorPage`), já que agora pode estar em vários.
  | { kind: "indicador"; id: string; fromObjetivoId?: string };

/** Orquestrador da funcionalidade Metas: dono de `items`/mutações/
 * navegação — os dois modos (Objetivos/Indicadores) e as duas páginas
 * de detalhe são "burros", só reapresentam o que já é computado aqui.
 * A aba ativa (Objetivos/Indicadores) mora na URL (`?metasView=`), não
 * em `useState` — permite deep-link/refresh sem perder o estado, mesmo
 * mecanismo já usado pra `?section=` em `time.tsx`. */
export function MetasSection() {
  const [items, setItems] = useState<MetaItem[]>(() => loadMetas());
  const me = getMe();
  const members = useMemo(() => loadTeamMembers(), []);

  const search = useSearch({ from: "/_authenticated/time" });
  const navigate = useNavigate();
  const metasView = search.metasView ?? "objetivos";
  const setMetasView = (v: "objetivos" | "indicadores") =>
    void navigate({ to: "/time", search: (prev) => ({ ...prev, metasView: v }), replace: true });

  const [viewStack, setViewStack] = useState<MetasView[]>([{ kind: "list" }]);
  const view = viewStack[viewStack.length - 1];
  const push = (v: MetasView) => setViewStack((s) => [...s, v]);
  const pop = () => setViewStack((s) => (s.length > 1 ? s.slice(0, -1) : s));

  const [objetivoDialog, setObjetivoDialog] = useState<{ data?: Objetivo } | null>(null);
  const [indicadorCreateDialog, setIndicadorCreateDialog] = useState(false);
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
  // diálogo "Vincular ao objetivo" — sem `cfg`, o vínculo nasce sem
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
          allObjetivos={objetivos}
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

  const tabs: SectionTab[] = [
    {
      key: "objetivos",
      label: "Objetivos",
      active: metasView === "objetivos",
      onClick: () => setMetasView("objetivos"),
    },
    {
      key: "indicadores",
      label: "Indicadores",
      active: metasView === "indicadores",
      onClick: () => setMetasView("indicadores"),
    },
  ];

  return (
    <div className="mx-auto w-full max-w-6xl">
      <SectionHeader
        title="Metas"
        subtitle={
          metasView === "indicadores"
            ? "Acompanhe e atualize as principais métricas do negócio."
            : "Objetivos e indicadores operacionais do time."
        }
        tabs={tabs}
        action={
          metasView === "indicadores" ? undefined : (
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
          )
        }
      />

      {metasView === "indicadores" ? (
        <IndicadoresView
          indicadores={indicadores}
          objetivos={objetivos}
          members={members}
          onOpenIndicador={(id) => push({ kind: "indicador", id })}
          onOpenObjetivo={(id) => push({ kind: "objetivo", id })}
          onQuickUpdate={updateIndicadorPatch}
          onCreate={createIndicadorStandalone}
        />
      ) : (
        <ObjetivosView
          objetivos={objetivos}
          indicadores={indicadores}
          members={members}
          meName={me.name}
          onOpenObjetivo={(id) => push({ kind: "objetivo", id })}
        />
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
      {confirmDialog}
    </div>
  );
}
