import { useRef, useState } from "react";
import { ArrowLeft, MoreHorizontal, Percent, Plus, Trash2, X } from "lucide-react";
import type { Indicador, Objetivo } from "@/lib/metas-store";
import { INDICADOR_SAUDE_BAR, objetivoProgresso, objetivoStats } from "@/lib/metas-engine";
import { fmtPeriodo } from "./metas-ui-utils";
import { Avatar } from "./Avatar";
import { IndicadorRow } from "./IndicadorRow";
import { IndicadorQuickCreateDialog } from "./IndicadorQuickCreateDialog";
import { IndicadorQuickUpdate, type IndicadorQuickPatch } from "./IndicadorQuickUpdate";
import { AjustarPesosDialog } from "./AjustarPesosDialog";
import { useDropdown } from "./use-dropdown";

type Member = { name: string; photo?: string };

/** Página de gestão de um Objetivo — visão geral (progresso/saúde) +
 * lista de indicadores + ações de adicionar/vincular/pesos/editar/excluir.
 * Nada disso acontece em modal solto: é o "ambiente" do objetivo. */
export function ObjetivoPage({
  objetivo,
  indicadoresDoObjetivo,
  indicadoresDisponiveis,
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
  indicadoresDisponiveis: Indicador[];
  members: Member[];
  onBack: () => void;
  onOpenIndicador: (id: string) => void;
  onEdit: () => void;
  onDelete: () => void;
  onCreateIndicador: (ind: Indicador) => void;
  onLinkIndicador: (id: string) => void;
  onUnlinkIndicador: (id: string) => void;
  onSavePesos: (pesos: Record<string, number>) => void;
  onQuickUpdate: (ind: Indicador, patch: IndicadorQuickPatch, nota: string) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [pesosOpen, setPesosOpen] = useState(false);
  const [quickUpdateTarget, setQuickUpdateTarget] = useState<Indicador | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const addRef = useRef<HTMLDivElement>(null);
  useDropdown(menuRef, menuOpen, () => setMenuOpen(false));
  useDropdown(addRef, addOpen, () => setAddOpen(false));

  const progresso = objetivoProgresso(objetivo.id, indicadoresDoObjetivo);
  const stats = objetivoStats(objetivo.id, indicadoresDoObjetivo);
  const resumoSaude = objetivo.cancelado
    ? "cancelado"
    : stats.emRisco > 0 || stats.atrasados > 0
      ? "em_risco"
      : stats.atencao > 0
        ? "atencao"
        : stats.total > 0 && stats.concluidos === stats.total
          ? "concluido"
          : stats.total === 0
            ? "nao_iniciado"
            : "saudavel";
  const periodo = fmtPeriodo(objetivo.dataInicio, objetivo.dataFim);
  const linkable = indicadoresDisponiveis.filter(
    (i) => !indicadoresDoObjetivo.some((l) => l.id === i.id),
  );

  return (
    <div className="mx-auto w-full max-w-2xl">
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
      <p className="mt-2 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
        {stats.saudaveis > 0 && <span>🟢 {stats.saudaveis} saudáveis</span>}
        {stats.atencao > 0 && <span>🟡 {stats.atencao} atenção</span>}
        {(stats.emRisco > 0 || stats.atrasados > 0) && (
          <span>🔴 {stats.emRisco + stats.atrasados} em risco</span>
        )}
        {stats.concluidos > 0 && <span>✅ {stats.concluidos} concluídos</span>}
      </p>

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
          <div ref={addRef} className="relative">
            <button
              type="button"
              onClick={() => setAddOpen((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-2.5 py-1.5 text-xs font-medium text-background hover:opacity-90"
            >
              <Plus className="h-3.5 w-3.5" /> Adicionar
            </button>
            {addOpen && (
              <div className="absolute right-0 top-full z-20 mt-1 w-56 rounded-md border border-border bg-popover p-1 shadow-md">
                <button
                  type="button"
                  onClick={() => {
                    setAddOpen(false);
                    setCreateOpen(true);
                  }}
                  className="block w-full rounded px-2 py-1.5 text-left text-xs font-medium text-foreground hover:bg-muted"
                >
                  Criar novo indicador
                </button>
                <div className="mt-1 border-t border-border pt-1">
                  <p className="px-2 pb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    Vincular existente
                  </p>
                  {linkable.length === 0 ? (
                    <p className="px-2 py-1 text-[11px] text-muted-foreground">
                      Nenhum indicador independente disponível.
                    </p>
                  ) : (
                    <div className="max-h-40 overflow-y-auto">
                      {linkable.map((i) => (
                        <button
                          key={i.id}
                          type="button"
                          onClick={() => {
                            setAddOpen(false);
                            onLinkIndicador(i.id);
                          }}
                          className="block w-full truncate rounded px-2 py-1.5 text-left text-xs hover:bg-muted"
                        >
                          {i.titulo}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {indicadoresDoObjetivo.length === 0 ? (
        <div className="mt-4 rounded-lg border border-dashed border-border p-8 text-center">
          <p className="text-sm text-muted-foreground">Nenhum indicador ainda.</p>
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
          >
            <Plus className="h-4 w-4" /> Adicionar indicador
          </button>
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {indicadoresDoObjetivo.map((ind) => (
            <div key={ind.id} className="group relative">
              <IndicadorRow
                indicador={ind}
                dono={objetivo.dono}
                onOpen={() => onOpenIndicador(ind.id)}
                onQuickUpdate={() => setQuickUpdateTarget(ind)}
              />
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onUnlinkIndicador(ind.id);
                }}
                title="Desvincular do objetivo"
                aria-label="Desvincular do objetivo"
                className="absolute right-2 top-2 hidden h-5 w-5 items-center justify-center rounded-full bg-background/90 text-muted-foreground hover:text-destructive group-hover:flex"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

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
        indicadores={indicadoresDoObjetivo}
        onClose={() => setPesosOpen(false)}
        onSave={(pesos) => {
          setPesosOpen(false);
          onSavePesos(pesos);
        }}
      />
      <IndicadorQuickUpdate
        indicador={quickUpdateTarget}
        onClose={() => setQuickUpdateTarget(null)}
        onSave={(ind, patch, nota) => {
          setQuickUpdateTarget(null);
          onQuickUpdate(ind, patch, nota);
        }}
      />
    </div>
  );
}
