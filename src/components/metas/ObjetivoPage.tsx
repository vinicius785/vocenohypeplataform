import { useMemo, useRef, useState } from "react";
import { ArrowLeft, MoreHorizontal, Percent, Plus, Trash2 } from "lucide-react";
import type { ComparisonOperator, Indicador, Objetivo } from "@/lib/metas-store";
import {
  INDICADOR_SAUDE_BAR,
  indicadorSaudeParaObjetivo,
  objetivoProgresso,
  objetivoResumoSaude,
  objetivoStats,
  progressoEsperado,
} from "@/lib/metas-engine";
import { fmtPeriodo } from "./metas-ui-utils";
import { Avatar } from "./Avatar";
import { ExpectedProgressLine } from "./ExpectedProgressLine";
import { ObjetivoIndicadorRow } from "./ObjetivoIndicadorRow";
import { VincularIndicadorDialog } from "./VincularIndicadorDialog";
import { IndicadorQuickCreateDialog } from "./IndicadorQuickCreateDialog";
import { IndicadorQuickUpdate, type IndicadorQuickPatch } from "./IndicadorQuickUpdate";
import { AjustarPesosDialog } from "./AjustarPesosDialog";
import { useDropdown } from "./use-dropdown";

type Member = { name: string; photo?: string };

type IndicadorFiltro = "todos" | "em_risco" | "saudaveis";

/** Página de gestão de um Objetivo — visão geral (progresso/saúde) +
 * lista de indicadores + ações de adicionar/vincular/pesos/editar/excluir.
 * Nada disso acontece em modal solto: é o "ambiente" do objetivo. */
export function ObjetivoPage({
  objetivo,
  indicadoresDoObjetivo,
  indicadoresDisponiveis,
  allObjetivos,
  members,
  onBack,
  onOpenIndicador,
  onEdit,
  onDelete,
  onCreateIndicador,
  onLinkIndicador,
  onUnlinkIndicador,
  onSavePesos,
  onQuickUpdate,
}: {
  objetivo: Objetivo;
  indicadoresDoObjetivo: Indicador[];
  /** TODOS os indicadores (não só os sem objetivo) — indicador é
   * universal, então pode ser vinculado aqui mesmo já estando em outro
   * objetivo. `linkable` abaixo só desconta quem já está NESTE. */
  indicadoresDisponiveis: Indicador[];
  /** Todos os objetivos do app — só pra resolver a lista de "esta
   * atualização impactará N objetivos" no modal de atualização rápida
   * (o indicador pode estar em outros objetivos além deste). */
  allObjetivos: Objetivo[];
  members: Member[];
  onBack: () => void;
  onOpenIndicador: (id: string) => void;
  onEdit: () => void;
  onDelete: () => void;
  onCreateIndicador: (ind: Indicador) => void;
  onLinkIndicador: (
    id: string,
    cfg?: { peso?: number; meta?: number; comparador?: ComparisonOperator },
  ) => void;
  onUnlinkIndicador: (id: string) => void;
  onSavePesos: (pesos: Record<string, number>) => void;
  onQuickUpdate: (
    ind: Indicador,
    patch: IndicadorQuickPatch,
    nota: string,
    dataISO: string,
  ) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [vincularOpen, setVincularOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [pesosOpen, setPesosOpen] = useState(false);
  const [quickUpdateTarget, setQuickUpdateTarget] = useState<Indicador | null>(null);
  const [filtro, setFiltro] = useState<IndicadorFiltro>("todos");
  const menuRef = useRef<HTMLDivElement>(null);
  useDropdown(menuRef, menuOpen, () => setMenuOpen(false));

  const progresso = objetivoProgresso(objetivo.id, indicadoresDoObjetivo);
  const stats = objetivoStats(objetivo.id, indicadoresDoObjetivo);
  const resumoSaude = objetivoResumoSaude(objetivo, stats);
  const esperado = progressoEsperado(objetivo);
  const periodo = fmtPeriodo(objetivo.dataInicio, objetivo.dataFim);
  const linkable = indicadoresDisponiveis.filter(
    (i) => !indicadoresDoObjetivo.some((l) => l.id === i.id),
  );

  // Filtro Todos/Em risco/Saudáveis — sempre relativo a ESTE objetivo
  // (`indicadorSaudeParaObjetivo`), nunca a saúde global do indicador.
  // Substitui a seção "Precisam de atenção" (redundante com isso) e a
  // linha de resumo em emoji — a própria lista já deixa claro o que
  // precisa de atenção.
  const { emRisco, saudaveis } = useMemo(() => {
    const risco: Indicador[] = [];
    const bons: Indicador[] = [];
    for (const i of indicadoresDoObjetivo) {
      const s = indicadorSaudeParaObjetivo(i, objetivo.id);
      if (s === "em_risco" || s === "atrasado") risco.push(i);
      else if (s === "saudavel" || s === "concluido") bons.push(i);
    }
    return { emRisco: risco, saudaveis: bons };
  }, [indicadoresDoObjetivo, objetivo.id]);

  const indicadoresFiltrados =
    filtro === "em_risco" ? emRisco : filtro === "saudaveis" ? saudaveis : indicadoresDoObjetivo;

  return (
    <div className="mx-auto w-full max-w-4xl">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Metas
        </button>
        <div ref={menuRef} className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Mais ações"
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full z-20 mt-1 w-40 rounded-md border border-border bg-popover p-1 shadow-md">
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onEdit();
                }}
                className="block w-full rounded px-2 py-1.5 text-left text-xs font-medium text-foreground hover:bg-muted"
              >
                Editar objetivo
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onDelete();
                }}
                className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-xs font-medium text-destructive hover:bg-muted"
              >
                <Trash2 className="h-3.5 w-3.5" /> Excluir objetivo
              </button>
            </div>
          )}
        </div>
      </div>

      <h1 className="mt-4 text-2xl font-semibold tracking-tight text-foreground">
        {objetivo.titulo}
      </h1>
      <div className="mt-2 flex items-center gap-2">
        <Avatar name={objetivo.dono} photo={members.find((m) => m.name === objetivo.dono)?.photo} />
        <p className="text-sm text-muted-foreground">
          {objetivo.dono || "Sem dono"} · {objetivo.area}
          {periodo ? ` · ${periodo}` : ""}
        </p>
      </div>
      {objetivo.descricao && (
        <p className="mt-2 text-sm text-muted-foreground">{objetivo.descricao}</p>
      )}

      <div className="mt-6 flex items-baseline gap-1.5">
        <span className="text-5xl font-light tracking-tight text-foreground">
          {progresso == null ? "—" : Math.round(progresso)}
        </span>
        {progresso != null && (
          <span className="text-base font-medium text-muted-foreground">% de progresso</span>
        )}
      </div>
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full transition-[width] duration-300 ${INDICADOR_SAUDE_BAR[resumoSaude]}`}
          style={{ width: `${Math.max(0, Math.min(100, progresso ?? 0))}%` }}
        />
      </div>
      <div className="mt-2">
        <ExpectedProgressLine progresso={progresso} esperado={esperado} />
      </div>
      <div className="mt-8 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">
          Indicadores{" "}
          {stats.total > 0 && <span className="text-muted-foreground">({stats.total})</span>}
        </h2>
        <div className="flex items-center gap-2">
          {stats.total >= 2 && (
            <button
              type="button"
              onClick={() => setPesosOpen(true)}
              className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              <Percent className="h-3.5 w-3.5" /> Ajustar pesos
            </button>
          )}
          <button
            type="button"
            onClick={() => setVincularOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-2.5 py-1.5 text-xs font-medium text-background hover:opacity-90"
          >
            <Plus className="h-3.5 w-3.5" /> Vincular indicador
          </button>
        </div>
      </div>

      {stats.total > 0 && (
        <div className="mt-3 flex items-center gap-1">
          {(
            [
              ["todos", `Todos ${stats.total}`],
              ["em_risco", `Em risco ${emRisco.length}`],
              ["saudaveis", `Saudáveis ${saudaveis.length}`],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFiltro(key)}
              className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                filtro === key
                  ? key === "em_risco"
                    ? "bg-rose-500/15 text-rose-700 dark:text-rose-400"
                    : key === "saudaveis"
                      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                      : "bg-muted text-foreground"
                  : "text-muted-foreground hover:bg-muted/60"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {indicadoresDoObjetivo.length === 0 ? (
        <div className="mt-4 rounded-lg border border-dashed border-border p-8 text-center">
          <p className="text-sm text-muted-foreground">Nenhum indicador ainda.</p>
          <button
            type="button"
            onClick={() => setVincularOpen(true)}
            className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
          >
            <Plus className="h-4 w-4" /> Vincular indicador
          </button>
        </div>
      ) : indicadoresFiltrados.length === 0 ? (
        <p className="mt-6 text-center text-sm text-muted-foreground">
          {filtro === "em_risco" ? "Nenhum indicador em risco." : "Nenhum indicador saudável."}
        </p>
      ) : (
        <div className="mt-3">
          {indicadoresFiltrados.map((ind) => (
            <ObjetivoIndicadorRow
              key={ind.id}
              indicador={ind}
              objetivoId={objetivo.id}
              onOpen={() => onOpenIndicador(ind.id)}
              onQuickUpdate={() => setQuickUpdateTarget(ind)}
              onUnlink={() => onUnlinkIndicador(ind.id)}
            />
          ))}
        </div>
      )}

      <VincularIndicadorDialog
        open={vincularOpen}
        linkable={linkable}
        onClose={() => setVincularOpen(false)}
        onCreateNew={() => {
          setVincularOpen(false);
          setCreateOpen(true);
        }}
        onLink={(id, cfg) => {
          setVincularOpen(false);
          onLinkIndicador(id, cfg);
        }}
      />
      <IndicadorQuickCreateDialog
        open={createOpen}
        objetivoId={objetivo.id}
        objetivoArea={objetivo.area}
        members={members}
        onClose={() => setCreateOpen(false)}
        onCreate={(ind) => {
          setCreateOpen(false);
          onCreateIndicador(ind);
        }}
      />
      <AjustarPesosDialog
        open={pesosOpen}
        objetivoId={objetivo.id}
        indicadores={indicadoresDoObjetivo}
        onClose={() => setPesosOpen(false)}
        onSave={(pesos) => {
          setPesosOpen(false);
          onSavePesos(pesos);
        }}
      />
      <IndicadorQuickUpdate
        indicador={quickUpdateTarget}
        objetivosVinculados={
          quickUpdateTarget
            ? allObjetivos.filter((o) => quickUpdateTarget.objetivoIds?.includes(o.id))
            : []
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
