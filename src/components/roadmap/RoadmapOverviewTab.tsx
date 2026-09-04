import { AlertTriangle, Calendar, CheckCircle2, Clock, Flag, Users } from "lucide-react";
import { Avatar, getTaskAssignees, initialsOf, colorFor, type Task } from "@/components/tasks/TaskBoard";
import { OPEN_STATUSES } from "@/lib/score";
import { todayIsoInBrasilia } from "@/lib/timezone";
import { formatIsoDate } from "@/lib/utils";
import type { Milestone } from "@/lib/projetos";
import {
  faseAtual,
  faseStatusEfetivo,
  FASE_STATUS_LABEL,
  FASE_STATUS_TONE,
  type ProjetoFase,
} from "@/lib/roadmap-engine";

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
 * já está carregado (`fases`+`tasks`+`milestones`), nenhum fetch novo. */
export function RoadmapOverviewTab({
  fases,
  tasks,
  milestones,
  semFase,
  onOpenTask,
}: {
  fases: ProjetoFase[];
  tasks: Task[];
  milestones: Milestone[];
  semFase: Task[];
  onOpenTask: (t: Task) => void;
}) {
  const today = todayIsoInBrasilia();

  const comFase = tasks.filter((t) => t.roadmapPhaseId);
  const concluidasComFase = comFase.filter((t) => t.status === "Concluído").length;
  const progressoGeral =
    comFase.length === 0 ? null : Math.round((concluidasComFase / comFase.length) * 100);

  const atual = faseAtual(fases, tasks);

  const abertasComPrazo = tasks
    .filter((t) => OPEN_STATUSES.has(t.status) && t.dueDate)
    .sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""));
  const proximaEntrega = abertasComPrazo.find((t) => (t.dueDate ?? "") >= today) ?? null;

  const proximoMarco =
    [...milestones]
      .filter((m) => !m.done && m.date >= today)
      .sort((a, b) => a.date.localeCompare(b.date))[0] ?? null;

  const atrasadas = tasks.filter(
    (t) => OPEN_STATUSES.has(t.status) && !!t.dueDate && t.dueDate < today,
  );

  const fasesEmRisco = fases.filter((f) => {
    const s = faseStatusEfetivo(f, tasks);
    return s === "em_risco" || s === "atrasada";
  });

  const responsaveis = Array.from(new Set(tasks.flatMap((t) => getTaskAssignees(t))));

  const inicio = fases.length ? fases.map((f) => f.dataInicio).sort()[0] : null;
  const fim = fases.length ? fases.map((f) => f.dataFim).sort().at(-1) : null;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
          hint={atual ? `${formatIsoDate(atual.dataInicio)} – ${formatIsoDate(atual.dataFim)}` : "Todas as fases concluídas"}
        />
        <StatCard
          icon={<Calendar className="h-3.5 w-3.5" />}
          label="Próxima entrega"
          value={proximaEntrega ? proximaEntrega.title : "—"}
          hint={proximaEntrega?.dueDate ? formatIsoDate(proximaEntrega.dueDate) : undefined}
        />
        <StatCard
          icon={<Flag className="h-3.5 w-3.5" />}
          label="Próximo marco"
          value={proximoMarco?.title ?? "—"}
          hint={proximoMarco ? formatIsoDate(proximoMarco.date) : "Nenhum marco pendente"}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<AlertTriangle className="h-3.5 w-3.5" />}
          label="Tarefas atrasadas"
          value={String(atrasadas.length)}
          tone={atrasadas.length > 0 ? "text-destructive" : undefined}
        />
        <StatCard
          icon={<Clock className="h-3.5 w-3.5" />}
          label="Tarefas sem fase"
          value={String(semFase.length)}
        />
        <StatCard
          icon={<AlertTriangle className="h-3.5 w-3.5" />}
          label="Fases em risco"
          value={String(fasesEmRisco.length)}
          tone={fasesEmRisco.length > 0 ? "text-amber-600 dark:text-amber-400" : undefined}
        />
        <StatCard
          icon={<Calendar className="h-3.5 w-3.5" />}
          label="Período do projeto"
          value={inicio && fim ? `${formatIsoDate(inicio)} – ${formatIsoDate(fim)}` : "—"}
        />
      </div>

      {atrasadas.length > 0 && (
        <div className="rounded-xl border border-border p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Tarefas atrasadas
          </p>
          <div className="space-y-0.5">
            {atrasadas.slice(0, 8).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => onOpenTask(t)}
                className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted/60"
              >
                <span className="min-w-0 flex-1 truncate text-foreground">{t.title}</span>
                <span className="shrink-0 text-destructive">{formatIsoDate(t.dueDate!)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

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

      {responsaveis.length > 0 && (
        <div className="rounded-xl border border-border p-4">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Users className="h-3.5 w-3.5" /> Responsáveis
          </p>
          <div className="flex flex-wrap gap-2">
            {responsaveis.map((a) => (
              <span
                key={a}
                className="inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-1 text-xs text-foreground"
              >
                <Avatar member={{ name: a, initials: initialsOf(a) || "?", color: colorFor(a) }} size={18} />
                {a}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
