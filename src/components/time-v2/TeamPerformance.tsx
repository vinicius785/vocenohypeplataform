import { formatDays } from "./member-metrics";
import { trendPP, type TeamPerformance as Data } from "./team-v2";

function Indicador({
  label,
  value,
  detail,
  trend,
}: {
  label: string;
  value: string;
  detail?: string | null;
  trend?: string | null;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-medium uppercase tracking-wide text-text-secondary">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{value}</p>
      {trend && <p className="mt-0.5 text-xs tabular-nums text-text-secondary">{trend}</p>}
      {detail && <p className="hidden text-xs text-text-secondary sm:block">{detail}</p>}
    </div>
  );
}

const arrow = (cur: number, prev: number) =>
  cur === prev ? "igual" : `${cur > prev ? "↑" : "↓"} ${Math.abs(cur - prev)}`;

/** Desempenho do time: resultado, tendência e leitura — só o que o motor já calcula, nas janelas
 * de 30 dias (contra os 30 anteriores) que os insights também usam. */
export function TeamPerformance({ data }: { data: Data }) {
  const { onTime, replans, cycle } = data;
  const onTimeTrend = trendPP(onTime.value, onTime.previous);
  return (
    <section aria-label="Desempenho do time" className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <h3 className="text-[15px] font-semibold text-foreground">Desempenho do time</h3>
        <span className="text-xs text-text-secondary">Últimos 30 dias · vs 30 dias anteriores</span>
      </div>
      <div className="grid grid-cols-3 gap-4 sm:gap-8">
        <Indicador
          label="Conclusão no prazo"
          value={onTime.value == null ? "—" : `${Math.round(onTime.value)}%`}
          trend={onTimeTrend}
          detail={
            onTime.sample === 0
              ? "Sem conclusões avaliadas"
              : `${onTime.sample} ${onTime.sample === 1 ? "conclusão avaliada" : "conclusões avaliadas"}`
          }
        />
        <Indicador
          label="Replanejamentos"
          value={String(replans.value)}
          trend={`${arrow(replans.value, replans.previous)} vs ${replans.previous}`.replace(
            "igual vs",
            "igual a",
          )}
          detail="Prazos alterados no período"
        />
        <Indicador
          label="Tempo médio de ciclo"
          value={formatDays(cycle.days)}
          trend={cycle.previousDays != null ? `Antes: ${formatDays(cycle.previousDays)}` : null}
          detail={
            cycle.sample === 0 ? "Sem tarefas com início registrado" : "Em andamento → concluída"
          }
        />
      </div>
    </section>
  );
}
