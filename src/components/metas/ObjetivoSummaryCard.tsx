import { ChevronRight } from "lucide-react";
import type { Indicador, Objetivo } from "@/lib/metas-store";
import {
  INDICADOR_SAUDE_BAR,
  type IndicadorSaude,
  type ObjetivoStats,
  objetivoProgresso,
  objetivoResumoSaude,
  objetivoStats,
  progressoEsperado,
} from "@/lib/metas-engine";
import { fmtPeriodo } from "./metas-ui-utils";
import { Avatar } from "./Avatar";
import { ExpectedProgressLine } from "./ExpectedProgressLine";

type Member = { name: string; photo?: string };

/** Uma única linha de saúde — nunca mostra saudável/atenção/em risco
 * simultaneamente (isso é redundante, seção 5 do pedido): prioriza o
 * que precisa de atenção; sem nenhum problema, mostra só "Saudável".
 * Contagem total de indicadores fica só no detalhe do objetivo. */
function healthLine(
  resumoSaude: IndicadorSaude,
  stats: ObjetivoStats,
): { emoji: string; text: string; tone: string } | null {
  if (resumoSaude === "em_risco") {
    const n = stats.emRisco + stats.atrasados;
    return {
      emoji: "🔴",
      text: `${n} indicador${n === 1 ? "" : "es"} em risco`,
      tone: "text-rose-600 dark:text-rose-400",
    };
  }
  if (resumoSaude === "atencao") {
    return {
      emoji: "🟡",
      text: `${stats.atencao} em atenção`,
      tone: "text-amber-600 dark:text-amber-400",
    };
  }
  if (resumoSaude === "concluido") {
    return {
      emoji: "✅",
      text: stats.total > 1 ? "Todos concluídos" : "Concluído",
      tone: "text-foreground",
    };
  }
  if (resumoSaude === "saudavel") {
    return {
      emoji: "🟢",
      text: stats.total > 1 ? "Todos os indicadores saudáveis" : "Saudável",
      tone: "text-emerald-600 dark:text-emerald-400",
    };
  }
  return null; // "nao_iniciado" (sem indicadores ainda) / "cancelado" — nada a destacar
}

/** Card compacto de Objetivo pra tela principal — só o suficiente pra
 * decidir se vale entrar: dono, progresso, UMA linha de saúde (o que
 * mais importa agora, nunca várias contagens ao mesmo tempo),
 * área/período discretos no rodapé. Edição/exclusão vivem na página do
 * objetivo, não aqui (clicar sempre navega, nunca abre menu). */
export function ObjetivoSummaryCard({
  objetivo,
  indicadores,
  members,
  onOpen,
  /** Esconde avatar+nome do dono — usado quando o card já aparece
   * dentro de um grupo "Por pessoa", onde o nome já está no cabeçalho
   * do grupo (mostrar de novo em cada card é redundante). */
  compact,
}: {
  objetivo: Objetivo;
  indicadores: Indicador[];
  members: Member[];
  onOpen: () => void;
  compact?: boolean;
}) {
  const donoMember = members.find((m) => m.name === objetivo.dono);
  const progresso = objetivoProgresso(objetivo.id, indicadores);
  const stats = objetivoStats(objetivo.id, indicadores);
  const resumoSaude = objetivoResumoSaude(objetivo, stats);
  const esperado = progressoEsperado(objetivo);
  const periodo = fmtPeriodo(objetivo.dataInicio, objetivo.dataFim);
  const health = healthLine(resumoSaude, stats);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full flex-col gap-3 rounded-2xl border border-border bg-card p-5 text-left transition-colors hover:border-foreground/30"
    >
      {!compact && (
        <div className="flex items-center gap-2">
          <Avatar name={objetivo.dono} photo={donoMember?.photo} />
          <span className="min-w-0 flex-1 truncate text-xs font-medium text-muted-foreground">
            {objetivo.dono || "Sem dono"}
          </span>
        </div>
      )}

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

      {health && (
        <p className={`text-xs font-medium ${health.tone}`}>
          {health.emoji} {health.text}
        </p>
      )}

      <p className="text-[11px] text-muted-foreground">
        {objetivo.area}
        {periodo ? ` · ${periodo}` : ""}
      </p>
    </button>
  );
}
