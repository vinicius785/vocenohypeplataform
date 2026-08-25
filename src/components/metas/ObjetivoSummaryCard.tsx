import { ChevronRight } from "lucide-react";
import type { Indicador, Objetivo } from "@/lib/metas-store";
import { INDICADOR_SAUDE_BAR, objetivoProgresso, objetivoStats } from "@/lib/metas-engine";
import { fmtPeriodo } from "./metas-ui-utils";

/** Card compacto de Objetivo pra tela principal — só o suficiente pra
 * decidir se vale entrar: progresso, saúde resumida, área/período,
 * contagem de indicadores. Edição/exclusão vivem na página do objetivo,
 * não aqui (clicar sempre navega, nunca abre menu). */
export function ObjetivoSummaryCard({
  objetivo,
  indicadores,
  onOpen,
}: {
  objetivo: Objetivo;
  indicadores: Indicador[];
  onOpen: () => void;
}) {
  const progresso = objetivoProgresso(objetivo.id, indicadores);
  const stats = objetivoStats(objetivo.id, indicadores);
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

  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full flex-col gap-3 rounded-2xl border border-border bg-card p-5 text-left transition-colors hover:border-foreground/30"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="min-w-0 text-base font-medium leading-snug text-foreground">
          {objetivo.titulo}
        </h3>
        <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      </div>

      <div className="flex items-baseline gap-1.5">
        <span className="text-3xl font-light tracking-tight text-foreground">
          {progresso == null ? "—" : Math.round(progresso)}
        </span>
        {progresso != null && <span className="text-sm text-muted-foreground">%</span>}
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full ${INDICADOR_SAUDE_BAR[resumoSaude]}`}
          style={{ width: `${Math.max(0, Math.min(100, progresso ?? 0))}%` }}
        />
      </div>

      <p className="text-[11px] text-muted-foreground">
        {objetivo.area}
        {periodo ? ` · ${periodo}` : ""}
      </p>

      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted-foreground">
        {stats.saudaveis > 0 && <span>🟢 {stats.saudaveis} saudáveis</span>}
        {stats.atencao > 0 && <span>🟡 {stats.atencao} atenção</span>}
        {(stats.emRisco > 0 || stats.atrasados > 0) && (
          <span>🔴 {stats.emRisco + stats.atrasados} em risco</span>
        )}
        <span className="ml-auto">
          {stats.total} indicador{stats.total === 1 ? "" : "es"}
        </span>
      </div>
    </button>
  );
}
