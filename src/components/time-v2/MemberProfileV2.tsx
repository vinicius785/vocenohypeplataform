import { rangeLabel } from "./team-metrics";
import { useEffect, useMemo, useRef, useState } from "react";
import { MoreHorizontal, Pencil, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { avatarAccent, getStatus, initialsOf, PresenceDot } from "@/components/team/member-ui";
import { ScoreOperacionalPanel } from "@/components/team/ScoreOperacionalPanel";
import { useMemberPerformance } from "@/components/team/use-member-performance";
import { useTeamMembers } from "@/components/tasks/task-people";
import { useConfirm } from "@/hooks/use-confirm";
import type { Member } from "@/components/TimeSection";
import { useClientes } from "@/lib/clientes-store";
import { workContextLabel, timerMatchesTask } from "@/lib/home-work";
import { loadAllTasksFlat, type DashTask } from "@/lib/task-aggregation";
import type { PerformanceOpenTask } from "@/lib/score";
import type { PerformanceSettings } from "@/lib/performance-engine";
import type { Meeting } from "@/lib/reunioes-store";
import { STATUS_LABEL } from "@/lib/chat-store";
import { formatResponseDuration } from "@/lib/member-response-time";
import { todayIsoInBrasilia } from "@/lib/timezone";
import {
  startTimerOnInProgress,
  stopTimer,
  useRunningTimer,
  useTeamTimeEntries,
} from "@/lib/time-entries";
import { statusTargetOrigin } from "@/lib/task-status-change";
import { useTaskDependencies } from "@/lib/task-dependencies-store";
import { useTaskDirectory } from "@/lib/task-directory";
import { TASK_BLOCK_CATEGORY_LABEL } from "@/lib/task-blocks-rules";
import { runWorkStatusChange } from "@/lib/work-status-action";
import type { TaskStatus } from "@/lib/task-status";
import { cn } from "@/lib/utils";
import { MemberInfoList, memberInfoRows, ProfileJourney } from "./profile-sections";
import {
  assessLoad,
  cycleTimeStats,
  dependencyGroupOf,
  dependencySummary,
  DEPENDENCY_GROUP_LABEL,
  memberProfileInsights,
} from "./member-metrics";
import { blockedRows, communicationReading, memberHistoryEvents } from "./member-v2";
import {
  DependenciesView,
  HistoryView,
  OverviewView,
  PerformanceView,
  TasksView,
  VIEW_IDS,
  VIEW_LABEL,
  type ReplanSummary,
  type TaskCtx,
  type ViewId,
} from "./MemberViews";
import { CommunicationView } from "./MemberCommunication";
import { useMemberResponseTimeData, useTeamResponseTime } from "./use-response-time";
import {
  canSeeField,
  entrySeconds,
  formatHours,
  groupJourneyByDay,
  memberTaskStats,
  PROFILE_PERIOD_LABELS,
  rangeForProfilePeriod,
  type ProfilePeriod,
} from "./time-v2-utils";

const PERIOD_OPTIONS = (Object.keys(PROFILE_PERIOD_LABELS) as ProfilePeriod[]).map((value) => ({
  value,
  label: PROFILE_PERIOD_LABELS[value],
}));

type Viewer = { isAdmin: boolean; meId: string | null };

type Props = {
  member: Member | null;
  /** Visão aberta ao entrar (ex.: vindo de um insight). */
  initialView?: ViewId;
  /** Entregas por semana deste membro (dados já calculados na página). */
  deliveries?: {
    thisWeek: number;
    monthlyAvg: number | null;
    quarterlyAvg: number | null;
    yearlyAvg: number | null;
  } | null;
  viewer: Viewer;
  tasksForMember: DashTask[];
  openTasksForMember: PerformanceOpenTask[];
  /** Média de abertas por pessoa no time (referência da classificação de carga — nunca ranking). */
  teamAvgOpen: number | null;
  performanceSettings: PerformanceSettings;
  meetingsById: Map<string, Meeting>;
  onOpenTask: (t: DashTask) => void;
  onClose: () => void;
  onEdit: (m: Member) => void;
  onDelete: (id: string) => void;
  onReset: (id: string) => void;
};

/**
 * DETALHE DO MEMBRO (V2) — Sheet lateral contido (640 px) em duas camadas:
 *  1. visão rápida (fixa/rola junto): identidade, período como contexto e resumo operacional;
 *  2. aprofundamento: Visão geral · Desempenho · Tarefas · Jornada · Comunicação · Dependências ·
 *     Histórico — uma visão por vez. Dados buscados uma vez no topo e compartilhados; as regras
 *     de cálculo continuam em `member-metrics`, `time-v2-utils`, `performance-engine` etc.
 * Status de tarefa só é editável no PRÓPRIO perfil (mudar status liga o cronômetro de quem muda).
 */
export function MemberProfileV2({ member, onClose, ...rest }: Props) {
  return (
    <Sheet open={!!member} onOpenChange={(v) => !v && onClose()}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:w-[92vw] sm:max-w-[640px]"
      >
        {member && (
          <ProfileBody key={`${member.id}:${rest.initialView ?? ""}`} member={member} {...rest} />
        )}
      </SheetContent>
    </Sheet>
  );
}

function ProfileBody({
  member,
  initialView,
  deliveries,
  viewer,
  tasksForMember,
  openTasksForMember,
  teamAvgOpen,
  performanceSettings,
  meetingsById,
  onOpenTask,
  onEdit,
  onDelete,
  onReset,
}: Omit<Props, "member" | "onClose"> & { member: Member }) {
  const [period, setPeriod] = useState<ProfilePeriod>("mes");
  const [custom, setCustom] = useState<{ from: string; to: string }>(() => {
    const t = todayIsoInBrasilia();
    return { from: t.slice(0, 8) + "01", to: t };
  });
  const [view, setView] = useState<ViewId>(initialView ?? "visao");
  const [infoOpen, setInfoOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const range = useMemo(() => rangeForProfilePeriod(period, custom), [period, custom]);

  const perf = useMemberPerformance(
    member.id,
    range,
    openTasksForMember,
    performanceSettings.deadlineCutoffHour,
  );
  const { entries, loading: entriesLoading } = useTeamTimeEntries(range, member.id);
  const rt = useMemberResponseTimeData(member.id, range);
  const team = useTeamResponseTime(range);

  const status = getStatus(member.id);
  const showName = canSeeField(member, "name", viewer);
  const showRole = canSeeField(member, "role", viewer);
  const isSelf = viewer.meId === member.id;
  const totalSeconds = useMemo(() => entries.reduce((s, e) => s + entrySeconds(e), 0), [entries]);
  const journeyDays = useMemo(() => groupJourneyByDay(entries), [entries]);
  const stats = useMemo(() => memberTaskStats(tasksForMember), [tasksForMember]);
  const load = useMemo(() => assessLoad(stats, teamAvgOpen), [stats, teamAvgOpen]);
  const deps = useMemo(() => dependencySummary(tasksForMember), [tasksForMember]);
  const cycle = useMemo(() => cycleTimeStats(tasksForMember, range), [tasksForMember, range]);
  const missed = perf.attendance.filter((a) => !a.attended).length;
  const lateCount = perf.completions.filter((c) => c.outcome === "late").length;
  const periodInProgress = range.to >= todayIsoInBrasilia();
  const displayName = showName ? member.name || "(sem nome)" : "Membro";

  const replan = useMemo<ReplanSummary>(() => {
    const t = perf.score.previsibilidade.porTiming;
    return {
      tasksReplanned: new Set(perf.deadlineChanges.map((d) => d.taskId).filter(Boolean)).size,
      taskBase: perf.score.amostra,
      before: (t?.antecipado ?? 0) + (t?.proximo ?? 0),
      after: (t?.no_dia ?? 0) + (t?.apos_vencimento ?? 0),
    };
  }, [perf.score, perf.deadlineChanges]);

  const insights = useMemo(
    () =>
      memberProfileInsights({
        overdueUnblocked: stats.atrasadas - stats.atrasadasBloqueadas,
        dueToday: stats.vencemHoje,
        onTimePct: perf.aggCurrent.pctNoPrazo,
        onTimeSample: perf.completions.length,
        onTimePctPrevious: perf.aggPrevious.pctNoPrazo,
        onTimeSamplePrevious: perf.previousCompletions.length,
        responseAvgSeconds: rt.data?.all.averageSeconds ?? null,
        responseAvgSecondsPrevious: rt.previous?.all.averageSeconds ?? null,
        responseDirect: rt.data
          ? { avg: rt.data.direct.averageSeconds, answered: rt.data.direct.answered }
          : undefined,
        responseMention: rt.data
          ? { avg: rt.data.mention.averageSeconds, answered: rt.data.mention.answered }
          : undefined,
        replans: perf.aggCurrent.qtdReplanejamentos,
        replansPrevious: perf.aggPrevious.qtdReplanejamentos,
        dependencies: deps.byGroup,
      }),
    [stats, perf, rt.data, rt.previous, deps.byGroup],
  );

  const reading = useMemo(
    () => communicationReading(rt.data, team.data?.teamAverageSeconds ?? null),
    [rt.data, team.data],
  );

  /* ---- tarefas: mesma linha, mesmo pipeline e mesmas travas do Início ---- */
  const clientes = useClientes();
  const members = useTeamMembers();
  const allDeps = useTaskDependencies();
  const directory = useTaskDirectory();
  const running = useRunningTimer();
  const { confirm, confirmDialog } = useConfirm();
  const campanhaNameMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of clientes) for (const camp of c.campanhas ?? []) m.set(camp.id, camp.nome);
    return m;
  }, [clientes]);
  const clienteByCampanha = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of clientes) for (const camp of c.campanhas ?? []) m.set(camp.id, c.empresa);
    return m;
  }, [clientes]);

  const taskCtx: TaskCtx = {
    isSelf,
    context: (t) => workContextLabel(t, clienteByCampanha),
    timerStartedAt: (t) =>
      timerMatchesTask(t, running.entry) ? (running.entry?.startedAt ?? null) : null,
    onOpen: onOpenTask,
    onStatus: (t, next: TaskStatus) => {
      if (!isSelf) return;
      void runWorkStatusChange({
        task: t,
        next,
        allDeps,
        statusOf: (id) =>
          loadAllTasksFlat(campanhaNameMap).find((x) => x.id.replace(/^mkt:/, "") === id)?.status,
        ctx: { members, performanceSettings },
        confirm,
        openTask: onOpenTask,
        notifyError: (m) => toast.error(m),
      });
    },
    onTimerStart: (t) =>
      !t.comercial &&
      void startTimerOnInProgress(t.id.replace(/^mkt:/, ""), statusTargetOrigin(t), t.title),
    onTimerStop: () => {
      if (running.entry) void stopTimer(running.entry.id, running.entry.startedAt);
    },
  };

  /* ---- dependências e histórico ---- */
  const directoryByRawId = useMemo(() => new Map(directory.map((d) => [d.rawId, d])), [directory]);
  const blocked = useMemo(
    () =>
      blockedRows(deps.tasks, allDeps, (id) => {
        const e = directoryByRawId.get(id);
        return (
          e && { label: e.label, status: e.status, assignees: e.assignees, dueDate: e.dueDate }
        );
      }),
    [deps.tasks, allDeps, directoryByRawId],
  );
  const projectOfTask = (id?: string | null) =>
    id
      ? tasksForMember.find((t) => t.id.replace(/^mkt:/, "") === id.replace(/^mkt:/, ""))
          ?.projectName
      : undefined;
  const historyEvents = useMemo(
    () =>
      memberHistoryEvents({
        memberName: displayName,
        completions: perf.completions,
        deadlineChanges: perf.deadlineChanges,
        attendance: perf.attendance,
        meetingTitle: (id) => (id ? meetingsById.get(id)?.titulo : undefined),
        projectOfTask,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- projectOfTask só lê tasksForMember
    [
      displayName,
      perf.completions,
      perf.deadlineChanges,
      perf.attendance,
      meetingsById,
      tasksForMember,
    ],
  );
  const historyProjects = useMemo(
    () => Array.from(new Set(historyEvents.map((e) => e.entrega).filter(Boolean) as string[])),
    [historyEvents],
  );

  const openById = (id: string) => {
    const t = tasksForMember.find((x) => x.id === id);
    if (t) onOpenTask(t);
  };

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [view]);

  const rtAvg = rt.data?.all.averageSeconds ?? null;
  const summary: {
    key: string;
    label: string;
    value: string | number;
    tone?: "danger";
    go: ViewId;
  }[] = [
    { key: "abertas", label: "Abertas", value: stats.abertas, go: "tarefas" },
    {
      key: "atrasadas",
      label: "Atrasadas",
      value: stats.atrasadas,
      tone: stats.atrasadas - stats.atrasadasBloqueadas > 0 ? "danger" : undefined,
      go: "tarefas",
    },
    { key: "concluidas", label: "Concluídas", value: perf.completions.length, go: "desempenho" },
    {
      key: "horas",
      label: "Horas",
      value: totalSeconds > 0 ? `${(totalSeconds / 3600).toFixed(1).replace(".", ",")}h` : "—",
      go: "jornada",
    },
    {
      key: "resposta",
      label: "Resposta",
      value:
        rt.state === "loading"
          ? "…"
          : rt.state === "error" || rtAvg == null
            ? "—"
            : formatResponseDuration(rtAvg),
      go: "comunicacao",
    },
  ];

  const infoRows = memberInfoRows(
    member,
    viewer,
    member.startTimes?.[todayIsoInBrasilia()] ?? null,
  );

  return (
    <>
      <SheetHeader className="space-y-3 border-b border-border px-5 pb-3 pt-4 text-left sm:px-6">
        <div className="flex min-w-0 items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="relative shrink-0">
              <Avatar className="h-11 w-11">
                {member.photo && <AvatarImage src={member.photo} alt="" className="object-cover" />}
                <AvatarFallback className={`text-base font-semibold ${avatarAccent(member.id)}`}>
                  {initialsOf(showName ? member.name : "", member.email)}
                </AvatarFallback>
              </Avatar>
              <PresenceDot status={status} />
            </div>
            <div className="min-w-0">
              <SheetTitle className="truncate text-lg">{displayName}</SheetTitle>
              <SheetDescription className="flex min-w-0 items-center gap-1.5 truncate">
                <span className="truncate">{showRole && member.role ? member.role : "—"}</span>
                <span aria-hidden>·</span>
                <span className="shrink-0">{STATUS_LABEL[status]}</span>
                {member.isAdmin && (
                  <ShieldCheck className="h-3 w-3 shrink-0" aria-label="Administrador" />
                )}
              </SheetDescription>
            </div>
          </div>
          <div className="mr-8 flex shrink-0 items-center gap-1">
            {viewer.isAdmin && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => onEdit(member)}
              >
                <Pencil className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Editar membro</span>
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" aria-label="Mais ações do membro">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setInfoOpen(true)}>
                  Informações do membro
                </DropdownMenuItem>
                {viewer.isAdmin && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => onReset(member.id)}>
                      Redefinir senha
                    </DropdownMenuItem>
                    {!isSelf && (
                      <DropdownMenuItem
                        className="text-destructive"
                        onSelect={() => onDelete(member.id)}
                      >
                        Remover membro
                      </DropdownMenuItem>
                    )}
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <SegmentedControl
            aria-label="Período do perfil"
            size="sm"
            value={period}
            onChange={setPeriod}
            options={PERIOD_OPTIONS}
          />
          <span className="text-xs text-text-secondary tabular-nums">{rangeLabel(range)}</span>
          {period === "personalizado" && (
            <div className="flex items-center gap-1.5">
              <Input
                type="date"
                aria-label="Data inicial"
                value={custom.from}
                max={custom.to}
                onChange={(e) =>
                  e.target.value && setCustom((c) => ({ ...c, from: e.target.value }))
                }
                className="h-8 w-[9.5rem] text-xs"
              />
              <span className="text-xs text-text-secondary">até</span>
              <Input
                type="date"
                aria-label="Data final"
                value={custom.to}
                min={custom.from}
                onChange={(e) => e.target.value && setCustom((c) => ({ ...c, to: e.target.value }))}
                className="h-8 w-[9.5rem] text-xs"
              />
            </div>
          )}
        </div>
      </SheetHeader>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        <dl
          aria-label="Resumo operacional"
          className="grid grid-cols-3 gap-x-4 gap-y-4 px-5 pb-4 pt-5 sm:grid-cols-5 sm:px-6"
        >
          {summary.map((i) => (
            <button
              key={i.key}
              type="button"
              onClick={() => setView(i.go)}
              aria-label={`${i.label}: ${i.value}. Ver detalhes`}
              className="min-w-0 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <dd
                className={cn(
                  "truncate text-xl font-semibold tabular-nums",
                  i.tone === "danger" ? "text-danger" : "text-foreground",
                )}
              >
                {i.value}
              </dd>
              <dt className="truncate text-[11px] font-medium uppercase tracking-wide text-text-secondary">
                {i.label}
              </dt>
            </button>
          ))}
        </dl>

        <div
          role="tablist"
          aria-label="Seções do perfil"
          className="sticky top-0 z-10 flex gap-5 overflow-x-auto border-b border-border bg-background px-5 [scrollbar-width:none] sm:px-6 [&::-webkit-scrollbar]:hidden"
        >
          {VIEW_IDS.map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={view === id}
              onClick={() => setView(id)}
              className={cn(
                "shrink-0 border-b-2 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                view === id
                  ? "border-foreground text-foreground"
                  : "border-transparent text-text-secondary hover:text-foreground",
              )}
            >
              {VIEW_LABEL[id]}
              {id === "dependencias" && deps.total > 0 && (
                <span className="ml-1 tabular-nums text-text-secondary">{deps.total}</span>
              )}
            </button>
          ))}
        </div>

        <div role="tabpanel" className="px-5 pb-10 pt-6 sm:px-6">
          {view === "visao" && (
            <OverviewView
              insights={insights}
              tasks={tasksForMember}
              ctx={taskCtx}
              journey={{
                statusLabel: STATUS_LABEL[status],
                hours: formatHours(totalSeconds),
                days: journeyDays.length,
              }}
              communication={{ state: rt.state, reading }}
              goTo={setView}
            />
          )}
          {view === "desempenho" && (
            <PerformanceView
              score={perf.score}
              trendLabel={perf.trendLabel}
              panel={
                <ScoreOperacionalPanel
                  score={perf.score}
                  trendLabel={perf.trendLabel}
                  completions={perf.completions}
                  deadlineChanges={perf.deadlineChanges}
                  attendance={perf.attendance}
                  meetingsById={meetingsById}
                  performanceSettings={performanceSettings}
                  tasksForMember={tasksForMember}
                  openById={openById}
                  initialShowComposition
                />
              }
              agg={perf.aggCurrent}
              aggPrevious={perf.aggPrevious}
              aggPrevious2={perf.aggPrevious2}
              completed={perf.completions.length}
              lateCount={lateCount}
              previousCompleted={perf.previousCompletions.length}
              previous2Completed={perf.previous2CompletionsCount}
              overdueNow={perf.overdueNow.length}
              replan={replan}
              cycle={cycle}
              periodInProgress={periodInProgress}
              meetings={{
                attended: perf.attendance.length - missed,
                expected: perf.attendance.length,
              }}
              deliveries={deliveries}
            />
          )}
          {view === "tarefas" && (
            <TasksView tasks={tasksForMember} stats={stats} load={load} ctx={taskCtx} />
          )}
          {view === "jornada" && (
            <ProfileJourney
              member={member}
              entries={entries}
              loading={entriesLoading}
              statusLabel={STATUS_LABEL[status]}
              canSeeStart={canSeeField(member, "startOfDay", viewer)}
            />
          )}
          {view === "comunicacao" && (
            <CommunicationView
              state={rt.state}
              reading={reading}
              data={rt.data}
              previous={rt.previous}
            />
          )}
          {view === "dependencias" && (
            <div className="space-y-4">
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
                Dependências e bloqueios{deps.total > 0 ? ` · ${deps.total}` : ""}
              </h3>
              <DependenciesView
                rows={blocked}
                categoryLabel={(t) =>
                  t.blockCategory
                    ? TASK_BLOCK_CATEGORY_LABEL[t.blockCategory]
                    : DEPENDENCY_GROUP_LABEL[dependencyGroupOf(t)]
                }
                onOpenTask={onOpenTask}
              />
            </div>
          )}
          {view === "historico" && (
            <HistoryView events={historyEvents} projects={historyProjects} />
          )}
        </div>
      </div>

      <Dialog open={infoOpen} onOpenChange={setInfoOpen}>
        <DialogContent className="max-w-sm">
          <DialogTitle className="text-base font-semibold">Informações do membro</DialogTitle>
          <DialogDescription className="sr-only">
            Dados cadastrais de {displayName}.
          </DialogDescription>
          <MemberInfoList rows={infoRows} />
        </DialogContent>
      </Dialog>
      {confirmDialog}
    </>
  );
}
