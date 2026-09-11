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
import { MetricCard } from "@/components/shared/MetricCard";

/** Aba "Visão geral" (item 8 do pedido) — só leitura, deriva tudo do que
 * já está carregado (`fases`+`tasks`), nenhum fetch novo. Indicadores
 * migrados pro `MetricCard` compartilhado (compact) — a implementação
 * local anterior (`StatCard`) era uma das 8 duplicatas apontadas na
 * auditoria do design system. */
export function RoadmapOverviewTab({ fases, tasks }: { fases: ProjetoFase[]; tasks: Task[] }) {
  const comFase = tasks.filter((t) => t.roadmapPhaseId);
  const concluidasComFase = comFase.filter((t) => t.status === "Concluído").length;
  const progressoGeral =
    comFase.length === 0 ? null : Math.round((concluidasComFase / comFase.length) * 100);

  const atual = faseAtual(fases, tasks);
  // Distingue "ainda não existe nenhuma fase" de "todas as fases já foram
  // concluídas" — antes as duas caíam no mesmo "—" com a mesma legenda,
  // mesmo sendo estados bem diferentes pra quem está lendo.
  const todasConcluidas = fases.length > 0 && !atual;

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
        <MetricCard
          compact
          icon={<CheckCircle2 className="h-3.5 w-3.5" />}
          label="Progresso geral"
          value={progressoGeral === null ? null : `${progressoGeral}%`}
          unavailableReason="Nenhuma tarefa vinculada a uma fase"
          tone="brand"
        />
        <MetricCard
          compact
          icon={<Flag className="h-3.5 w-3.5" />}
          label="Fase atual"
          value={todasConcluidas ? "Concluído" : (atual?.nome ?? null)}
          unavailableReason="Nenhuma fase criada ainda"
          complement={
            atual
              ? `${formatIsoDate(atual.dataInicio)} – ${formatIsoDate(atual.dataFim)}`
              : undefined
          }
          tone={todasConcluidas ? "success" : "neutral"}
        />
        <MetricCard
          compact
          icon={<Calendar className="h-3.5 w-3.5" />}
          label="Próxima entrega"
          value={proximaEntrega ? proximaEntrega.title : null}
          unavailableReason="Nenhuma tarefa em aberto com prazo"
          complement={proximaEntrega?.dueDate ? formatIsoDate(proximaEntrega.dueDate) : undefined}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <MetricCard
          compact
          icon={<AlertTriangle className="h-3.5 w-3.5" />}
          label="Fases em risco"
          value={String(fasesEmRisco.length)}
          tone={fasesEmRisco.length > 0 ? "warning" : "neutral"}
        />
        <MetricCard
          compact
          icon={<Calendar className="h-3.5 w-3.5" />}
          label="Período da fase atual"
          value={
            atual ? `${formatIsoDate(atual.dataInicio)} – ${formatIsoDate(atual.dataFim)}` : null
          }
          unavailableReason={
            todasConcluidas ? "Todas as fases concluídas" : "Nenhuma fase criada ainda"
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
