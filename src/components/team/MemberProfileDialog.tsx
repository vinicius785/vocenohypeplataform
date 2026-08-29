import { useMemo, useState } from "react";
import {
  User,
  Briefcase,
  Mail,
  Calendar,
  DollarSign,
  ShieldCheck,
  Clock,
  FolderKanban,
  ChevronDown,
  AlertTriangle,
  Pencil,
  CalendarClock,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDateToIso } from "@/lib/utils";
import { OPEN_STATUSES } from "@/lib/score";
import { BUCKET_ORDER, type DashTask } from "@/lib/task-aggregation";
import type { Meeting } from "@/lib/reunioes-store";
import {
  computeExecucao,
  computePendencias,
  computeCompromissos,
  computeScoreOperacional,
  computeAggregateIndicators,
  overdueOpenTasks,
  dedupAttendanceEvents,
  rangeForProfilePeriod,
  PROFILE_PERIOD_OPTIONS,
  type ProfilePeriodMode,
  type PerformanceSettings,
  type TaskOutcome,
} from "@/lib/performance-engine";
import type { PerformanceOpenTask } from "@/lib/score";
import { usePerformanceEvents } from "@/lib/performance-events-store";
import {
  DEADLINE_CHANGE_MOTIVO_LABEL,
  type DeadlineChangeMotivo,
} from "@/components/tasks/TaskBoard";
import type { Member, TimeField } from "@/components/TimeSection";
import { avatarAccent, initialsOf, getStatus, PresenceDot, MiniStat } from "./member-ui";
import { STATUS_LABEL } from "@/lib/chat-store";

function formatBirthday(value: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  const d = new Date(value);
  return isNaN(d.getTime()) ? value : d.toLocaleDateString("pt-BR");
}

function fmtDateBR(d: string) {
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

function fmtPct(v: number | null): string {
  return v == null ? "—" : `${Math.round(v)}%`;
}

function fmtDays(v: number | null): string {
  return v == null ? "—" : `${v.toFixed(1)}d`;
}

/** Lista colapsável de registros de "Início de dia" — mostra só os 5
 * mais recentes, com "ver histórico completo" pra expandir. */
function StartOfDayHistory({ startTimes }: { startTimes?: Record<string, string> }) {
  const [expanded, setExpanded] = useState(false);
  const entries = useMemo(
    () =>
      Object.entries(startTimes ?? {})
        .filter(([d, h]) => d && h)
        .sort((a, b) => (a[0] < b[0] ? 1 : -1)),
    [startTimes],
  );
  if (entries.length === 0) {
    return <p className="text-xs text-muted-foreground">Nenhum registro de início de dia ainda.</p>;
  }
  const visible = expanded ? entries : entries.slice(0, 5);
  return (
    <div>
      <ul className="space-y-1">
        {visible.map(([d, h]) => (
          <li
            key={d}
            className="flex items-center justify-between rounded-md bg-muted/40 px-2.5 py-1.5 text-xs"
          >
            <span className="text-muted-foreground">{fmtDateBR(d)}</span>
            <span className="font-medium tabular-nums text-foreground">{h}</span>
          </li>
        ))}
      </ul>
      {entries.length > 5 && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="mt-2 flex w-full items-center justify-center gap-1 rounded-md py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <ChevronDown className={`h-3 w-3 transition-transform ${expanded ? "rotate-180" : ""}`} />
          {expanded ? "Ver só os últimos 5" : `Ver histórico completo (${entries.length})`}
        </button>
      )}
    </div>
  );
}

/** "Início de hoje" — mostra só o registro do dia corrente + um botão
 * "Ver histórico" que revela o `StartOfDayHistory` completo (que já se
 * colapsa internamente em 5 + "ver mais"). Duplo colapso deliberado: a
 * ficha não deve mostrar todos os dias permanentemente. */
function StartOfDaySection({ startTimes }: { startTimes?: Record<string, string> }) {
  const [showHistory, setShowHistory] = useState(false);
  const todayKey = formatDateToIso(new Date());
  const todayTime = startTimes?.[todayKey];
  return (
    <section className="space-y-1.5">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        <Clock className="h-3 w-3" /> Início de dia
      </div>
      <div className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
        <span className="text-xs text-foreground">
          {todayTime ? `Início de hoje: ${todayTime}` : "Sem registro hoje"}
        </span>
        <button
          type="button"
          onClick={() => setShowHistory((s) => !s)}
          className="shrink-0 text-[11px] font-medium text-muted-foreground underline underline-offset-2 hover:text-foreground"
        >
          {showHistory ? "Ocultar histórico" : "Ver histórico"}
        </button>
      </div>
      {showHistory && <StartOfDayHistory startTimes={startTimes} />}
    </section>
  );
}

/**
 * Ficha do membro — ferramenta de DIAGNÓSTICO, não outro dashboard: "a
 * página Time identifica, a ficha individual explica". Diferente da
 * página Time (que reaproveita `scoreByMemberId`/`performanceEvents` já
 * computados por `DiretorioTab`), a ficha tem seletor de período PRÓPRIO
 * (Esta semana/Este mês/Mês anterior/Últimos 90 dias — diferente das
 * opções da página) e por isso recalcula o Score Operacional aqui dentro,
 * com um fetch escopado a esta pessoa+período (`usePerformanceEvents`
 * já filtra por `personId` no servidor — pequeno, sob demanda, só
 * quando a ficha abre).
 */
export function MemberProfileDialog({
  member,
  isSelf,
  isAdmin,
  tasksForMember,
  openTasksForMember,
  performanceSettings,
  meetingsById,
  onOpenTask,
  onOpenChange,
  onEdit,
}: {
  member: Member;
  isSelf: boolean;
  isAdmin: boolean;
  /** TODAS as tarefas (qualquer status) vinculadas a esta pessoa —
   * usada pra "Próximas entregas", "Carga atual", "Projetos e
   * campanhas" e pra resolver o link de abrir uma tarefa citada na
   * composição do Score (por id, sobrevive mesmo se a tarefa não
   * estiver mais "aberta"). */
  tasksForMember: DashTask[];
  /** Tarefas ATUALMENTE abertas desta pessoa, com id/title/dueDate/
   * performanceDueDate — mesma fonte que alimenta Pendências na página
   * Time, garantindo que a contagem de "atrasadas" aqui NUNCA divirja
   * do Score. */
  openTasksForMember: PerformanceOpenTask[];
  performanceSettings: PerformanceSettings;
  meetingsById: Map<string, Meeting>;
  onOpenTask: (t: DashTask) => void;
  onOpenChange: (open: boolean) => void;
  onEdit: (m: Member) => void;
}) {
  const tv = member.timeView ?? [];
  const show = (f: TimeField) => isSelf || tv.includes(f);
  const status = getStatus(member.id);

  const [profilePeriod, setProfilePeriod] = useState<ProfilePeriodMode>("mes");
  const profileRange = useMemo(() => rangeForProfilePeriod(profilePeriod), [profilePeriod]);
  const { events } = usePerformanceEvents(profileRange, member.id);

  const completions = useMemo(
    () =>
      events
        .filter((e) => e.eventType === "task_completed")
        .map((e) => ({
          outcome: e.data.outcome as TaskOutcome,
          delayMinutes: (e.data.delayMinutes as number) ?? 0,
          taskId: e.taskId,
          taskTitle: e.taskTitle,
          occurredAt: e.occurredAt,
        })),
    [events],
  );
  const deadlineChanges = useMemo(
    () =>
      events
        .filter((e) => e.eventType === "task_deadline_changed")
        .map((e) => ({
          taskId: e.taskId,
          taskTitle: e.taskTitle,
          isCritical: !!e.data.isCritical,
          motivo: (e.data.motivo as string) ?? undefined,
          exemptFromResponsibility: !!e.data.exemptFromResponsibility,
          occurredAt: e.occurredAt,
        })),
    [events],
  );
  const attendance = useMemo(
    () =>
      dedupAttendanceEvents(
        events.filter((e) => e.eventType === "meeting_attendance_recorded"),
      ).map((e) => ({
        attended: !!e.data.attended,
        meetingId: e.meetingId,
        occurredAt: e.occurredAt,
      })),
    [events],
  );

  const execucao = useMemo(
    () =>
      computeExecucao(completions.map(({ outcome, delayMinutes }) => ({ outcome, delayMinutes }))),
    [completions],
  );
  const overdueNow = useMemo(() => overdueOpenTasks(openTasksForMember), [openTasksForMember]);
  const pendencias = useMemo(
    () => computePendencias(openTasksForMember, performanceSettings.pendenciasDiasTeto),
    [openTasksForMember, performanceSettings.pendenciasDiasTeto],
  );
  const compromissos = useMemo(
    () => computeCompromissos(attendance.map((a) => ({ attended: a.attended }))),
    [attendance],
  );
  const score = useMemo(
    () =>
      computeScoreOperacional(execucao, pendencias, compromissos, {
        execucao: performanceSettings.weightExecucao,
        pendencias: performanceSettings.weightPendencias,
        compromissos: performanceSettings.weightCompromissos,
      }),
    [execucao, pendencias, compromissos, performanceSettings],
  );
  const regularidade = useMemo(
    () => computeAggregateIndicators(completions, deadlineChanges, overdueNow.length),
    [completions, deadlineChanges, overdueNow.length],
  );

  const [showComposition, setShowComposition] = useState(false);

  const openTasksFull = useMemo(
    () => tasksForMember.filter((t) => OPEN_STATUSES.has(t.status)),
    [tasksForMember],
  );
  const upcoming = useMemo(
    () =>
      [...openTasksFull]
        .sort((a, b) => BUCKET_ORDER[a.bucket] - BUCKET_ORDER[b.bucket])
        .slice(0, 5),
    [openTasksFull],
  );
  const vencemSemana = useMemo(
    () => openTasksFull.filter((t) => ["hoje", "amanha", "semana"].includes(t.bucket)).length,
    [openTasksFull],
  );
  const projectNames = useMemo(
    () => Array.from(new Set(tasksForMember.map((t) => t.projectName))),
    [tasksForMember],
  );
  const PROJECT_CHIP_LIMIT = 6;

  const overdueTasksFull = useMemo(() => {
    const ids = new Set(overdueNow.map((t) => t.id));
    return tasksForMember.filter((t) => ids.has(t.id));
  }, [overdueNow, tasksForMember]);
  const criticalReplans = useMemo(
    () => deadlineChanges.filter((d) => d.isCritical),
    [deadlineChanges],
  );
  const missedMeetings = useMemo(() => attendance.filter((a) => !a.attended), [attendance]);
  const hasAttention =
    overdueTasksFull.length > 0 || criticalReplans.length > 0 || missedMeetings.length > 0;

  const openById = (id: string) => {
    const t = tasksForMember.find((x) => x.id === id);
    if (t) {
      onOpenTask(t);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={!!member} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] max-w-lg flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-border px-6 py-4">
          <DialogTitle>Perfil</DialogTitle>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="space-y-5 px-6 py-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-4">
                <div className="relative shrink-0">
                  <Avatar className="h-16 w-16">
                    {member.photo && <AvatarImage src={member.photo} alt={member.name} />}
                    <AvatarFallback className={`text-lg font-semibold ${avatarAccent(member.id)}`}>
                      {initialsOf(show("name") ? member.name : "", member.email)}
                    </AvatarFallback>
                  </Avatar>
                  <PresenceDot status={status} />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {show("name") ? member.name || "(sem nome)" : "Membro"}
                  </p>
                  {show("role") && member.role && (
                    <p className="truncate text-xs text-muted-foreground">{member.role}</p>
                  )}
                  <div className="mt-1 flex items-center gap-1.5">
                    {member.isAdmin && (
                      <Badge
                        variant="outline"
                        className="gap-1 border-foreground/20 px-1.5 py-0 text-[10px] font-medium"
                      >
                        <ShieldCheck className="h-2.5 w-2.5" /> Admin
                      </Badge>
                    )}
                    <span className="text-[11px] text-muted-foreground">
                      {STATUS_LABEL[status]}
                    </span>
                  </div>
                </div>
              </div>
              <select
                value={profilePeriod}
                onChange={(e) => setProfilePeriod(e.target.value as ProfilePeriodMode)}
                className="h-8 rounded-md border border-border bg-background px-2 text-xs outline-none focus:ring-2 focus:ring-ring"
              >
                {PROFILE_PERIOD_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Score Operacional */}
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Score Operacional
                </p>
                <p className="text-2xl font-light tracking-tight text-foreground">
                  {score.score == null ? "—" : score.score}
                  <span className="text-sm text-muted-foreground">/100</span>
                </p>
              </div>

              <div className="space-y-2.5">
                <div>
                  <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    Execução
                  </p>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-4">
                    <MiniStat label="Concluídas no período" value={execucao.count} />
                    <MiniStat label="No prazo" value={execucao.onTimeCount + execucao.earlyCount} />
                    <MiniStat
                      label="Com atraso"
                      value={execucao.lateCount}
                      tone={execucao.lateCount > 0 ? "danger" : "neutral"}
                    />
                    <MiniStat
                      label="Atualmente atrasadas"
                      value={pendencias.overdueCount}
                      tone={pendencias.overdueCount > 0 ? "danger" : "neutral"}
                    />
                  </div>
                </div>
                <div>
                  <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    Regularidade
                  </p>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-3">
                    <MiniStat label="Taxa no prazo" value={fmtPct(regularidade.pctNoPrazo)} />
                    <MiniStat
                      label="Tempo médio de atraso"
                      value={fmtDays(regularidade.tempoMedioAtrasoDias)}
                    />
                    <MiniStat label="Replanejamentos" value={regularidade.qtdReplanejamentos} />
                    <MiniStat
                      label="Replanejamentos no dia"
                      value={regularidade.qtdReplanejamentosNoDia}
                      tone={regularidade.qtdReplanejamentosNoDia > 0 ? "danger" : "neutral"}
                    />
                    <MiniStat
                      label="Alterações de prazo"
                      value={fmtPct(regularidade.pctComPrazoAlterado)}
                    />
                  </div>
                </div>
                <div>
                  <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    Compromissos
                  </p>
                  <div className="grid grid-cols-3 gap-x-3 gap-y-2">
                    <MiniStat
                      label="Reuniões previstas"
                      value={compromissos.expected === 0 ? "—" : compromissos.expected}
                    />
                    <MiniStat
                      label="Participadas"
                      value={compromissos.expected === 0 ? "—" : compromissos.attended}
                    />
                    <MiniStat
                      label="Perdidas"
                      value={
                        compromissos.expected === 0
                          ? "—"
                          : compromissos.expected - compromissos.attended
                      }
                      tone={
                        compromissos.expected > 0 &&
                        compromissos.expected - compromissos.attended > 0
                          ? "danger"
                          : "neutral"
                      }
                    />
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowComposition((s) => !s)}
                className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground underline underline-offset-2 hover:text-foreground"
              >
                {showComposition ? "Ocultar composição do score" : "Ver composição do score"}
              </button>

              {showComposition && (
                <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-3 text-xs">
                  {(
                    [
                      {
                        key: "execucao",
                        label: "Execução",
                        value: score.execucao.value,
                        weight: performanceSettings.weightExecucao,
                        used: score.weightsUsed.execucao,
                      },
                      {
                        key: "pendencias",
                        label: "Pendências",
                        value: score.pendencias.value,
                        weight: performanceSettings.weightPendencias,
                        used: score.weightsUsed.pendencias,
                      },
                      {
                        key: "compromissos",
                        label: "Compromissos",
                        value: score.compromissos.value,
                        weight: performanceSettings.weightCompromissos,
                        used: score.weightsUsed.compromissos,
                      },
                    ] as const
                  ).map((c) => (
                    <div key={c.key} className="flex items-center justify-between">
                      <span className="font-medium text-foreground">{c.label}</span>
                      <span className="tabular-nums text-muted-foreground">
                        {c.value == null ? "—" : `${Math.round(c.value)}%`}
                        {" · peso configurado "}
                        {Math.round(c.weight * 100)}%
                        {c.used > 0
                          ? ` · usado no cálculo ${Math.round(c.used * 100)}%`
                          : " · sem dado no período (excluído do cálculo)"}
                      </span>
                    </div>
                  ))}

                  {completions.length > 0 && (
                    <div className="border-t border-border pt-2">
                      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Tarefas concluídas no período
                      </p>
                      <ul className="space-y-0.5">
                        {completions.slice(0, 8).map((c, i) => {
                          const found = c.taskId
                            ? tasksForMember.find((t) => t.id === c.taskId)
                            : null;
                          const label =
                            c.outcome === "late"
                              ? "Atrasada"
                              : c.outcome === "early"
                                ? "Antecipada"
                                : "No prazo";
                          const content = (
                            <>
                              <span className="min-w-0 flex-1 truncate">
                                {c.taskTitle ?? "Tarefa"}
                              </span>
                              <span
                                className={`shrink-0 ${c.outcome === "late" ? "text-destructive" : "text-muted-foreground"}`}
                              >
                                {label}
                              </span>
                            </>
                          );
                          return (
                            <li key={c.taskId ?? i}>
                              {found ? (
                                <button
                                  type="button"
                                  onClick={() => openById(found.id)}
                                  className="flex w-full items-center gap-2 rounded px-1 py-0.5 text-left hover:bg-muted/50 hover:underline"
                                >
                                  {content}
                                </button>
                              ) : (
                                <div className="flex items-center gap-2 px-1 py-0.5 text-muted-foreground">
                                  {content}
                                </div>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                      {completions.length > 8 && (
                        <p className="mt-1 text-[10px] text-muted-foreground">
                          +{completions.length - 8} outra{completions.length - 8 === 1 ? "" : "s"}
                        </p>
                      )}
                    </div>
                  )}

                  {deadlineChanges.length > 0 && (
                    <div className="border-t border-border pt-2">
                      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Replanejamentos no período
                      </p>
                      <ul className="space-y-0.5">
                        {deadlineChanges.slice(0, 8).map((d, i) => (
                          <li
                            key={`${d.taskId}_${i}`}
                            className="flex items-center justify-between gap-2 px-1 py-0.5"
                          >
                            <span className="min-w-0 flex-1 truncate">
                              {d.taskTitle ?? "Tarefa"}
                            </span>
                            <span
                              className={
                                d.isCritical && !d.exemptFromResponsibility
                                  ? "shrink-0 text-destructive"
                                  : "shrink-0 text-muted-foreground"
                              }
                            >
                              {d.motivo
                                ? (DEADLINE_CHANGE_MOTIVO_LABEL[d.motivo as DeadlineChangeMotivo] ??
                                  d.motivo)
                                : "—"}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </section>

            {hasAttention && (
              <section className="space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="h-3 w-3" /> Atenção
                </p>
                {overdueTasksFull.length > 0 && (
                  <div>
                    <p className="mb-1 text-xs font-medium text-foreground">
                      {overdueTasksFull.length} tarefa{overdueTasksFull.length === 1 ? "" : "s"}{" "}
                      atrasada{overdueTasksFull.length === 1 ? "" : "s"}
                    </p>
                    <ul className="space-y-0.5">
                      {overdueTasksFull.map((t) => (
                        <li key={t.id}>
                          <button
                            type="button"
                            onClick={() => {
                              onOpenTask(t);
                              onOpenChange(false);
                            }}
                            className="w-full truncate rounded px-1 py-0.5 text-left text-xs text-destructive hover:bg-amber-500/10 hover:underline"
                          >
                            {t.title}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {criticalReplans.length > 0 && (
                  <div>
                    <p className="mb-1 text-xs font-medium text-foreground">
                      {criticalReplans.length} replanejamento
                      {criticalReplans.length === 1 ? "" : "s"} no dia
                    </p>
                    <ul className="space-y-0.5">
                      {criticalReplans.map((d, i) => {
                        const found = d.taskId
                          ? tasksForMember.find((t) => t.id === d.taskId)
                          : null;
                        return (
                          <li key={`${d.taskId}_${i}`}>
                            {found ? (
                              <button
                                type="button"
                                onClick={() => openById(found.id)}
                                className="w-full truncate rounded px-1 py-0.5 text-left text-xs hover:bg-amber-500/10 hover:underline"
                              >
                                {d.taskTitle ?? "Tarefa"}
                              </button>
                            ) : (
                              <p className="truncate px-1 py-0.5 text-xs text-muted-foreground">
                                {d.taskTitle ?? "Tarefa"}
                              </p>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
                {missedMeetings.length > 0 && (
                  <div>
                    <p className="mb-1 text-xs font-medium text-foreground">
                      {missedMeetings.length} reunião{missedMeetings.length === 1 ? "" : "ões"}{" "}
                      perdida
                      {missedMeetings.length === 1 ? "" : "s"}
                    </p>
                    <ul className="space-y-0.5">
                      {missedMeetings.map((mt, i) => (
                        <li
                          key={`${mt.meetingId}_${i}`}
                          className="flex items-center gap-1.5 truncate px-1 py-0.5 text-xs text-muted-foreground"
                        >
                          <CalendarClock className="h-3 w-3 shrink-0" />
                          {(mt.meetingId && meetingsById.get(mt.meetingId)?.titulo) ?? "Reunião"}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </section>
            )}

            {upcoming.length > 0 && (
              <section className="space-y-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Próximas entregas
                </p>
                <ul className="divide-y divide-border rounded-md border border-border">
                  {upcoming.map((t) => (
                    <li key={`${t.projectId}_${t.id}`}>
                      <button
                        type="button"
                        onClick={() => {
                          onOpenTask(t);
                          onOpenChange(false);
                        }}
                        className="group flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/40"
                      >
                        <span className="min-w-0 flex-1 truncate text-xs text-foreground group-hover:underline">
                          {t.title}
                        </span>
                        <span
                          className={`shrink-0 text-[11px] tabular-nums ${
                            t.bucket === "atrasada" ? "text-destructive" : "text-muted-foreground"
                          }`}
                        >
                          {t.due}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section className="space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                Carga atual
              </p>
              <p className="text-xs text-foreground">
                {openTasksFull.length} tarefa{openTasksFull.length === 1 ? "" : "s"} aberta
                {openTasksFull.length === 1 ? "" : "s"} · {vencemSemana} vence
                {vencemSemana === 1 ? "" : "m"} esta semana ·{" "}
                <span className={overdueNow.length > 0 ? "text-destructive" : ""}>
                  {overdueNow.length} atrasada{overdueNow.length === 1 ? "" : "s"}
                </span>
              </p>
            </section>

            {projectNames.length > 0 && (
              <section className="space-y-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Projetos e campanhas
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {projectNames.slice(0, PROJECT_CHIP_LIMIT).map((name) => (
                    <span
                      key={name}
                      className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[11px] text-foreground"
                    >
                      <FolderKanban className="h-3 w-3 text-muted-foreground" />
                      {name}
                    </span>
                  ))}
                  {projectNames.length > PROJECT_CHIP_LIMIT && (
                    <span className="inline-flex items-center rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[11px] text-muted-foreground">
                      +{projectNames.length - PROJECT_CHIP_LIMIT}
                    </span>
                  )}
                </div>
              </section>
            )}

            {show("startOfDay") && <StartOfDaySection startTimes={member.startTimes} />}

            <InfoSection member={member} isAdmin={isAdmin} show={show} onEdit={onEdit} />
          </div>
        </div>
        <DialogFooter className="border-t border-border bg-muted/30 px-6 py-3">
          <Button size="sm" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** "Informações do membro" — nível secundário, dados cadastrais
 * (email/aniversário/salário), colapsado por padrão pra não competir
 * visualmente com os dados operacionais acima. */
function InfoSection({
  member,
  isAdmin,
  show,
  onEdit,
}: {
  member: Member;
  isAdmin: boolean;
  show: (f: TimeField) => boolean;
  onEdit: (m: Member) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const rows: Array<{
    key: TimeField;
    label: string;
    icon: React.ReactNode;
    value: React.ReactNode;
  }> = [];
  if (show("name"))
    rows.push({
      key: "name",
      label: "Nome",
      icon: <User className="h-3.5 w-3.5" />,
      value: member.name || "—",
    });
  if (show("role"))
    rows.push({
      key: "role",
      label: "Cargo",
      icon: <Briefcase className="h-3.5 w-3.5" />,
      value: member.role || "—",
    });
  if (show("email"))
    rows.push({
      key: "email",
      label: "Email",
      icon: <Mail className="h-3.5 w-3.5" />,
      value: member.email,
    });
  if (show("birthday"))
    rows.push({
      key: "birthday",
      label: "Aniversário",
      icon: <Calendar className="h-3.5 w-3.5" />,
      value: member.birthday ? formatBirthday(member.birthday) : "—",
    });
  if (show("salary"))
    rows.push({
      key: "salary",
      label: "Salário",
      icon: <DollarSign className="h-3.5 w-3.5" />,
      value: member.salary || "—",
    });

  return (
    <section className="space-y-1.5 border-t border-border pt-4">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-center justify-between text-[10px] font-semibold uppercase tracking-widest text-muted-foreground hover:text-foreground"
      >
        Informações do membro
        <ChevronDown className={`h-3 w-3 transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>
      {expanded &&
        (rows.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Sem informações liberadas para visualização.
          </p>
        ) : (
          <dl className="space-y-2">
            {rows.map((r) => (
              <div
                key={r.key}
                className="flex items-start justify-between gap-3 rounded-md border border-border px-3 py-2"
              >
                <dt className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  {r.icon}
                  {r.label}
                </dt>
                <dd className="break-all text-right text-xs font-medium text-foreground">
                  {r.value}
                </dd>
              </div>
            ))}
          </dl>
        ))}
      {isAdmin && (
        <Button
          size="sm"
          variant="outline"
          className="mt-1 h-7 gap-1.5 text-[11px]"
          onClick={() => onEdit(member)}
        >
          <Pencil className="h-3 w-3" /> Editar membro
        </Button>
      )}
    </section>
  );
}
