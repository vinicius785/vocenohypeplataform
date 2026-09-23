import { type Task } from "@/components/tasks/TaskBoard";
import { OPEN_STATUSES } from "@/lib/score";
import { todayIsoInBrasilia } from "@/lib/timezone";
import {
  faseAtual,
  faseDomId,
  faseStatusEfetivo,
  faseTaskCounts,
  roadmapProgressoGeral,
  type ProjetoFase,
} from "@/lib/roadmap-engine";
import { formatIsoDate } from "@/lib/utils";

function scrollToFase(faseId: string) {
  const el = document.getElementById(faseDomId(faseId));
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.add("ring-2", "ring-brand");
  setTimeout(() => el.classList.remove("ring-2", "ring-brand"), 1200);
}

/**
 * Resumo do Roadmap — uma faixa compacta só (item 2 do pedido),
 * substituindo os 5 cards grandes + a caixa "Fases que precisam de
 * atenção" da versão anterior. "Fase atual" e seu período aparecem uma
 * vez só, aqui — o cabeçalho do projeto não repete mais essa informação
 * (ver `projeto.$id.tsx`).
 */
export function RoadmapOverviewTab({ fases, tasks }: { fases: ProjetoFase[]; tasks: Task[] }) {
  const { pct: progressoGeral } = roadmapProgressoGeral(fases, tasks);

  const atual = faseAtual(fases, tasks);
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
  // Cada tarefa pertence a no máximo uma fase (`roadmapPhaseId` é um
  // ponteiro único) — somar `atrasadas` por fase nunca duplica a mesma
  // tarefa entre fases diferentes.
  let primeiraFaseComAtraso: ProjetoFase | null = null;
  const tarefasAtrasadas = fases.reduce((sum, f) => {
    const { atrasadas } = faseTaskCounts(f, tasks);
    if (atrasadas > 0 && !primeiraFaseComAtraso) primeiraFaseComAtraso = f;
    return sum + atrasadas;
  }, 0);

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2.5 rounded-xl border border-border bg-card px-4 py-3">
      <div className="flex shrink-0 items-center gap-2">
        <div className="h-1.5 w-14 shrink-0 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-brand transition-[width]"
            style={{ width: `${progressoGeral ?? 0}%` }}
          />
        </div>
        <span className="whitespace-nowrap text-sm font-semibold text-foreground">
          {progressoGeral === null ? "Sem tarefas no roadmap" : `${progressoGeral}% concluído`}
        </span>
      </div>

      <span className="hidden h-4 w-px shrink-0 bg-border sm:block" />

      <p className="min-w-0 text-sm text-muted-foreground">
        <span className="font-medium text-foreground">Fase atual:</span>{" "}
        {todasConcluidas ? (
          "Roadmap concluído"
        ) : atual ? (
          <>
            {atual.nome}
            <span className="text-xs">
              {" "}
              · {formatIsoDate(atual.dataInicio)}–{formatIsoDate(atual.dataFim)}
            </span>
          </>
        ) : (
          "Nenhuma fase em andamento"
        )}
      </p>

      {proximaEntrega && (
        <>
          <span className="hidden h-4 w-px shrink-0 bg-border sm:block" />
          <p className="min-w-0 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Próxima entrega:</span>{" "}
            {proximaEntrega.title} · {formatIsoDate(proximaEntrega.dueDate!)}
          </p>
        </>
      )}

      {(fasesEmRisco.length > 0 || tarefasAtrasadas > 0) && (
        <>
          <span className="hidden h-4 w-px shrink-0 bg-border sm:block" />
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            {fasesEmRisco.length > 0 && (
              <button
                type="button"
                onClick={() => scrollToFase(fasesEmRisco[0].id)}
                className="font-medium text-warning-soft-foreground hover:underline"
              >
                {fasesEmRisco.length}{" "}
                {fasesEmRisco.length === 1 ? "fase em risco" : "fases em risco"}
              </button>
            )}
            {tarefasAtrasadas > 0 && (
              <button
                type="button"
                onClick={() => primeiraFaseComAtraso && scrollToFase(primeiraFaseComAtraso.id)}
                className="font-medium text-destructive hover:underline"
              >
                {tarefasAtrasadas}{" "}
                {tarefasAtrasadas === 1 ? "tarefa atrasada" : "tarefas atrasadas"}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
