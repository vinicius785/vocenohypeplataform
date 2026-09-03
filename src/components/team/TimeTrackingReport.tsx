import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { DateField } from "@/components/ui/date-field";
import { initialsOf, colorFor } from "@/components/tasks/TaskBoard";
import { useTeamTimeEntries, type TaskOrigin } from "@/lib/time-entries";
import { loadProjetos } from "@/lib/projetos";
import { getAllCampanhaTarefas } from "@/lib/campanha-scoped-store";
import { loadStandalone } from "@/lib/marketing-tasks";

type ReportMember = { id: string; name: string; photo?: string };

type Props = {
  members: ReportMember[];
  meId: string | null;
  isAdmin: boolean;
};

type TimePeriodMode = "hoje" | "semana" | "mes" | "personalizado";

const TIME_PERIOD_OPTIONS: { value: TimePeriodMode; label: string }[] = [
  { value: "hoje", label: "Hoje" },
  { value: "semana", label: "Esta semana" },
  { value: "mes", label: "Este mês" },
  { value: "personalizado", label: "Período personalizado" },
];

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}
function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}
function startOfMonthISO(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}
function startOfWeekISO(): string {
  const d = new Date();
  const dow = d.getDay();
  // Segunda-feira como início — mesma convenção de "semana" já usada em
  // outros seletores de período do app.
  const diff = dow === 0 ? 6 : dow - 1;
  return isoDaysAgo(diff);
}

function formatHours(totalSeconds: number): string {
  const h = totalSeconds / 3600;
  return `${h.toFixed(1)}h`;
}

/** Título de uma tarefa pelo id+origem, buscando nos 3 stores de
 * tarefa — só pra exibição neste relatório, não navega pra lugar
 * nenhum (v1 é só visibilidade agregada). */
function resolveTaskTitle(taskId: string, taskOrigin: TaskOrigin): string {
  type MinimalTask = { id: string; title: string; subtasks?: MinimalTask[] };
  const findTitle = (list: MinimalTask[]): string | null => {
    for (const t of list) {
      if (t.id === taskId) return t.title;
      const nested = findTitle(t.subtasks ?? []);
      if (nested) return nested;
    }
    return null;
  };
  if (taskOrigin === "projeto") {
    for (const p of loadProjetos()) {
      const title = findTitle((p.tasks ?? []) as MinimalTask[]);
      if (title) return title;
    }
  } else if (taskOrigin === "campanha") {
    for (const [, tasks] of getAllCampanhaTarefas()) {
      const title = findTitle(tasks as MinimalTask[]);
      if (title) return title;
    }
  } else {
    const title = findTitle(loadStandalone() as unknown as MinimalTask[]);
    if (title) return title;
  }
  return "Tarefa removida";
}

export function TimeTrackingReport({ members, meId, isAdmin }: Props) {
  const [periodMode, setPeriodMode] = useState<TimePeriodMode>("semana");
  const [customFrom, setCustomFrom] = useState(todayISO());
  const [customTo, setCustomTo] = useState(todayISO());
  const [viewMode, setViewMode] = useState<"pessoa" | "tarefa">("pessoa");
  const [expandedPerson, setExpandedPerson] = useState<string | null>(null);
  const [expandedTask, setExpandedTask] = useState<string | null>(null);

  const range = useMemo(() => {
    if (periodMode === "hoje") return { from: todayISO(), to: todayISO() };
    if (periodMode === "semana") return { from: startOfWeekISO(), to: todayISO() };
    if (periodMode === "mes") return { from: startOfMonthISO(), to: todayISO() };
    return { from: customFrom, to: customTo };
  }, [periodMode, customFrom, customTo]);

  // Sem a permissão "time" (que já é o próprio gate de ver esta aba —
  // não existe um terceiro nível "vê a equipe mas não corrige" neste
  // sistema de permissões), a leitura já vem só das próprias linhas via
  // RLS — passar o próprio id restringe explicitamente no cliente
  // também, pra não desenhar uma tabela com todo mundo vazio.
  const scopedUserId = isAdmin ? undefined : (meId ?? undefined);
  const { entries, loading } = useTeamTimeEntries(range, scopedUserId);

  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);

  const byPerson = useMemo(() => {
    const map = new Map<string, { total: number; entries: typeof entries }>();
    for (const e of entries) {
      const cur = map.get(e.userId) ?? { total: 0, entries: [] };
      cur.total += e.durationSeconds ?? 0;
      cur.entries.push(e);
      map.set(e.userId, cur);
    }
    return Array.from(map.entries())
      .map(([userId, v]) => ({ userId, ...v }))
      .sort((a, b) => b.total - a.total);
  }, [entries]);

  const byTask = useMemo(() => {
    const map = new Map<
      string,
      { taskId: string; taskOrigin: TaskOrigin; total: number; entries: typeof entries }
    >();
    for (const e of entries) {
      const key = `${e.taskOrigin}:${e.taskId}`;
      const cur = map.get(key) ?? {
        taskId: e.taskId,
        taskOrigin: e.taskOrigin,
        total: 0,
        entries: [],
      };
      cur.total += e.durationSeconds ?? 0;
      cur.entries.push(e);
      map.set(key, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [entries]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={periodMode}
          onChange={(e) => setPeriodMode(e.target.value as TimePeriodMode)}
          className="h-8 cursor-pointer rounded-md border border-border bg-background px-2 text-xs outline-none focus:ring-2 focus:ring-ring"
        >
          {TIME_PERIOD_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {periodMode === "personalizado" && (
          <div className="flex items-center gap-1.5">
            <DateField
              value={customFrom}
              onChange={(v) => setCustomFrom(v ?? customFrom)}
              max={customTo}
              className="h-8 text-xs"
            />
            <span className="text-xs text-muted-foreground">até</span>
            <DateField
              value={customTo}
              onChange={(v) => setCustomTo(v ?? customTo)}
              min={customFrom}
              className="h-8 text-xs"
            />
          </div>
        )}
        {isAdmin && (
          <div className="ml-auto flex items-center gap-1 rounded-md border border-border p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setViewMode("pessoa")}
              className={`cursor-pointer rounded-sm px-2 py-1 ${viewMode === "pessoa" ? "bg-muted font-medium" : "text-muted-foreground"}`}
            >
              Por pessoa
            </button>
            <button
              type="button"
              onClick={() => setViewMode("tarefa")}
              className={`cursor-pointer rounded-sm px-2 py-1 ${viewMode === "tarefa" ? "bg-muted font-medium" : "text-muted-foreground"}`}
            >
              Por tarefa
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum registro de tempo neste período.</p>
      ) : viewMode === "pessoa" ? (
        <div className="space-y-1">
          {byPerson.map(({ userId, total, entries: personEntries }) => {
            const member = memberById.get(userId);
            const isOpen = expandedPerson === userId;
            const byTaskForPerson = new Map<string, { title: string; total: number }>();
            for (const e of personEntries) {
              const key = `${e.taskOrigin}:${e.taskId}`;
              const cur = byTaskForPerson.get(key) ?? {
                title: resolveTaskTitle(e.taskId, e.taskOrigin),
                total: 0,
              };
              cur.total += e.durationSeconds ?? 0;
              byTaskForPerson.set(key, cur);
            }
            return (
              <div key={userId} className="rounded-md border border-border">
                <button
                  type="button"
                  onClick={() => setExpandedPerson(isOpen ? null : userId)}
                  className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/50"
                >
                  {isOpen ? (
                    <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  )}
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-medium ${colorFor(member?.name ?? userId)}`}
                  >
                    {initialsOf(member?.name ?? "?") || "?"}
                  </span>
                  <span className="flex-1 truncate font-medium">{member?.name ?? "Ex-membro"}</span>
                  <span className="tabular-nums text-muted-foreground">{formatHours(total)}</span>
                </button>
                {isOpen && (
                  <div className="space-y-1 border-t border-border px-3 py-2">
                    {Array.from(byTaskForPerson.values())
                      .sort((a, b) => b.total - a.total)
                      .map((t) => (
                        <div key={t.title} className="flex items-center justify-between text-xs">
                          <span className="truncate text-muted-foreground">{t.title}</span>
                          <span className="tabular-nums text-muted-foreground">
                            {formatHours(t.total)}
                          </span>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="space-y-1">
          {byTask.map(({ taskId, taskOrigin, total, entries: taskEntries }) => {
            const key = `${taskOrigin}:${taskId}`;
            const isOpen = expandedTask === key;
            const byPersonForTask = new Map<string, number>();
            for (const e of taskEntries) {
              byPersonForTask.set(
                e.userId,
                (byPersonForTask.get(e.userId) ?? 0) + (e.durationSeconds ?? 0),
              );
            }
            return (
              <div key={key} className="rounded-md border border-border">
                <button
                  type="button"
                  onClick={() => setExpandedTask(isOpen ? null : key)}
                  className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/50"
                >
                  {isOpen ? (
                    <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  )}
                  <span className="flex-1 truncate font-medium">
                    {resolveTaskTitle(taskId, taskOrigin)}
                  </span>
                  <span className="tabular-nums text-muted-foreground">{formatHours(total)}</span>
                </button>
                {isOpen && (
                  <div className="space-y-1 border-t border-border px-3 py-2">
                    {Array.from(byPersonForTask.entries())
                      .sort((a, b) => b[1] - a[1])
                      .map(([userId, secs]) => (
                        <div key={userId} className="flex items-center justify-between text-xs">
                          <span className="truncate text-muted-foreground">
                            {memberById.get(userId)?.name ?? "Ex-membro"}
                          </span>
                          <span className="tabular-nums text-muted-foreground">
                            {formatHours(secs)}
                          </span>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
