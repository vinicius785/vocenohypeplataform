import { AlertTriangle, CheckCircle2, ChevronRight, TrendingDown } from "lucide-react";
import type { Indicador, Objetivo } from "@/lib/metas-store";
import {
  type IndicadorSaude,
  type ObjetivoStats,
  objetivoProgresso,
  objetivoResumoSaude,
  objetivoStats,
  progressoEsperado,
} from "@/lib/metas-engine";
import { Badge } from "@/components/ui/badge";
import { fmtPeriodo } from "./metas-ui-utils";
import { Avatar } from "./Avatar";
import { ExpectedProgressLine } from "./ExpectedProgressLine";

type Member = { name: string; photo?: string };

/** Um único badge de saúde — nunca mostra saudável/atenção/em risco
 * simultaneamente (isso é redundante, seção 5 do pedido): prioriza o
 * que precisa de atenção; sem nenhum problema, mostra só "Saudável".
 * Contagem total de indicadores fica só no detalhe do objetivo. Saúde é
 * um conceito à parte do progresso (barra sempre brand) — por isso vira
 * `Badge` semântico, nunca cor da barra. */
function healthBadge(
  resumoSaude: IndicadorSaude,
  stats: ObjetivoStats,
): {
  icon: typeof CheckCircle2;
  text: string;
  variant: "success" | "warning" | "danger" | "brand";
} | null {
  if (resumoSaude === "em_risco") {
    const n = stats.emRisco + stats.atrasados;
    return {
      icon: TrendingDown,
      text: `${n} indicador${n === 1 ? "" : "es"} em risco`,
      variant: "danger",
    };
  }
  if (resumoSaude === "atencao") {
    return { icon: AlertTriangle, text: `${stats.atencao} em atenção`, variant: "warning" };
  }
  if (resumoSaude === "concluido") {
    return {
      icon: CheckCircle2,
      text: stats.total > 1 ? "Todos concluídos" : "Concluído",
      variant: "brand",
    };
  }
  if (resumoSaude === "saudavel") {
    return {
      icon: CheckCircle2,
      text: stats.total > 1 ? "Todos os indicadores saudáveis" : "Saudável",
      variant: "success",
    };
  }
  return null; // "nao_iniciado" (sem indicadores ainda) / "cancelado" — nada a destacar
}

/** Card compacto de Objetivo pra tela principal — só o suficiente pra
 * decidir se vale entrar: dono, progresso (sempre brand — nunca a cor
 * da saúde), UM badge de saúde (o que mais importa agora, nunca várias
 * contagens ao mesmo tempo), área/período discretos no rodapé. Edição/
 * exclusão vivem na página do objetivo, não aqui (clicar sempre navega,
 * nunca abre menu). */
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
  const health = healthBadge(resumoSaude, stats);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full flex-col gap-3 rounded-[20px] bg-card p-5 text-left transition-colors hover:bg-muted/40 dark:shadow-none"
    >
      {!compact && (
        <div className="flex items-center gap-2">
          <Avatar name={objetivo.dono} photo={donoMember?.photo} />
          <span className="min-w-0 flex-1 truncate text-xs font-medium text-text-secondary">
            {objetivo.dono || "Sem dono"}
          </span>
        </div>
      )}

      <div className="flex items-start justify-between gap-3">
        <h3 className="min-w-0 text-base font-medium leading-snug text-foreground">
          {objetivo.titulo}
        </h3>
        <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-text-secondary" />
      </div>

      <div className="flex items-baseline gap-1.5">
        <span className="text-3xl font-bold tracking-tight text-foreground">
          {progresso == null ? "—" : Math.round(progresso)}
        </span>
        {progresso != null && <span className="text-sm text-text-secondary">%</span>}
      </div>
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={progresso == null ? undefined : Math.round(progresso)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Progresso de ${objetivo.titulo}`}
      >
        <div
          className="h-full rounded-full bg-brand"
          style={{ width: `${Math.max(0, Math.min(100, progresso ?? 0))}%` }}
        />
      </div>
      <ExpectedProgressLine progresso={progresso} esperado={esperado} />

      {health && (
        <Badge variant={health.variant} className="w-fit gap-1 font-medium">
          <health.icon className="h-3 w-3" />
          {health.text}
        </Badge>
      )}

      <p className="text-[11px] text-text-secondary">
        {objetivo.area}
        {periodo ? ` · ${periodo}` : ""}
      </p>
    </button>
  );
}
