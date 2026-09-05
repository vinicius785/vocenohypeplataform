import { AlertTriangle, Calendar, CheckCircle2, Flag } from "lucide-react";
import { type Task } from "@/components/tasks/TaskBoard";
import { OPEN_STATUSES } from "@/lib/score";
import { todayIsoInBrasilia } from "@/lib/timezone";
import {
  faseAtual,
  faseStatusEfetivo,
  FASE_STATUS_LABEL,
  FASE_STATUS_TONE,
  type ProjetoFase,
} from "@/lib/roadmap-engine";
import { formatIsoDate } from "@/lib/utils";

function StatCard({
  icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  tone?: string;
}) {
  return (
    <div className="rounded-xl border border-border p-4">
      <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {icon} {label}
      </p>
      <p className={`mt-2 text-xl font-semibold ${tone ?? "text-foreground"}`}>{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Aba "Visão geral" (item 8 do pedido) — só leitura, deriva tudo do que
 * já está carregado (`fases`+`tasks`), nenhum fetch novo. */
export function RoadmapOverviewTab({ fases, tasks }: { fases: ProjetoFase[]; tasks: Task[] }) {
  const comFase = tasks.filter((t) => t.roadmapPhaseId);
  const concluidasComFase = comFase.filter((t) => t.status === "Concluído").length;
  const progressoGeral =
    comFase.length === 0 ? null : Math.round((concluidasComFase / comFase.length) * 100);

  const atual = faseAtual(fases, tasks);

  const today = todayIsoInBrasilia();
  const abertasComPrazo = tasks
    .filter((t) => OPEN_STATUSES.has(t.status) && t.dueDate)
    .sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""));
  const proximaEntrega = abertasComPrazo.find((t) => (t.dueDate ?? "") >= today) ?? null;

  const fasesEmRisco = fases.filter((f) => {
    const s = faseStatusEfetivo(f, tasks);
    return s === "em_risco" || s === "atrasada";
  });

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          icon={<CheckCircle2 className="h-3.5 w-3.5" />}
          label="Progresso geral"
          value={progressoGeral === null ? "—" : `${progressoGeral}%`}
          hint={progressoGeral === null ? "Nenhuma tarefa vinculada" : undefined}
        />
        <StatCard
          icon={<Flag className="h-3.5 w-3.5" />}
          label="Fase atual"
          value={atual?.nome ?? "—"}
          hint={
            atual
              ? `${formatIsoDate(atual.dataInicio)} – ${formatIsoDate(atual.dataFim)}`
              : "Todas as fases concluídas"
          }
        />
        <StatCard
          icon={<Calendar className="h-3.5 w-3.5" />}
          label="Próxima entrega"
          value={proximaEntrega ? proximaEntrega.title : "—"}
          hint={proximaEntrega?.dueDate ? formatIsoDate(proximaEntrega.dueDate) : undefined}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <StatCard
          icon={<AlertTriangle className="h-3.5 w-3.5" />}
          label="Fases em risco"
          value={String(fasesEmRisco.length)}
          tone={fasesEmRisco.length > 0 ? "text-amber-600 dark:text-amber-400" : undefined}
        />
        <StatCard
          icon={<Calendar className="h-3.5 w-3.5" />}
          label="Período da fase"
          value={
            atual ? `${formatIsoDate(atual.dataInicio)} – ${formatIsoDate(atual.dataFim)}` : "—"
          }
        />
      </div>

      {fasesEmRisco.length > 0 && (
        <div className="rounded-xl border border-border p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Fases que precisam de atenção
          </p>
          <div className="space-y-1.5">
            {fasesEmRisco.map((f) => {
              const s = faseStatusEfetivo(f, tasks);
              return (
                <div key={f.id} className="flex items-center gap-2 text-xs">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${f.cor.split(" ")[0]}`} />
                  <span className="min-w-0 flex-1 truncate text-foreground">{f.nome}</span>
                  <span
                    className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${FASE_STATUS_TONE[s]}`}
                  >
                    {FASE_STATUS_LABEL[s]}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
