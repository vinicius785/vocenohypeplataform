import { useEffect, useMemo, useRef } from "react";
import { Search } from "lucide-react";
import { Highlighted } from "./MentionAutocomplete";
import { loadMembers } from "@/lib/chat-store";
import type { MentionOption } from "@/lib/mention-kinds";
import type { ReferenceView } from "@/lib/reference-picker";
import { TASK_STATUS_DOT } from "@/lib/task-status";
import { isTaskStatus } from "@/components/tasks/task-ui";
import { cn } from "@/lib/utils";

/** Bolinha de status — MESMA paleta (`TASK_STATUS_DOT`) do Kanban e do detalhe da tarefa. */
export function TaskStatusDot({ status, className }: { status?: string; className?: string }) {
  const s = status && isTaskStatus(status) ? status : "Aberto";
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block h-2.5 w-2.5 shrink-0 rounded-full",
        TASK_STATUS_DOT[s],
        className,
      )}
    />
  );
}

function Assignee({ ids }: { ids?: string[] }) {
  const members = useMemo(() => loadMembers(), []);
  const first = ids?.map((id) => members.find((m) => m.id === id)).find(Boolean);
  if (!first) {
    return (
      <span
        title="Sem responsável"
        className="h-5 w-5 shrink-0 rounded-full border border-dashed border-border"
      />
    );
  }
  const extra = (ids?.length ?? 1) - 1;
  const title = first.name + (extra > 0 ? ` e mais ${extra}` : "");
  return first.photo ? (
    <img
      src={first.photo}
      alt={first.name}
      title={title}
      className="h-5 w-5 shrink-0 rounded-full object-cover"
    />
  ) : (
    <span
      title={title}
      className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-muted text-[10px] font-medium text-text-secondary"
    >
      {first.name.trim()[0]?.toUpperCase() ?? "?"}
    </span>
  );
}

/** Contexto secundário só quando agrega ("Projeto: X"). */
function secondary(hint?: string): string | null {
  return hint && /[:·]/.test(hint) ? hint : null;
}

/**
 * Seletor de TAREFAS do `#` (referência), no estilo de ferramentas de tarefa: bolinha com a cor
 * REAL do status, título em destaque, projeto/contexto abaixo e a foto do responsável à direita.
 * Sem texto mostra recentes + sugeridas. Teclado (↑↓ Enter Esc) é do textarea.
 */
export function EntityReferencePicker({
  view,
  query,
  highlighted,
  onPick,
  onHover,
  style,
}: {
  view: ReferenceView;
  query: string;
  highlighted: number;
  onPick: (o: MentionOption) => void;
  onHover: (index: number) => void;
  style?: React.CSSProperties;
}) {
  const listRef = useRef<HTMLUListElement>(null);
  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-row="${highlighted}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [highlighted, view]);

  let index = -1;
  return (
    <div
      role="listbox"
      aria-label="Tarefas"
      style={style}
      className="absolute bottom-full z-20 mb-1 w-96 max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-border bg-popover shadow-lg"
    >
      <div className="flex items-center gap-2 border-b border-border px-3 py-2 text-sm">
        <Search className="h-3.5 w-3.5 shrink-0 text-text-secondary" />
        <span className={cn("min-w-0 truncate", query ? "text-foreground" : "text-text-secondary")}>
          {query || "Buscar tarefa..."}
        </span>
      </div>
      {view.items.length === 0 ? (
        <p className="px-3 py-4 text-center text-sm text-text-secondary">
          Nenhuma tarefa encontrada.
        </p>
      ) : (
        <ul
          ref={listRef}
          className="max-h-[min(20rem,45vh)] overflow-y-auto overscroll-contain pb-1"
        >
          {view.sections.map((sec) => (
            <li key={sec.key} role="presentation">
              <p className="px-3 pb-0.5 pt-2 text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
                {sec.label}
              </p>
              <ul>
                {sec.items.map((o) => {
                  index += 1;
                  const i = index;
                  const sub = secondary(o.hint);
                  return (
                    <li key={o.id}>
                      <button
                        type="button"
                        role="option"
                        data-row={i}
                        aria-selected={i === highlighted}
                        onMouseDown={(e) => e.preventDefault()}
                        onMouseEnter={() => onHover(i)}
                        onClick={() => onPick(o)}
                        className={cn(
                          "flex w-full items-center gap-2.5 px-3 py-1.5 text-left",
                          i === highlighted ? "bg-muted" : "hover:bg-muted/60",
                        )}
                      >
                        <TaskStatusDot status={o.status} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-foreground">
                            <Highlighted text={o.label} query={query} />
                          </span>
                          {sub && (
                            <span className="block truncate text-xs text-text-secondary">
                              {sub}
                            </span>
                          )}
                        </span>
                        <Assignee ids={o.assigneeIds} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
