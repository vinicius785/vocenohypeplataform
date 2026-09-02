import { useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { matchScore } from "@/lib/mention-kinds";
import type { MentionOption } from "@/lib/mention-kinds";
import { MentionResultRow } from "@/components/ChatSection";
import { useTaskDirectory, type TaskDirectoryEntry } from "@/lib/task-directory";

const MAX_RESULTS = 30;

/** Seletor de tarefas reaproveitando a mesma busca/visual do @menção do
 * Chat (`MentionResultRow`/`MentionResultIcon`, `matchScore`) — usado
 * hoje só por Dependências, mas escrito sem acoplamento a texto/chat: o
 * `onSelect` recebe a tarefa escolhida direto, sem passar por inserir
 * `"@label"` num textarea. */
export function TaskPicker({
  excludeTaskId,
  onSelect,
}: {
  /** `rawId` da tarefa aberta — nunca aparece nos resultados. */
  excludeTaskId: string;
  onSelect: (task: TaskDirectoryEntry) => void;
}) {
  const directory = useTaskDirectory();
  const [query, setQuery] = useState("");
  const [highlighted, setHighlighted] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => {
    const pool = directory.filter((t) => t.rawId !== excludeTaskId);
    if (!query.trim()) {
      // Sem busca: até N mais recentes primeiro (aproximação razoável de
      // "recentes" sem precisar de um campo de "última interação").
      return pool.slice(-MAX_RESULTS).reverse();
    }
    return pool
      .map((t) => ({ t, score: matchScore(t.label, query) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_RESULTS)
      .map((x) => x.t);
  }, [directory, excludeTaskId, query]);

  const toOption = (t: TaskDirectoryEntry): MentionOption => ({
    kind: "task",
    id: t.rawId,
    label: t.label,
    hint: t.project ? `Projeto: ${t.project}` : undefined,
  });

  const pick = (t: TaskDirectoryEntry) => onSelect(t);

  return (
    <div className="w-full">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <input
          ref={inputRef}
          autoFocus
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setHighlighted(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setHighlighted((h) => Math.min(h + 1, results.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setHighlighted((h) => Math.max(h - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              const t = results[highlighted];
              if (t) pick(t);
            }
          }}
          placeholder="Buscar tarefas..."
          className="h-6 w-full bg-transparent text-xs outline-none placeholder:text-muted-foreground"
        />
      </div>
      <div className="max-h-64 overflow-y-auto p-1">
        {!query.trim() && (
          <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Tarefas recentes
          </p>
        )}
        {results.length === 0 ? (
          <p className="px-2 py-3 text-center text-xs text-muted-foreground">
            Nenhuma tarefa encontrada.
          </p>
        ) : (
          results.map((t, i) => (
            <MentionResultRow
              key={t.rawId}
              opt={toOption(t)}
              highlighted={i === highlighted}
              onPick={() => pick(t)}
            />
          ))
        )}
      </div>
    </div>
  );
}
