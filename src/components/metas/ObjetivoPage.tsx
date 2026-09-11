import { useMemo, useRef, useState } from "react";
import { ArrowLeft, MoreHorizontal, Percent, Plus, Trash2 } from "lucide-react";
import type { ComparisonOperator, Indicador, Objetivo } from "@/lib/metas-store";
import {
  INDICADOR_SAUDE_DOT,
  INDICADOR_SAUDE_LABEL,
  indicadorSaudeParaObjetivo,
  objetivoProgresso,
  objetivoResumoSaude,
  objetivoStats,
  progressoEsperado,
} from "@/lib/metas-engine";
import { Button } from "@/components/ui/button";
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
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 rounded text-sm text-text-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        <ArrowLeft className="h-4 w-4" /> Metas
      </button>

      {/* Hero — protagonista brand blue com título/dono/área/período,
       * progresso (sempre dominante e azul) e saúde à parte, como chip
       * semântico, nunca pintando a superfície inteira de vermelho. */}
      <div className="rounded-[28px] bg-brand p-6 dark:shadow-none md:p-7">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <Avatar
              name={objetivo.dono}
              photo={members.find((m) => m.name === objetivo.dono)?.photo}
            />
            <p className="min-w-0 truncate text-sm text-brand-foreground-secondary">
              {objetivo.dono || "Sem dono"} · {objetivo.area}
              {periodo ? ` · ${periodo}` : ""}
            </p>
          </div>
          <div ref={menuRef} className="relative shrink-0">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="Mais ações"
              aria-expanded={menuOpen}
              className="flex h-8 w-8 items-center justify-center rounded-full text-brand-foreground-secondary hover:bg-black/10 hover:text-brand-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-background"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-full z-20 mt-1 w-44 rounded-xl bg-popover p-1 text-foreground shadow-lg dark:shadow-none">
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onEdit();
                  }}
                  className="block w-full rounded px-2 py-1.5 text-left text-sm font-medium hover:bg-muted"
                >
                  Editar objetivo
                </button>
                {stats.total >= 2 && (
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      setPesosOpen(true);
                    }}
                    className="block w-full rounded px-2 py-1.5 text-left text-sm font-medium hover:bg-muted"
                  >
                    Ajustar pesos
                  </button>
                )}
                <div className="my-1 border-t border-border/60" />
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onDelete();
                  }}
                  className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-sm font-medium text-danger hover:bg-danger-soft"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Excluir objetivo
                </button>
              </div>
            )}
          </div>
        </div>

        <h1 className="mt-3 text-2xl font-bold tracking-tight text-brand-foreground md:text-3xl">
          {objetivo.titulo}
        </h1>
        {objetivo.descricao && (
          <p className="mt-1.5 max-w-xl text-sm text-brand-foreground-secondary">
            {objetivo.descricao}
          </p>
        )}

        <div className="mt-6 flex flex-wrap items-end gap-x-8 gap-y-4">
          <div>
            <p className="whitespace-nowrap text-[44px] font-bold leading-none tracking-tight text-brand-foreground">
              {progresso == null ? "—" : Math.round(progresso)}
              {progresso != null && <span className="text-2xl">%</span>}
            </p>
            <p className="mt-1.5 text-xs font-medium uppercase tracking-wide text-brand-foreground-secondary">
              Progresso
            </p>
          </div>
          <div className="min-w-[160px] flex-1">
            <div
              className="h-2 w-full overflow-hidden rounded-full bg-black/10"
              role="progressbar"
              aria-valuenow={progresso == null ? undefined : Math.round(progresso)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`Progresso de ${objetivo.titulo}`}
            >
              <div
                className="h-full rounded-full bg-background transition-[width] duration-300"
                style={{ width: `${Math.max(0, Math.min(100, progresso ?? 0))}%` }}
              />
            </div>
            <div className="mt-1.5">
              <ExpectedProgressLine progresso={progresso} esperado={esperado} />
            </div>
          </div>
          <div className="flex items-center gap-1.5 rounded-full bg-black/10 px-3 py-1.5">
            <span
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${INDICADOR_SAUDE_DOT[resumoSaude]}`}
            />
            <span className="text-xs font-medium text-brand-foreground">
              {INDICADOR_SAUDE_LABEL[resumoSaude]}
            </span>
          </div>
          {stats.total > 0 && (
            <div>
              <p className="text-lg font-semibold text-brand-foreground">{stats.total}</p>
              <p className="text-xs font-medium uppercase tracking-wide text-brand-foreground-secondary">
                {stats.total === 1 ? "Indicador" : "Indicadores"}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Indicadores vinculados — superfície estruturada com cabeçalho
       * claro, filtros contextuais preservados, ações em cada linha. */}
      <div className="rounded-[24px] bg-card p-5 dark:shadow-none">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-[15px] font-semibold text-foreground">
            Indicadores{" "}
            {stats.total > 0 && <span className="text-text-secondary">({stats.total})</span>}
          </h2>
          <div className="flex items-center gap-2">
            {stats.total >= 2 && (
              <button
                type="button"
                onClick={() => setPesosOpen(true)}
                className="inline-flex items-center gap-1 rounded text-xs font-medium text-text-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                <Percent className="h-3.5 w-3.5" /> Ajustar pesos
              </button>
            )}
            <Button variant="primary" size="sm" onClick={() => setVincularOpen(true)}>
              <Plus className="h-3.5 w-3.5" /> Vincular indicador
            </Button>
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
                className={`rounded-full px-2.5 py-1 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                  filtro === key
                    ? key === "em_risco"
                      ? "bg-danger-soft text-danger-soft-foreground"
                      : key === "saudaveis"
                        ? "bg-success-soft text-success-soft-foreground"
                        : "bg-muted text-foreground"
                    : "text-text-secondary hover:bg-muted/60"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {indicadoresDoObjetivo.length === 0 ? (
          <div className="mt-4 rounded-2xl bg-muted/40 p-8 text-center">
            <p className="text-sm text-text-secondary">Nenhum indicador ainda.</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => setVincularOpen(true)}
            >
              <Plus className="h-4 w-4" /> Vincular indicador
            </Button>
          </div>
        ) : indicadoresFiltrados.length === 0 ? (
          <p className="mt-6 text-center text-sm text-text-secondary">
            {filtro === "em_risco" ? "Nenhum indicador em risco." : "Nenhum indicador saudável."}
          </p>
        ) : (
          <div className="mt-3 divide-y divide-border/60">
            {indicadoresFiltrados.map((ind) => (
              <ObjetivoIndicadorRow
                key={ind.id}
                indicador={ind}
                objetivoId={objetivo.id}
                siblings={indicadoresDoObjetivo}
                onOpen={() => onOpenIndicador(ind.id)}
                onQuickUpdate={() => setQuickUpdateTarget(ind)}
                onUnlink={() => onUnlinkIndicador(ind.id)}
              />
            ))}
          </div>
        )}
      </div>

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
