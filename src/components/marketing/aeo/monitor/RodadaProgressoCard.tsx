import type { AeoRodadaComputada } from "@/lib/aeo-engine";
import { fmtDate } from "../aeo-ui-utils";

export function RodadaProgressoCard({ rodada }: { rodada: AeoRodadaComputada }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-foreground">Rodada {fmtDate(rodada.dataRodada)}</p>
        <span
          className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
            rodada.status === "concluida"
              ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
              : "bg-sky-500/10 text-sky-700 dark:text-sky-400"
          }`}
        >
          {rodada.status === "concluida" ? "Concluída" : "Em andamento"}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
        <span>{rodada.promptsAtivos} prompts ativos</span>
        <span>{rodada.iasMonitoradas} IAs monitoradas</span>
        <span>{rodada.respostasEsperadas} respostas esperadas</span>
        <span>{rodada.respostasPreenchidas} preenchidas</span>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-foreground transition-all"
            style={{ width: `${rodada.progresso}%` }}
          />
        </div>
        <span className="shrink-0 text-xs font-medium text-foreground">{rodada.progresso}%</span>
      </div>
    </div>
  );
}
