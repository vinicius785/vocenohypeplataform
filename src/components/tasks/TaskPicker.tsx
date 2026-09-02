import { useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { matchScore } from "@/lib/mention-kinds";
import { useTaskDirectory, type TaskDirectoryEntry } from "@/lib/task-directory";
import { TASK_STATUS_DOT, type TaskStatus } from "@/lib/task-status";

const MAX_RESULTS = 30;

/** Prioridade de exibição quando a busca está vazia (ou como desempate
 * quando o score de busca é igual): tarefas do mesmo projeto/campanha da
 * tarefa atual primeiro, depois qualquer tarefa ativa, por último as já
 * concluídas — nunca escondidas, só com menos destaque (ver `TaskPickerRow`). */
function priorityRank(
  t: TaskDirectoryEntry,
  currentProjectId?: string,
  currentCampanhaId?: string,
): number {
  const sameContext =
    (!!currentProjectId && t.projectId === currentProjectId) ||
    (!!currentCampanhaId && t.campanhaId === currentCampanhaId);
  const completed = t.status === "Concluído";
  if (sameContext && !completed) return 0;
  if (sameContext && completed) return 1;
  if (!completed) return 2;
  return 3;
}

/** Uma linha de resultado do seletor — status (mesma paleta de
 * `TASK_STATUS_DOT`, usada no Kanban e no modal de tarefa) antes do nome,
 * projeto como informação secundária abaixo. Área clicável é a linha
 * inteira. Tarefas concluídas continuam aparecendo (podem virar
 * dependência normalmente), só com menos destaque visual. */
function TaskPickerRow({
  entry,
  highlighted,
  onPick,
}: {
  entry: TaskDirectoryEntry;
  highlighted: boolean;
  onPick: () => void;
}) {
  const completed = entry.status === "Concluído";
  return (
    <button
      type="button"
      onMouseDown={(e) => {
        e.preventDefault();
        onPick();
      }}
      className={`flex w-full items-start gap-2 rounded px-2 py-1.5 text-left ${
        highlighted ? "bg-muted" : "hover:bg-muted/60"
      } ${completed ? "opacity-60" : ""}`}
    >
      <span
        className={`mt-1 h-2 w-2 shrink-0 rounded-full ${TASK_STATUS_DOT[(entry.status as TaskStatus) ?? "Aberto"] ?? "bg-muted-foreground/50"}`}
      />
      <span className="min-w-0 flex-1">
        <span
          className={`block truncate text-xs ${completed ? "text-muted-foreground line-through" : "text-foreground"}`}
        >
          {entry.label}
        </span>
        {entry.project && (
          <span className="block truncate text-[10.5px] text-muted-foreground">
            Projeto: {entry.project}
          </span>
        )}
      </span>
    </button>
  );
}

/** Seletor de tarefas reaproveitando a mesma busca do @menção do Chat
 * (`matchScore`), com visual próprio (status + nome + projeto em vez do
 * ícone genérico do Chat) — usado hoje só por Dependências, escrito sem
 * acoplamento a texto/chat: o `onSelect` recebe a tarefa escolhida direto,
 * sem passar por inserir `"@label"` num textarea. */
export function TaskPicker({
  excludeTaskId,
  currentProjectId,
  currentCampanhaId,
  onSelect,
}: {
  /** `rawId` da tarefa aberta — nunca aparece nos resultados. */
  excludeTaskId: string;
  /** Contexto da tarefa atual, só pra priorizar (não filtrar) tarefas do
   * mesmo projeto/campanha nos resultados sem busca. */
  currentProjectId?: string;
  currentCampanhaId?: string;
  onSelect: (task: TaskDirectoryEntry) => void;
}) {
  const directory = useTaskDirectory();
  const [query, setQuery] = useState("");
  const [highlighted, setHighlighted] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const hasQuery = query.trim().length > 0;

  const results = useMemo(() => {
    const pool = directory.filter((t) => t.rawId !== excludeTaskId);
    const rank = (t: TaskDirectoryEntry) => priorityRank(t, currentProjectId, currentCampanhaId);
    if (!hasQuery) {
      // Sem busca: aproxima "mais recentes primeiro" invertendo a ordem de
      // inserção do diretório antes de aplicar a prioridade (mesmo projeto
      // > ativas > concluídas) — `sort` é estável, então a ordem relativa
      // dentro de cada nível de prioridade continua sendo a mais recente
      // primeiro.
      return [...pool]
        .reverse()
        .sort((a, b) => rank(a) - rank(b))
        .slice(0, MAX_RESULTS);
    }
    return pool
      .map((t) => ({ t, score: matchScore(t.label, query) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || rank(a.t) - rank(b.t))
      .slice(0, MAX_RESULTS)
      .map((x) => x.t);
  }, [directory, excludeTaskId, query, hasQuery, currentProjectId, currentCampanhaId]);

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
      <div
        className="max-h-64 overflow-y-auto p-1"
        // O modal de tarefa (Dialog) trava o scroll da página inteira
        // enquanto está aberto; como este popover é renderizado num Portal
        // fora da árvore do Dialog, o navegador não associa esta lista à
        // área "com permissão pra rolar" e o wheel do mouse era ignorado
        // aqui (mesmo a lista tendo overflow real). Aplica o delta do
        // wheel manualmente no scroll da própria lista.
        onWheel={(e) => {
          e.currentTarget.scrollTop += e.deltaY;
          e.stopPropagation();
        }}
      >
        <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {hasQuery ? "Resultados" : "Tarefas recentes"}
        </p>
        {results.length === 0 ? (
          <p className="px-2 py-3 text-center text-xs text-muted-foreground">
            Nenhuma tarefa encontrada.
          </p>
        ) : (
          results.map((t, i) => (
            <TaskPickerRow
              key={t.rawId}
              entry={t}
              highlighted={i === highlighted}
              onPick={() => pick(t)}
            />
          ))
        )}
      </div>
    </div>
  );
}
