import { ChevronRight } from "lucide-react";
import type { Indicador, Objetivo } from "@/lib/metas-store";
import {
  INDICADOR_SAUDE_BAR,
  objetivoProgresso,
  objetivoResumoSaude,
  objetivoStats,
  progressoEsperado,
} from "@/lib/metas-engine";
import { fmtPeriodo } from "./metas-ui-utils";
import { Avatar } from "./Avatar";
import { ExpectedProgressLine } from "./ExpectedProgressLine";

type Member = { name: string; photo?: string };

/** Card compacto de Objetivo pra tela principal — só o suficiente pra
 * decidir se vale entrar: dono, progresso, saúde resumida, área/período,
 * contagem de indicadores. Edição/exclusão vivem na página do objetivo,
 * não aqui (clicar sempre navega, nunca abre menu). */
export function ObjetivoSummaryCard({
  objetivo,
  indicadores,
  members,
  onOpen,
}: {
  objetivo: Objetivo;
  indicadores: Indicador[];
  members: Member[];
  onOpen: () => void;
}) {
  const donoMember = members.find((m) => m.name === objetivo.dono);
  const progresso = objetivoProgresso(objetivo.id, indicadores);
  const stats = objetivoStats(objetivo.id, indicadores);
  const resumoSaude = objetivoResumoSaude(objetivo, stats);
  const esperado = progressoEsperado(objetivo);
  const periodo = fmtPeriodo(objetivo.dataInicio, objetivo.dataFim);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full flex-col gap-3 rounded-2xl border border-border bg-card p-5 text-left transition-colors hover:border-foreground/30"
    >
      <div className="flex items-center gap-2">
        <Avatar name={objetivo.dono} photo={donoMember?.photo} />
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-muted-foreground">
          {objetivo.dono || "Sem dono"}
        </span>
      </div>

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
      <ExpectedProgressLine progresso={progresso} esperado={esperado} />

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
