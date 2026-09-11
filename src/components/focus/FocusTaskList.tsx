import { useState } from "react";
import { Search, AlertTriangle, ExternalLink, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PRIORITY_TONE } from "@/components/tasks/TaskBoard";
import {
  useFocusTasks,
  filterFocusTasks,
  FOCUS_TASK_FILTER_LABEL,
  taskCountLabel,
  openFocusTaskDetail,
  completeFocusTask,
  toFocusSelectedTask,
  type FocusTaskFilter,
  type FocusTaskItem,
} from "@/lib/focus-tasks";
import type { FocusSelectedTask } from "@/lib/focus-mode-store";
import { useConfirm } from "@/hooks/use-confirm";

const FILTERS: FocusTaskFilter[] = ["hoje", "atrasadas", "semana", "pessoais", "todas"];

/** Conteúdo da seleção de tarefa — compartilhado pelo painel lateral do
 * desktop e pela folha/gaveta do mobile (item 3/4: mesma lista, dois
 * invólucros diferentes). Busca por nome, filtro rápido, seleção única
 * por sessão, "ver detalhes" (abre o diálogo real via `TaskModalStack`)
 * e "concluir" direto no painel (item 5). */
export function FocusTaskList({
  selected,
  onSelect,
  onFreeSession,
  hasActiveSession,
  onRequestConfirmSwitch,
}: {
  selected: FocusSelectedTask | null;
  onSelect: (task: FocusSelectedTask) => void;
  onFreeSession: () => void;
  hasActiveSession: boolean;
  onRequestConfirmSwitch: (next: () => void) => Promise<void>;
}) {
  const { tasks } = useFocusTasks();
  const [filter, setFilter] = useState<FocusTaskFilter>("todas");
  const [search, setSearch] = useState("");
  const { confirm, confirmDialog } = useConfirm();

  const filtered = filterFocusTasks(tasks, filter, search);

  const handlePick = async (t: FocusTaskItem) => {
    const apply = () => onSelect(toFocusSelectedTask(t));
    if (hasActiveSession && selected?.rawId !== t.rawId) {
      await onRequestConfirmSwitch(apply);
    } else {
      apply();
    }
  };

  const handleComplete = async (t: FocusTaskItem, e: React.MouseEvent) => {
    e.stopPropagation();
    const ok = await confirm(`Marcar "${t.title}" como concluída?`);
    if (!ok) return;
    completeFocusTask(t.rawId);
  };

  return (
    <div className="flex h-full flex-col gap-3">
      {confirmDialog}
      <div>
        <p className="text-sm font-semibold text-white">Escolha sua tarefa</p>
        <p className="text-xs text-white/50">{taskCountLabel(filtered.length)} disponíveis</p>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/40" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar tarefa..."
          className="border-white/10 bg-white/5 pl-8 text-sm text-white placeholder:text-white/40 focus-visible:ring-brand"
        />
      </div>

      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
              filter === f
                ? "border-brand bg-brand text-brand-foreground"
                : "border-white/10 text-white/60 hover:border-white/25 hover:text-white"
            }`}
          >
            {FOCUS_TASK_FILTER_LABEL[f]}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={async () => {
          if (hasActiveSession && selected) await onRequestConfirmSwitch(onFreeSession);
          else onFreeSession();
        }}
        className={`rounded-lg border px-3 py-2 text-left text-xs font-medium transition-colors ${
          !selected
            ? "border-brand bg-brand-subtle text-brand"
            : "border-white/10 text-white/60 hover:border-white/25 hover:text-white"
        }`}
      >
        Continuar em sessão livre (sem tarefa vinculada)
      </button>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
        {filtered.length === 0 && (
          <p className="py-6 text-center text-xs text-white/40">Nenhuma tarefa encontrada.</p>
        )}
        {filtered.map((t) => {
          const isSelected = selected?.rawId === t.rawId;
          const isLate = t.bucket === "atrasada";
          return (
            <div
              key={t.id}
              role="button"
              tabIndex={0}
              onClick={() => void handlePick(t)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  void handlePick(t);
                }
              }}
              className={`group cursor-pointer rounded-lg border p-2.5 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                isSelected
                  ? "border-brand bg-brand-subtle"
                  : "border-white/10 bg-white/[0.03] hover:border-white/25"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 flex-1 truncate font-medium text-white">{t.title}</p>
                {isSelected && (
                  <Check className="h-3.5 w-3.5 shrink-0 text-brand" aria-hidden="true" />
                )}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-white/50">
                <span className="truncate">{t.projectName}</span>
                {t.due && <span>{t.due}</span>}
                {t.priority && <span className={PRIORITY_TONE[t.priority]}>{t.priority}</span>}
                <span>{t.status}</span>
                {isLate && (
                  <span className="inline-flex items-center gap-0.5 font-medium text-danger">
                    <AlertTriangle className="h-3 w-3" /> Atrasada
                  </span>
                )}
              </div>
              <div className="mt-1.5 flex items-center gap-3 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    openFocusTaskDetail(t.rawId);
                  }}
                  className="inline-flex items-center gap-1 text-[11px] text-white/60 hover:text-white"
                >
                  <ExternalLink className="h-3 w-3" /> Ver detalhes
                </button>
                <button
                  type="button"
                  onClick={(e) => void handleComplete(t, e)}
                  className="inline-flex items-center gap-1 text-[11px] text-success hover:underline"
                >
                  <Check className="h-3 w-3" /> Concluir
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function FocusSelectedTaskBadge({
  task,
  onClear,
}: {
  task: FocusSelectedTask | null;
  onClear?: () => void;
}) {
  if (!task) {
    return <span className="text-sm text-white/50">Sessão livre</span>;
  }
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 text-sm text-white">
      <span className="truncate">{task.title}</span>
      {onClear && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-5 w-5 shrink-0 text-white/50 hover:text-white"
          aria-label="Remover tarefa selecionada"
          onClick={onClear}
        >
          <X className="h-3 w-3" />
        </Button>
      )}
    </span>
  );
}
