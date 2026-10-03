import { useMemo, useState } from "react";
import { ArrowLeft, MoreHorizontal, Percent, Plus, Trash2 } from "lucide-react";
import type { ComparisonOperator, Indicador, Objetivo } from "@/lib/metas-store";
import {
  INDICADOR_SAUDE_LABEL,
  indicadorSaudeParaObjetivo,
  objetivoProgresso,
  objetivoResumoSaude,
  objetivoStats,
  progressoEsperado,
} from "@/lib/metas-engine";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { fmtPeriodo, saudeAlertaClass } from "./metas-ui-utils";
import { Avatar } from "./Avatar";
import { ExpectedProgressLine } from "./ExpectedProgressLine";
import { ObjetivoIndicadorRow } from "./ObjetivoIndicadorRow";
import { VincularIndicadorDialog } from "./VincularIndicadorDialog";
import { IndicadorQuickCreateDialog } from "./IndicadorQuickCreateDialog";
import { IndicadorQuickUpdate, type IndicadorQuickPatch } from "./IndicadorQuickUpdate";
import { AjustarPesosDialog } from "./AjustarPesosDialog";

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
  const [vincularOpen, setVincularOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [pesosOpen, setPesosOpen] = useState(false);
  const [quickUpdateTarget, setQuickUpdateTarget] = useState<Indicador | null>(null);
  const [filtro, setFiltro] = useState<IndicadorFiltro>("todos");

  const progresso = objetivoProgresso(objetivo.id, indicadoresDoObjetivo);
  const stats = objetivoStats(objetivo.id, indicadoresDoObjetivo);
  const resumoSaude = objetivoResumoSaude(objetivo, stats);
  const esperado = progressoEsperado(objetivo);
  const saudeAlerta = saudeAlertaClass(resumoSaude);
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
    <div className="mx-auto w-full max-w-4xl space-y-8 pb-10">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 rounded text-sm text-text-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        <ArrowLeft className="h-4 w-4" /> Metas
      </button>

      {/* Identidade + andamento — sem "hero" colorido: o nome é o elemento
       * dominante, o progresso vem logo abaixo e a saúde só aparece quando
       * pede atenção. */}
      <header className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p
              role="heading"
              aria-level={1}
              className="text-2xl font-bold leading-tight tracking-tight text-foreground md:text-3xl"
            >
              {objetivo.titulo}
            </p>
            <p className="mt-2 flex min-w-0 items-center gap-2 text-sm text-text-secondary">
              <Avatar
                name={objetivo.dono}
                photo={members.find((m) => m.name === objetivo.dono)?.photo}
              />
              <span className="truncate">
                {objetivo.dono || "Sem responsável"} · {objetivo.area}
                {periodo ? ` · ${periodo}` : ""}
              </span>
            </p>
            {objetivo.descricao && (
              <p className="mt-2 max-w-2xl text-sm text-text-secondary">{objetivo.descricao}</p>
            )}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Mais ações"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-text-secondary/80 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={onEdit}>Editar objetivo</DropdownMenuItem>
              {stats.total >= 2 && (
                <DropdownMenuItem onSelect={() => setPesosOpen(true)}>
                  Ajustar pesos
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={onDelete}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" /> Excluir objetivo
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
          <p className="whitespace-nowrap text-4xl font-bold leading-none tracking-tight text-foreground">
            {progresso == null ? "—" : Math.round(progresso)}
            {progresso != null && <span className="text-xl text-text-secondary">%</span>}
          </p>
          <div className="min-w-[160px] flex-1">
            <div
              className="h-1.5 w-full overflow-hidden rounded-full bg-muted-foreground/15"
              role="progressbar"
              aria-valuenow={progresso == null ? undefined : Math.round(progresso)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`Progresso de ${objetivo.titulo}`}
            >
              <div
                className="h-full rounded-full bg-brand transition-[width] duration-300"
                style={{ width: `${Math.max(0, Math.min(100, progresso ?? 0))}%` }}
              />
            </div>
            <div className="mt-1.5">
              <ExpectedProgressLine progresso={progresso} esperado={esperado} />
            </div>
          </div>
          {saudeAlerta && (
            <span className={`text-sm font-medium ${saudeAlerta}`}>
              {INDICADOR_SAUDE_LABEL[resumoSaude]}
            </span>
          )}
        </div>
      </header>

      {/* Indicadores — seção contínua (sem card): título + ações, filtro
       * Todos/Em risco/Saudáveis relativo a ESTE objetivo, linhas. */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p role="heading" aria-level={2} className="text-[15px] font-semibold text-foreground">
            Indicadores{" "}
            {stats.total > 0 && <span className="text-text-secondary">({stats.total})</span>}
          </p>
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
          <SegmentedControl
            aria-label="Filtrar indicadores"
            size="sm"
            value={filtro}
            onChange={setFiltro}
            options={[
              { value: "todos", label: `Todos ${stats.total}` },
              { value: "em_risco", label: `Em risco ${emRisco.length}` },
              { value: "saudaveis", label: `Saudáveis ${saudaveis.length}` },
            ]}
          />
        )}

        {indicadoresDoObjetivo.length === 0 ? (
          <div className="flex items-center justify-between gap-3 border-y border-border/60 py-4">
            <div>
              <p className="text-sm font-medium text-foreground">Nenhum indicador ainda</p>
              <p className="text-sm text-text-secondary">
                Vincule um indicador existente ou crie um novo para acompanhar este objetivo.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setVincularOpen(true)}>
              <Plus className="h-4 w-4" /> Vincular indicador
            </Button>
          </div>
        ) : indicadoresFiltrados.length === 0 ? (
          <p className="py-6 text-center text-sm text-text-secondary">
            {filtro === "em_risco" ? "Nenhum indicador em risco." : "Nenhum indicador saudável."}
          </p>
        ) : (
          <div className="divide-y divide-border/60 border-y border-border/60">
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
      </section>

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
