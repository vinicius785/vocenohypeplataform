import { useMemo, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Clock } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DateField } from "@/components/ui/date-field";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { TASK_STATUS_TONE, TASK_STATUS_DOT } from "@/components/tasks/TaskBoard";
import { avatarAccent, initialsOf } from "./member-ui";
import { StartOfDayHistoryDialog } from "./StartOfDayHistoryDialog";
import { useTeamTimeEntries, type TaskOrigin, type TimeEntry } from "@/lib/time-entries";
import { loadProjetos, getTaskAssignees } from "@/lib/projetos";
import { getAllCampanhaTarefas } from "@/lib/campanha-scoped-store";
import { loadStandalone } from "@/lib/marketing-tasks";
import { todayIsoInBrasilia, startOfWeekIsoBrasilia, nowHHMMInBrasilia } from "@/lib/timezone";
import { formatIsoDate, parseIsoDateLocal, formatDateToIso } from "@/lib/utils";
import type { Member } from "@/components/TimeSection";

type PeriodMode = "hoje" | "semana" | "mes" | "personalizado";
type ViewMode = "pessoa" | "tarefa";
type MemberStatus = "trabalhando" | "pausado" | "finalizado" | "nao-iniciou" | "sem-registro";

const PERIOD_OPTIONS: { value: PeriodMode; label: string }[] = [
  { value: "hoje", label: "Hoje" },
  { value: "semana", label: "Esta semana" },
  { value: "mes", label: "Este mês" },
  { value: "personalizado", label: "Período personalizado" },
];

const STATUS_META: Record<MemberStatus, { label: string; dotClass: string; textClass: string }> = {
  trabalhando: { label: "Trabalhando", dotClass: "bg-success", textClass: "text-success" },
  pausado: { label: "Pausado", dotClass: "bg-warning", textClass: "text-warning" },
  finalizado: { label: "Finalizado", dotClass: "bg-border", textClass: "text-text-secondary" },
  "nao-iniciou": { label: "Não iniciou", dotClass: "bg-border", textClass: "text-text-secondary" },
  "sem-registro": {
    label: "Sem registro",
    dotClass: "bg-border",
    textClass: "text-text-secondary/60",
  },
};

function addDaysIso(iso: string, days: number): string {
  const d = parseIsoDateLocal(iso);
  d.setDate(d.getDate() + days);
  return formatDateToIso(d);
}
function addMonthsIso(iso: string, months: number, day: 1 | "end"): string {
  const d = parseIsoDateLocal(iso);
  const target = new Date(d.getFullYear(), d.getMonth() + months, 1);
  if (day === "end") target.setMonth(target.getMonth() + 1, 0);
  return formatDateToIso(target);
}
function formatHours(totalSeconds: number): string {
  return `${(totalSeconds / 3600).toFixed(1)}h`;
}
function formatHM(iso: string): string {
  return nowHHMMInBrasilia(new Date(iso));
}
function localDateOf(iso: string): string {
  return todayIsoInBrasilia(new Date(iso));
}

type ResolvedTaskInfo = {
  title: string;
  projectName: string;
  status?: string;
  assignees: string[];
};

function resolveTaskInfo(
  taskId: string,
  taskOrigin: TaskOrigin,
  campanhaNames: Map<string, string>,
): ResolvedTaskInfo {
  type MinimalTask = {
    id: string;
    title: string;
    status?: string;
    assignee?: string;
    assignees?: string[];
    subtasks?: MinimalTask[];
  };
  const find = (list: MinimalTask[]): MinimalTask | null => {
    for (const t of list) {
      if (t.id === taskId) return t;
      const nested = find(t.subtasks ?? []);
      if (nested) return nested;
    }
    return null;
  };
  if (taskOrigin === "projeto") {
    for (const p of loadProjetos()) {
      const found = find((p.tasks ?? []) as unknown as MinimalTask[]);
      if (found)
        return {
          title: found.title,
          projectName: p.name,
          status: found.status,
          assignees: getTaskAssignees(found),
        };
    }
  } else if (taskOrigin === "campanha") {
    for (const [campanhaId, tasks] of getAllCampanhaTarefas()) {
      const found = find(tasks as unknown as MinimalTask[]);
      if (found)
        return {
          title: found.title,
          projectName: campanhaNames.get(campanhaId) ?? "Campanha",
          status: found.status,
          assignees: getTaskAssignees(found),
        };
    }
  } else {
    const found = find(loadStandalone() as unknown as MinimalTask[]);
    if (found)
      return {
        title: found.title,
        projectName: "Marketing",
        status: found.status,
        assignees: getTaskAssignees(found),
      };
  }
  return { title: "Tarefa removida", projectName: "—", assignees: [] };
}

function StatusPill({ status }: { status: MemberStatus }) {
  const meta = STATUS_META[status];
  return (
    <span
      title={meta.label}
      className={`flex shrink-0 items-center gap-1.5 text-xs font-medium ${meta.textClass}`}
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${meta.dotClass}`} />
      <span className="hidden sm:inline">{meta.label}</span>
    </span>
  );
}

/**
 * "Jornada e horas trabalhadas" — fusão de "Início do dia" (status ao
 * vivo de hoje) com o antigo relatório de horas (`TimeTrackingReport`,
 * removido junto com a subpágina "Horas trabalhadas"). O status por
 * membro (Trabalhando/Pausado/Finalizado/Não iniciou/Sem registro) é
 * sempre relativo a HOJE (ao vivo), independente do período escolhido pra
 * ver horas/dias — só assim "trabalhando agora" e "não iniciou" continuam
 * fazendo sentido mesmo com "Este mês" selecionado. Pra um dia PASSADO
 * (via período personalizado), "agora" não se aplica: o status vira
 * Finalizado/Sem registro conforme houve ou não registro naquele dia.
 */
export function TeamJourneyAndHours({
  members,
  meId,
  isAdmin,
  campanhaNames,
  onOpenMember,
}: {
  /** Já filtrados pela busca do topo da página (fonte única de busca). */
  members: Member[];
  meId: string | null;
  isAdmin: boolean;
  campanhaNames: Map<string, string>;
  onOpenMember: (m: Member, opts?: { showComposition?: boolean }) => void;
}) {
  const todayIso = todayIsoInBrasilia();
  const [periodMode, setPeriodMode] = useState<PeriodMode>("hoje");
  const [anchor, setAnchor] = useState(todayIso);
  const [customFrom, setCustomFrom] = useState(todayIso);
  const [customTo, setCustomTo] = useState(todayIso);
  const [viewMode, setViewMode] = useState<ViewMode>("pessoa");
  const [expandedPerson, setExpandedPerson] = useState<string | null>(null);
  const [expandedTask, setExpandedTask] = useState<string | null>(null);
  const [historyFor, setHistoryFor] = useState<Member | null>(null);

  // Não-admin só enxerga a própria linha (mesmo escopo que RLS já aplica
  // aos `time_entries` — evita uma lista "todo mundo não iniciou" com
  // dado falso, já que o servidor zera `startTimes` de colegas pra quem
  // não é admin).
  const visibleMembers = useMemo(
    () => (isAdmin ? members : members.filter((m) => m.id === meId)),
    [members, isAdmin, meId],
  );

  const range = useMemo(() => {
    if (periodMode === "hoje") return { from: anchor, to: anchor };
    if (periodMode === "semana") {
      const from = startOfWeekIsoBrasilia(parseIsoDateLocal(anchor));
      const to = addDaysIso(from, 6);
      return { from, to: to > todayIso ? todayIso : to };
    }
    if (periodMode === "mes") {
      const from = addMonthsIso(anchor, 0, 1);
      const to = addMonthsIso(anchor, 0, "end");
      return { from, to: to > todayIso ? todayIso : to };
    }
    return { from: customFrom, to: customTo };
  }, [periodMode, anchor, customFrom, customTo, todayIso]);

  const isPeriodPast = range.to < todayIso;
  const isSingleDay = range.from === range.to;

  const scopedUserId = isAdmin ? undefined : (meId ?? undefined);
  const { entries, loading } = useTeamTimeEntries(range, scopedUserId);
  // Snapshot de HOJE, sempre buscado (independente do período escolhido
  // acima) — alimenta só o status ao vivo e o resumo "trabalhando agora"/
  // "não iniciou", que são sempre sobre "agora", nunca sobre o período
  // histórico visualizado.
  const { entries: todayEntries } = useTeamTimeEntries(
    { from: todayIso, to: todayIso },
    scopedUserId,
  );

  const byPerson = useMemo(() => {
    const map = new Map<string, { total: number; entries: TimeEntry[] }>();
    for (const e of entries) {
      const cur = map.get(e.userId) ?? { total: 0, entries: [] };
      cur.total += e.durationSeconds ?? 0;
      cur.entries.push(e);
      map.set(e.userId, cur);
    }
    return map;
  }, [entries]);

  const byTask = useMemo(() => {
    const map = new Map<
      string,
      { taskId: string; taskOrigin: TaskOrigin; total: number; entries: TimeEntry[] }
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

  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);

  const statusFor = (memberId: string): MemberStatus => {
    // Período inteiramente no passado (personalizado terminando antes de
    // hoje): o status descreve AQUELE período, não "agora" — um timer
    // rodando hoje não deve pintar de "Trabalhando" a linha de uma
    // semana já encerrada.
    if (isPeriodPast) {
      const hasEntryInPeriod = (byPerson.get(memberId)?.entries.length ?? 0) > 0;
      return hasEntryInPeriod ? "finalizado" : "sem-registro";
    }
    const runningNow = todayEntries.some((e) => e.userId === memberId && e.endedAt === null);
    if (runningNow) return "trabalhando";
    const member = memberById.get(memberId);
    const startedToday = !!member?.startTimes?.[todayIso];
    const hasTodayEntry = todayEntries.some((e) => e.userId === memberId);
    return startedToday || hasTodayEntry ? "pausado" : "nao-iniciou";
  };

  const totalSeconds = useMemo(
    () => entries.reduce((s, e) => s + (e.durationSeconds ?? 0), 0),
    [entries],
  );
  const membersWithRecord = byPerson.size;
  const workingNow = useMemo(
    () =>
      visibleMembers.filter((m) =>
        todayEntries.some((e) => e.userId === m.id && e.endedAt === null),
      ).length,
    [visibleMembers, todayEntries],
  );
  const notStarted = useMemo(
    () =>
      visibleMembers.filter((m) => {
        const startedToday = !!m.startTimes?.[todayIso];
        const hasTodayEntry = todayEntries.some((e) => e.userId === m.id);
        const runningNow = todayEntries.some((e) => e.userId === m.id && e.endedAt === null);
        return !runningNow && !startedToday && !hasTodayEntry;
      }).length,
    [visibleMembers, todayEntries, todayIso],
  );

  const periodLabel = useMemo(() => {
    if (isSingleDay) return formatIsoDate(range.from);
    const from = parseIsoDateLocal(range.from);
    const to = parseIsoDateLocal(range.to);
    const fmt = (d: Date) => d.toLocaleDateString("pt-BR", { day: "numeric", month: "short" });
    return `${fmt(from)} — ${fmt(to)}`;
  }, [range, isSingleDay]);

  const rightDisabled = range.to >= todayIso;

  const goPrev = () => {
    if (periodMode === "hoje") setAnchor((a) => addDaysIso(a, -1));
    else if (periodMode === "semana") setAnchor((a) => addDaysIso(a, -7));
    else if (periodMode === "mes") setAnchor((a) => addMonthsIso(a, -1, 1));
  };
  const goNext = () => {
    if (rightDisabled) return;
    if (periodMode === "hoje") setAnchor((a) => addDaysIso(a, 1));
    else if (periodMode === "semana") setAnchor((a) => addDaysIso(a, 7));
    else if (periodMode === "mes") setAnchor((a) => addMonthsIso(a, 1, 1));
  };

  const daysWithRecord = (memberId: string): number => {
    const personEntries = byPerson.get(memberId)?.entries ?? [];
    return new Set(personEntries.map((e) => localDateOf(e.startedAt))).size;
  };

  return (
    <div className="rounded-[22px] bg-card p-5 dark:shadow-none">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="flex items-center gap-1.5 text-[15px] font-semibold text-foreground">
          <Clock className="h-4 w-4 text-text-secondary" /> Jornada e horas trabalhadas
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={periodMode}
            onChange={(e) => {
              setPeriodMode(e.target.value as PeriodMode);
              setAnchor(todayIso);
            }}
            className="h-8 cursor-pointer rounded-md border-0 bg-background px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            {PERIOD_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>

          {periodMode === "personalizado" ? (
            <div className="flex items-center gap-1.5">
              <DateField
                value={customFrom}
                onChange={(v) => setCustomFrom(v ?? customFrom)}
                max={customTo}
                className="h-8 text-xs"
              />
              <span className="text-xs text-text-secondary">até</span>
              <DateField
                value={customTo}
                onChange={(v) => setCustomTo(v ?? customTo)}
                min={customFrom}
                max={todayIso}
                className="h-8 text-xs"
              />
            </div>
          ) : (
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                aria-label="Período anterior"
                onClick={goPrev}
                className="cursor-pointer rounded-md p-1 text-text-secondary hover:bg-muted hover:text-foreground"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="min-w-[92px] text-center text-xs font-medium text-foreground">
                {periodLabel}
              </span>
              <button
                type="button"
                aria-label="Próximo período"
                disabled={rightDisabled}
                onClick={goNext}
                className="cursor-pointer rounded-md p-1 text-text-secondary hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}

          {isAdmin && (
            <SegmentedControl
              aria-label="Visualização de horas trabalhadas"
              size="sm"
              value={viewMode}
              onChange={(v) => setViewMode(v as ViewMode)}
              options={[
                { value: "pessoa", label: "Por pessoa" },
                { value: "tarefa", label: "Por tarefa" },
              ]}
            />
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-secondary">
        <span>
          <span className="font-semibold text-foreground">{formatHours(totalSeconds)}</span> no
          período
        </span>
        <span className="text-border">·</span>
        <span>
          {membersWithRecord} {membersWithRecord === 1 ? "membro" : "membros"} com registro
        </span>
        <span className="text-border">·</span>
        <span className={workingNow > 0 ? "text-success" : undefined}>
          {workingNow} trabalhando agora
        </span>
        <span className="text-border">·</span>
        <span>{notStarted} sem iniciar hoje</span>
      </div>

      <div className="mt-4">
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-[52px] animate-pulse rounded-2xl bg-muted/40" />
            ))}
          </div>
        ) : visibleMembers.length === 0 ? (
          <p className="py-6 text-center text-sm text-text-secondary">Nenhum membro ainda.</p>
        ) : viewMode === "pessoa" ? (
          <div className="divide-y divide-border/60 overflow-hidden rounded-2xl bg-muted/40">
            {visibleMembers.map((m) => {
              const isOpen = expandedPerson === m.id;
              const total = byPerson.get(m.id)?.total ?? 0;
              const personEntries = byPerson.get(m.id)?.entries ?? [];
              const hasAnyEntry = personEntries.length > 0;
              const status = statusFor(m.id);
              const startTime = m.startTimes?.[range.from];
              const secondaryInfo = isSingleDay
                ? (startTime ?? "—")
                : `${daysWithRecord(m.id)} ${daysWithRecord(m.id) === 1 ? "dia" : "dias"} com registro`;
              return (
                <div key={m.id}>
                  <button
                    type="button"
                    onClick={() => setExpandedPerson(isOpen ? null : m.id)}
                    className="flex w-full cursor-pointer items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/60"
                  >
                    {isOpen ? (
                      <ChevronDown className="h-4 w-4 shrink-0 text-text-secondary" />
                    ) : (
                      <ChevronRight className="h-4 w-4 shrink-0 text-text-secondary" />
                    )}
                    <Avatar
                      className="h-8 w-8 shrink-0 cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenMember(m);
                      }}
                    >
                      {m.photo && <AvatarImage src={m.photo} alt={m.name} />}
                      <AvatarFallback className={`text-xs font-semibold ${avatarAccent(m.id)}`}>
                        {initialsOf(m.name, m.email)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        {m.name || "(sem nome)"}
                      </p>
                      <p className="truncate text-[11px] text-text-secondary">{m.role || "—"}</p>
                    </div>
                    {isAdmin && isSingleDay && startTime ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setHistoryFor(m);
                        }}
                        className="hidden shrink-0 text-xs tabular-nums text-text-secondary hover:text-foreground hover:underline sm:inline"
                      >
                        {secondaryInfo}
                      </button>
                    ) : (
                      <span className="hidden shrink-0 text-xs tabular-nums text-text-secondary sm:inline">
                        {secondaryInfo}
                      </span>
                    )}
                    <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
                      {hasAnyEntry ? formatHours(total) : "Sem registro"}
                    </span>
                    <div className="w-3.5 shrink-0 sm:w-[92px]">
                      <StatusPill status={status} />
                    </div>
                  </button>
                  {isOpen && (
                    <div className="space-y-2 bg-background/60 px-3 py-3 pl-14">
                      {personEntries.length === 0 ? (
                        <p className="text-xs text-text-secondary">Sem registro no período.</p>
                      ) : (
                        [...personEntries]
                          .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
                          .map((e) => {
                            const info = resolveTaskInfo(e.taskId, e.taskOrigin, campanhaNames);
                            return (
                              <div
                                key={e.id}
                                className="flex items-center justify-between gap-3 text-xs"
                              >
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-foreground">{info.title}</p>
                                  <p className="truncate text-text-secondary">{info.projectName}</p>
                                </div>
                                <div className="shrink-0 text-right text-text-secondary">
                                  <p>{formatIsoDate(localDateOf(e.startedAt))}</p>
                                  <p className="tabular-nums">
                                    {formatHM(e.startedAt)}
                                    {e.endedAt ? `–${formatHM(e.endedAt)}` : " (em andamento)"}
                                  </p>
                                </div>
                                <span className="shrink-0 font-medium tabular-nums text-foreground">
                                  {e.durationSeconds != null ? formatHours(e.durationSeconds) : "—"}
                                </span>
                              </div>
                            );
                          })
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : byTask.length === 0 ? (
          <p className="py-6 text-center text-sm text-text-secondary">
            Nenhum registro de tempo neste período.
          </p>
        ) : (
          <div className="divide-y divide-border/60 overflow-hidden rounded-2xl bg-muted/40">
            {byTask.map(({ taskId, taskOrigin, total, entries: taskEntries }) => {
              const key = `${taskOrigin}:${taskId}`;
              const isOpen = expandedTask === key;
              const info = resolveTaskInfo(taskId, taskOrigin, campanhaNames);
              return (
                <div key={key}>
                  <button
                    type="button"
                    onClick={() => setExpandedTask(isOpen ? null : key)}
                    className="flex w-full cursor-pointer items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/60"
                  >
                    {isOpen ? (
                      <ChevronDown className="h-4 w-4 shrink-0 text-text-secondary" />
                    ) : (
                      <ChevronRight className="h-4 w-4 shrink-0 text-text-secondary" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{info.title}</p>
                      <p className="truncate text-[11px] text-text-secondary">{info.projectName}</p>
                    </div>
                    <span className="hidden max-w-[140px] shrink-0 truncate text-xs text-text-secondary sm:inline">
                      {info.assignees.join(", ") || "Sem responsável"}
                    </span>
                    <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
                      {formatHours(total)}
                    </span>
                    {info.status && (
                      <span
                        className={`hidden shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide md:inline-flex ${TASK_STATUS_TONE[info.status as keyof typeof TASK_STATUS_TONE] ?? ""}`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${TASK_STATUS_DOT[info.status as keyof typeof TASK_STATUS_DOT] ?? ""}`}
                        />
                        {info.status}
                      </span>
                    )}
                  </button>
                  {isOpen && (
                    <div className="space-y-2 bg-background/60 px-3 py-3 pl-10">
                      {[...taskEntries]
                        .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
                        .map((e) => {
                          const member = memberById.get(e.userId);
                          return (
                            <div
                              key={e.id}
                              className="flex items-center justify-between gap-3 text-xs"
                            >
                              <span className="truncate text-foreground">
                                {member?.name ?? "Ex-membro"}
                              </span>
                              <div className="shrink-0 text-right text-text-secondary">
                                <p>{formatIsoDate(localDateOf(e.startedAt))}</p>
                                <p className="tabular-nums">
                                  {formatHM(e.startedAt)}
                                  {e.endedAt ? `–${formatHM(e.endedAt)}` : " (em andamento)"}
                                </p>
                              </div>
                              <span className="shrink-0 font-medium tabular-nums text-foreground">
                                {e.durationSeconds != null ? formatHours(e.durationSeconds) : "—"}
                              </span>
                            </div>
                          );
                        })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <StartOfDayHistoryDialog
        member={historyFor}
        open={!!historyFor}
        onOpenChange={(o) => !o && setHistoryFor(null)}
      />
    </div>
  );
}
