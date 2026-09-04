import { useMemo, useState } from "react";
import { Search, AlertTriangle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  getTaskAssignees,
  matchesDeadlinePeriod,
  TASK_PRIORITIES,
  TASK_STATUSES,
  type Task,
  type TaskStatus,
  type TaskPriority,
  type DeadlinePeriodFilter,
  DEADLINE_PERIOD_FILTER_LABEL,
} from "@/components/tasks/TaskBoard";
import type { ProjetoFase } from "@/lib/roadmap-engine";

/**
 * "Vincular tarefas existentes" (item 3 do pedido) — mesmo padrão de
 * busca + checkbox multi-select + contador + confirmar já usado em
 * `PublicoManager.tsx` (marketing/email-campaigns), com filtros extras
 * (status/responsável/prioridade/prazo) reaproveitando os mesmos tipos e
 * `matchesDeadlinePeriod` já usados no filtro do Kanban — nunca uma
 * segunda regra de "tarefa atrasada".
 */
export function LinkTasksPanel({
  open,
  onOpenChange,
  tasks,
  fases,
  targetFaseId,
  onLink,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Todas as tarefas DESTE projeto (com ou sem fase). */
  tasks: Task[];
  fases: ProjetoFase[];
  targetFaseId: string;
  onLink: (taskIds: string[]) => void;
}) {
  const [search, setSearch] = useState("");
  const [statusFilters, setStatusFilters] = useState<TaskStatus[]>([]);
  const [priorityFilters, setPriorityFilters] = useState<TaskPriority[]>([]);
  const [assigneeFilter, setAssigneeFilter] = useState("");
  const [deadlineFilter, setDeadlineFilter] = useState<DeadlinePeriodFilter | "">("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmingMove, setConfirmingMove] = useState(false);

  const allAssignees = useMemo(() => {
    const names = new Set<string>();
    for (const t of tasks) for (const n of getTaskAssignees(t)) names.add(n);
    return Array.from(names).sort();
  }, [tasks]);

  const faseNome = (id?: string) => (id ? fases.find((f) => f.id === id)?.nome : undefined);

  // Tarefas sem fase aparecem primeiro (item 3: "exibir prioritariamente
  // tarefas do mesmo projeto que ainda não possuem uma fase").
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tasks
      .filter((t) => t.roadmapPhaseId !== targetFaseId) // já está aqui, não faz sentido re-selecionar
      .filter((t) => !q || t.title.toLowerCase().includes(q))
      .filter((t) => statusFilters.length === 0 || statusFilters.includes(t.status))
      .filter((t) => priorityFilters.length === 0 || priorityFilters.includes(t.priority))
      .filter((t) => !assigneeFilter || getTaskAssignees(t).includes(assigneeFilter))
      .filter((t) => !deadlineFilter || matchesDeadlinePeriod(t, deadlineFilter))
      .sort((a, b) => Number(!!a.roadmapPhaseId) - Number(!!b.roadmapPhaseId));
  }, [tasks, targetFaseId, search, statusFilters, priorityFilters, assigneeFilter, deadlineFilter]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const selectedWithOtherFase = Array.from(selected).filter((id) => {
    const t = tasks.find((x) => x.id === id);
    return !!t?.roadmapPhaseId;
  });

  const reset = () => {
    setSearch("");
    setStatusFilters([]);
    setPriorityFilters([]);
    setAssigneeFilter("");
    setDeadlineFilter("");
    setSelected(new Set());
    setConfirmingMove(false);
  };

  const confirmLink = () => {
    if (selected.size === 0) return;
    if (selectedWithOtherFase.length > 0 && !confirmingMove) {
      setConfirmingMove(true);
      return;
    }
    onLink(Array.from(selected));
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent mobileFullScreen className="flex max-h-[85vh] max-w-lg flex-col gap-0 p-0">
        <DialogHeader className="border-b border-border px-6 py-4">
          <DialogTitle className="text-base">Vincular tarefas existentes</DialogTitle>
        </DialogHeader>

        <div className="border-b border-border px-6 py-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome..."
              className="h-8 w-full rounded-md border border-input bg-background pl-8 pr-2.5 text-xs outline-none focus:border-ring focus:ring-1 focus:ring-ring"
            />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <select
              value={assigneeFilter}
              onChange={(e) => setAssigneeFilter(e.target.value)}
              className="h-7 cursor-pointer rounded-md border border-border bg-background px-2 text-[11px] outline-none"
            >
              <option value="">Todos responsáveis</option>
              {allAssignees.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <select
              value={deadlineFilter}
              onChange={(e) => setDeadlineFilter(e.target.value as DeadlinePeriodFilter | "")}
              className="h-7 cursor-pointer rounded-md border border-border bg-background px-2 text-[11px] outline-none"
            >
              <option value="">Qualquer prazo</option>
              {(Object.keys(DEADLINE_PERIOD_FILTER_LABEL) as DeadlinePeriodFilter[]).map((k) => (
                <option key={k} value={k}>
                  {DEADLINE_PERIOD_FILTER_LABEL[k]}
                </option>
              ))}
            </select>
            {TASK_STATUSES.map((s) => {
              const active = statusFilters.includes(s);
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() =>
                    setStatusFilters((prev) =>
                      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s],
                    )
                  }
                  className={`cursor-pointer rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors ${
                    active
                      ? "bg-foreground text-background"
                      : "bg-muted/50 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {s}
                </button>
              );
            })}
            {TASK_PRIORITIES.map((p) => {
              const active = priorityFilters.includes(p);
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() =>
                    setPriorityFilters((prev) =>
                      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p],
                    )
                  }
                  className={`cursor-pointer rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors ${
                    active
                      ? "bg-foreground text-background"
                      : "bg-muted/50 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {p}
                </button>
              );
            })}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
          {filtered.length === 0 ? (
            <p className="p-4 text-center text-xs text-muted-foreground">
              Nenhuma tarefa encontrada.
            </p>
          ) : (
            filtered.map((t) => (
              <label
                key={t.id}
                className="flex cursor-pointer items-start gap-2 rounded-md px-2.5 py-2 text-xs hover:bg-muted/60"
              >
                <input
                  type="checkbox"
                  checked={selected.has(t.id)}
                  onChange={() => toggle(t.id)}
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-border accent-foreground"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-foreground">{t.title}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {t.status} · {t.priority}
                    {t.roadmapPhaseId && (
                      <span className="ml-1 text-amber-600 dark:text-amber-400">
                        · já está em "{faseNome(t.roadmapPhaseId) ?? "outra fase"}"
                      </span>
                    )}
                  </p>
                </div>
              </label>
            ))
          )}
        </div>

        {confirmingMove && (
          <div className="flex items-start gap-2 border-t border-amber-500/30 bg-amber-500/5 px-6 py-3 text-xs text-amber-700 dark:text-amber-400">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <p>
              {selectedWithOtherFase.length === 1
                ? "1 tarefa selecionada já pertence a outra fase e será movida pra esta."
                : `${selectedWithOtherFase.length} tarefas selecionadas já pertencem a outra fase e serão movidas pra esta.`}
            </p>
          </div>
        )}

        <DialogFooter className="flex items-center justify-between border-t border-border px-6 py-3.5 sm:justify-between">
          <p className="text-[11px] text-muted-foreground">{selected.size} selecionada(s)</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="cursor-pointer rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={confirmLink}
              disabled={selected.size === 0}
              className="cursor-pointer rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {confirmingMove ? "Confirmar e mover" : "Vincular tarefas"}
            </button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
