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
  Gauge,
  CheckCircle2,
  RefreshCcw,
  ListTodo,
  ClipboardList,
  Info,
  Sparkles,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { OPEN_STATUSES } from "@/lib/score";
import { BUCKET_ORDER, type DashTask } from "@/lib/task-aggregation";
import type { Meeting } from "@/lib/reunioes-store";
import {
  computeMemberScoreV2,
  classifyReplanTiming,
  REPLAN_TIMING_LABEL,
  overdueOpenTasks,
  dedupAttendanceEvents,
  rangeForProfilePeriod,
  previousEquivalentRange,
  computeAggregateIndicators,
  PROFILE_PERIOD_OPTIONS,
  SAMPLE_CONFIDENCE_LABEL,
  SCORE_CLASSIFICACAO_TONE,
  OPERATIONAL_SCORE_VERSION,
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
import {
  todayIsoInBrasilia,
  currentWeekRangeBrasilia,
  startOfWeekIsoBrasilia,
} from "@/lib/timezone";
import { parseIsoDateLocal, formatDateToIso } from "@/lib/utils";
import { StartOfDayHistoryDialog, averageStartTime } from "./StartOfDayHistoryDialog";
import {
  generateInsights,
  INSIGHT_THRESHOLDS,
  type MemberInsightBundle,
} from "@/lib/insights-engine";
import { InsightRow } from "./InsightRow";

function formatBirthday(value: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  const d = new Date(value);
  return isNaN(d.getTime()) ? value : d.toLocaleDateString("pt-BR");
}

/** "20% · 6 de 30 tarefas" — taxa SEMPRE acompanhada do "N de M" (item 5
 * do pedido: nunca mostrar só a taxa, nem só o número absoluto). */
function fmtTaxaComN(rate: number | null, n: number, total: number): string {
  if (rate == null) return "—";
  return `${Math.round(rate * 100)}% · ${n} de ${total}`;
}

/** Ícone pequeno com tooltip explicativo — reaproveitado nos títulos das
 * métricas mais complexas (item 16 do pedido). Precisa de um
 * `TooltipProvider` ancestral (envolve a seção do Score inteira). */
function InfoTip({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Info className="h-3 w-3 shrink-0 cursor-help text-text-secondary/70" />
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-xs">{text}</TooltipContent>
    </Tooltip>
  );
}

/** Card padrão de seção da ficha — label pequena com ícone no topo,
 * borda única (a ficha não empilha borda-dentro-de-borda), conteúdo
 * livre. Reaproveitado por todas as seções de "leitura rápida" (Próximas
 * entregas/Carga atual/Projetos e campanhas/Início de dia) pra dar um
 * ritmo visual consistente — hoje cada uma tinha um tratamento
 * ligeiramente diferente (com/sem borda, com/sem fundo). */
function ProfileCard({
  icon,
  title,
  action,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-text-secondary">
          {icon}
          {title}
        </p>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Conteúdo de "Início de dia" — hoje + média dos últimos 30 dias (só
 * sobre dias com registro real, nunca inventa horário pra dias sem
 * registro) + "Ver histórico" abrindo o dialog compartilhado com a aba
 * Time (`StartOfDayHistoryDialog`), pra nunca divergir a lógica entre a
 * ficha individual e o bloco consolidado de gestão. */
function StartOfDayContent({ member }: { member: Member }) {
  const [showHistory, setShowHistory] = useState(false);
  const todayKey = todayIsoInBrasilia();
  const todayTime = member.startTimes?.[todayKey];
  const avg30 = averageStartTime(member.startTimes, 30);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-text-secondary">Hoje</span>
        <span className="font-medium tabular-nums text-foreground">{todayTime ?? "—"}</span>
      </div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-text-secondary">Média últimos 30 dias</span>
        <span className="font-medium tabular-nums text-foreground">{avg30 ?? "—"}</span>
      </div>
      <button
        type="button"
        onClick={() => setShowHistory(true)}
        className="mt-1 cursor-pointer text-[11px] font-medium text-text-secondary underline underline-offset-2 hover:text-foreground"
      >
        Ver histórico →
      </button>
      <StartOfDayHistoryDialog member={member} open={showHistory} onOpenChange={setShowHistory} />
    </div>
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
  initialShowComposition,
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
  /** Abre já com "Ver composição do score" expandida — clique no Score
   * (Performance do Time, `TimeSection.tsx`), pra ir direto ao
   * detalhamento sem precisar de mais um clique. */
  initialShowComposition?: boolean;
}) {
  const tv = member.timeView ?? [];
  // BUG CORRIGIDO (2026-09-21): faltava o bypass de admin aqui — a linha da
  // lista (`MemberPerformanceRow.tsx`'s `showName = canManage || isSelf ||
  // m.timeView.includes("name")`) já mostrava o nome real pra um Admin,
  // mas esta ficha usava só `isSelf || tv.includes(f)`, SEM `isAdmin`. Um
  // Admin via o nome certo na lista e, ao abrir a MESMA pessoa na ficha,
  // caía no fallback "Membro" — não era timing/carregamento (`member` já
  // chega pronto via prop, mesma fonte que a lista), era essa condição de
  // visibilidade divergindo entre os dois componentes pro mesmo viewer.
  const show = (f: TimeField) => isAdmin || isSelf || tv.includes(f);
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
          from: (e.data.from as string) ?? undefined,
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

  const openTasksFull = useMemo(
    () => tasksForMember.filter((t) => OPEN_STATUSES.has(t.status)),
    [tasksForMember],
  );
  const overdueNow = useMemo(
    () => overdueOpenTasks(openTasksForMember, undefined, performanceSettings.deadlineCutoffHour),
    [openTasksForMember, performanceSettings.deadlineCutoffHour],
  );
  const score = useMemo(
    () => computeMemberScoreV2(events, openTasksForMember, performanceSettings.deadlineCutoffHour),
    [events, openTasksForMember, performanceSettings.deadlineCutoffHour],
  );
  const entrega = score.entrega;
  const previsibilidade = score.previsibilidade;
  const compromissos = score.compromissos;

  // Comparação com o período imediatamente anterior equivalente (item 12
  // do pedido) — mesmo fetch/extração, só sobre outra janela de tempo.
  const previousRange = useMemo(() => previousEquivalentRange(profileRange), [profileRange]);
  const { events: previousEvents } = usePerformanceEvents(previousRange, member.id);
  const previousScore = useMemo(() => {
    // Sem `openTasksForMember` do período anterior, não há como saber
    // quais tarefas estavam ATUALMENTE atrasadas naquele momento passado
    // (reconstruir isso a partir só do estado atual seria inventar dado —
    // limitação documentada, não uma aproximação silenciosa). A tendência
    // usa só as conclusões e replanejamentos do período anterior; mesma
    // fórmula/versão (`OPERATIONAL_SCORE_VERSION`) do período atual.
    return computeMemberScoreV2(previousEvents, [], performanceSettings.deadlineCutoffHour);
  }, [previousEvents, performanceSettings.deadlineCutoffHour]);
  const trendLabel = useMemo(() => {
    if (score.score == null || previousScore.score == null) return null;
    const diff = score.score - previousScore.score;
    if (diff === 0) return "— Sem alteração vs. período anterior";
    return diff > 0
      ? `↑ ${diff} pts vs. período anterior`
      : `↓ ${Math.abs(diff)} pts vs. período anterior`;
  }, [score.score, previousScore.score]);

  const scoreTone =
    score.score == null
      ? "text-text-secondary"
      : (SCORE_CLASSIFICACAO_TONE[score.classificacao ?? "Sem avaliação"] ?? "text-foreground");

  const [showComposition, setShowComposition] = useState(!!initialShowComposition);
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

  // "Insights operacionais" (item 39 do pedido) — reaproveita 100% do que
  // esta ficha já calculou acima (Score/prazos/carga/reuniões), sem
  // nenhum fetch novo, exceto a extração equivalente do período ANTERIOR
  // (já buscado via `previousEvents`, só faltava extrair completions/
  // deadlineChanges no mesmo formato de `computeAggregateIndicators`).
  const previousCompletions = useMemo(
    () =>
      previousEvents
        .filter((e) => e.eventType === "task_completed")
        .map((e) => ({
          outcome: e.data.outcome as TaskOutcome,
          delayMinutes: (e.data.delayMinutes as number) ?? 0,
          taskId: e.taskId,
        })),
    [previousEvents],
  );
  const previousDeadlineChanges = useMemo(
    () =>
      previousEvents
        .filter((e) => e.eventType === "task_deadline_changed")
        .map((e) => ({
          taskId: e.taskId,
          isCritical: !!e.data.isCritical,
          motivo: (e.data.motivo as string) ?? undefined,
          exemptFromResponsibility: !!e.data.exemptFromResponsibility,
        })),
    [previousEvents],
  );
  const aggCurrent = useMemo(
    () => computeAggregateIndicators(completions, deadlineChanges, overdueNow.length),
    [completions, deadlineChanges, overdueNow.length],
  );
  const aggPrevious = useMemo(
    () => computeAggregateIndicators(previousCompletions, previousDeadlineChanges, 0),
    [previousCompletions, previousDeadlineChanges],
  );
  const thisWeekCompletions = useMemo(() => {
    const week = currentWeekRangeBrasilia();
    return tasksForMember.filter((t) => {
      if (t.status !== "Concluído" || !t.completedAt) return false;
      const day = todayIsoInBrasilia(new Date(t.completedAt));
      return day >= week.from && day <= week.to;
    }).length;
  }, [tasksForMember]);
  const monthlyWeeklyAvg = useMemo(() => {
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    let fromIso = formatDateToIso(from);
    const earliestCompleted = tasksForMember
      .filter((t) => t.status === "Concluído" && t.completedAt)
      .map((t) => todayIsoInBrasilia(new Date(t.completedAt!)))
      .sort()[0];
    if (earliestCompleted && earliestCompleted > fromIso) fromIso = earliestCompleted;
    const to = todayIsoInBrasilia();
    const weekStarts: string[] = [];
    const cursor = parseIsoDateLocal(fromIso);
    const end = parseIsoDateLocal(to);
    while (cursor.getTime() <= end.getTime()) {
      weekStarts.push(startOfWeekIsoBrasilia(cursor));
      cursor.setDate(cursor.getDate() + 7);
    }
    if (weekStarts.length === 0) return null;
    const counts = new Map<string, number>();
    for (const t of tasksForMember) {
      if (t.status !== "Concluído" || !t.completedAt) continue;
      const day = todayIsoInBrasilia(new Date(t.completedAt));
      if (day < fromIso || day > to) continue;
      const ws = startOfWeekIsoBrasilia(new Date(t.completedAt));
      counts.set(ws, (counts.get(ws) ?? 0) + 1);
    }
    const total = weekStarts.reduce((s, ws) => s + (counts.get(ws) ?? 0), 0);
    return total / weekStarts.length;
  }, [tasksForMember]);
  const memberInsights = useMemo(() => {
    const last14 = new Date();
    last14.setDate(last14.getDate() - 14);
    const last14Iso = formatDateToIso(last14);
    const completionsLast14 = completions.filter((c) => c.occurredAt >= last14Iso);
    const noLateInLast14 =
      completionsLast14.length >= INSIGHT_THRESHOLDS.amostraMinima &&
      !completionsLast14.some((c) => c.outcome === "late");

    const overdueHighPriorityCount = overdueTasksFull.filter(
      (t) => t.priority === "Alta" || t.priority === "Urgente",
    ).length;
    const overdueOlderThanThresholdCount = overdueTasksFull.filter((t) => {
      const match = /Atrasada (\d+)d/.exec(t.due);
      return match ? Number(match[1]) >= INSIGHT_THRESHOLDS.atrasadasAntigasDias : false;
    }).length;

    const concentrationGroups = new Map<string, { count: number; label: string }>();
    for (const t of openTasksFull) {
      const key = t.campanhaId ?? t.projectId;
      const g = concentrationGroups.get(key);
      if (g) g.count += 1;
      else concentrationGroups.set(key, { count: 1, label: t.projectName });
    }
    let topConcentration: { count: number; label: string } | null = null;
    for (const g of concentrationGroups.values()) {
      if (!topConcentration || g.count > topConcentration.count) topConcentration = g;
    }

    const startTimes = member.startTimes ?? {};
    const recentDays = Object.keys(startTimes)
      .sort((a, b) => (a < b ? 1 : -1))
      .slice(0, 10);
    const earlyStartCount =
      recentDays.length > 0
        ? recentDays.filter((d) => {
            const hour = Number(startTimes[d]?.split(":")[0]);
            return Number.isFinite(hour) && hour < INSIGHT_THRESHOLDS.inicioDiaAntesDasHora;
          }).length
        : null;

    const bundle: MemberInsightBundle = {
      memberId: member.id,
      memberName: member.name,
      role: member.role,
      thisWeekTotal: thisWeekCompletions,
      monthlyWeeklyAvg,
      onTimeRateCurrent: aggCurrent.pctNoPrazo,
      onTimeRatePrevious: aggPrevious.pctNoPrazo,
      onTimeSampleCurrent: completions.length,
      onTimeSamplePrevious: previousCompletions.length,
      avgDelayDaysCurrent: aggCurrent.tempoMedioAtrasoDias,
      avgDelayDaysPrevious: aggPrevious.tempoMedioAtrasoDias,
      replansCurrent: aggCurrent.qtdReplanejamentos,
      replansPrevious: aggPrevious.qtdReplanejamentos,
      criticalReplansCurrent: aggCurrent.qtdReplanejamentosNoDia,
      criticalReplansPrevious: aggPrevious.qtdReplanejamentosNoDia,
      repeatedProblematicReplansCurrent: previsibilidade.repeatedProblematicReplans,
      // "Esta semana"/"Este mês" são sempre um recorte ATÉ HOJE (calendário
      // em andamento) — comparar contra "período anterior equivalente"
      // (mesma duração, mas já encerrado) sem avisar isso enganaria quem lê
      // a comparação. "Mês anterior"/"Últimos 90 dias" já são janelas
      // fechadas, nunca parciais.
      currentPeriodPartial: profilePeriod === "mes" || profilePeriod === "semana",
      overdueCount: overdueTasksFull.length,
      overdueHighPriorityCount,
      overdueOlderThanThresholdCount,
      noOverdueForDays: noLateInLast14 ? INSIGHT_THRESHOLDS.semAtrasoDias : null,
      scoreNow: score.score,
      scorePrevious: previousScore.score,
      scorePeriodLabel: "no período selecionado",
      openTasksCount: openTasksFull.length,
      activeProjectsCount: new Set(openTasksFull.map((t) => t.campanhaId ?? t.projectId)).size,
      teamAvgActiveProjects: null,
      topConcentrationLabel: topConcentration?.label ?? null,
      topConcentrationPct:
        topConcentration && openTasksFull.length > 0
          ? topConcentration.count / openTasksFull.length
          : null,
      meetingsExpected: attendance.length,
      meetingsAttended: attendance.filter((a) => a.attended).length,
      earlyStartCount,
      earlyStartWindow: recentDays.length > 0 ? recentDays.length : null,
    };
    return generateInsights([bundle], 5);
  }, [
    completions,
    overdueTasksFull,
    openTasksFull,
    member,
    thisWeekCompletions,
    monthlyWeeklyAvg,
    aggCurrent,
    aggPrevious,
    previousCompletions,
    score.score,
    previousScore.score,
    previsibilidade.repeatedProblematicReplans,
    profilePeriod,
    attendance,
  ]);

  const openById = (id: string) => {
    const t = tasksForMember.find((x) => x.id === id);
    if (t) {
      onOpenTask(t);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={!!member} onOpenChange={onOpenChange}>
      <DialogContent
        mobileFullScreen
        className="flex max-h-[92vh] max-w-3xl flex-col gap-0 overflow-hidden p-0"
      >
        <DialogHeader className="border-b border-border px-7 py-5">
          <DialogTitle>Perfil</DialogTitle>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="space-y-5 px-7 py-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-5">
                <div className="relative shrink-0">
                  <Avatar className="h-20 w-20">
                    {member.photo && <AvatarImage src={member.photo} alt={member.name} />}
                    <AvatarFallback className={`text-xl font-semibold ${avatarAccent(member.id)}`}>
                      {initialsOf(show("name") ? member.name : "", member.email)}
                    </AvatarFallback>
                  </Avatar>
                  <PresenceDot status={status} />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-base font-semibold text-foreground">
                    {show("name") ? member.name || "(sem nome)" : "Membro"}
                  </p>
                  {show("role") && member.role && (
                    <p className="truncate text-sm text-text-secondary">{member.role}</p>
                  )}
                  <div className="mt-1.5 flex items-center gap-1.5">
                    {member.isAdmin && (
                      <Badge
                        variant="outline"
                        className="gap-1 border-foreground/20 px-1.5 py-0 text-[10px] font-medium"
                      >
                        <ShieldCheck className="h-2.5 w-2.5" /> Admin
                      </Badge>
                    )}
                    <span className="text-[11px] text-text-secondary">{STATUS_LABEL[status]}</span>
                  </div>
                </div>
              </div>
              <select
                value={profilePeriod}
                onChange={(e) => setProfilePeriod(e.target.value as ProfilePeriodMode)}
                className="h-9 rounded-md border border-border bg-background px-2.5 text-xs outline-none focus:ring-2 focus:ring-ring"
              >
                {PROFILE_PERIOD_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Score Operacional */}
            <TooltipProvider delayDuration={200}>
              <section className="rounded-lg border border-border p-5">
                <div className="flex items-start justify-between gap-3">
                  <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-text-secondary">
                    <Gauge className="h-3.5 w-3.5" /> Score Operacional
                    <InfoTip text="Este indicador analisa execução operacional, prazos e compromissos. Ele não representa sozinho a performance completa do profissional." />
                  </p>
                  <div className="text-right">
                    <p
                      className={`flex items-center justify-end gap-1.5 text-4xl font-light tracking-tight ${scoreTone}`}
                    >
                      {score.score == null ? "—" : score.score}
                      {score.score != null && (
                        <span className="text-base text-text-secondary">/100</span>
                      )}
                    </p>
                    {score.dataState === "sem_dados" && (
                      <p className="text-xs font-medium text-text-secondary">
                        Sem dados suficientes
                      </p>
                    )}
                    {score.dataState === "provisorio" && (
                      <p className="text-xs font-medium text-amber-600 dark:text-amber-400">
                        Provisório
                      </p>
                    )}
                    {score.classificacao && (
                      <p className="text-xs font-medium text-text-secondary">
                        {score.classificacao}
                      </p>
                    )}
                    {score.dataState !== "sem_dados" && (
                      <p className="text-[11px] text-text-secondary">
                        {SAMPLE_CONFIDENCE_LABEL[score.confidence]}
                      </p>
                    )}
                    {trendLabel && score.dataState !== "sem_dados" && (
                      <p className="text-[11px] text-text-secondary">{trendLabel}</p>
                    )}
                  </div>
                </div>
                {score.dataState === "sem_dados" && (
                  <p className="mt-3 rounded-md bg-muted/40 px-2.5 py-1.5 text-[11px] text-text-secondary">
                    Nenhuma atividade operacional no período selecionado — sem tarefa concluída,
                    tarefa aberta com prazo, ou reunião esperada neste recorte, não há base pra
                    calcular um score.
                  </p>
                )}
                {score.dataState === "provisorio" && (
                  <p className="mt-3 rounded-md bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-700 dark:text-amber-400">
                    Baseado em {score.amostra} tarefa{score.amostra === 1 ? "" : "s"} — amostra
                    pequena ({SAMPLE_CONFIDENCE_LABEL[score.confidence].toLowerCase()}), ainda sem
                    classificação definitiva e fora de comparações/rankings com outras pessoas.
                  </p>
                )}
                {score.dataState === "definitivo" && (
                  <p className="mt-3 text-[11px] text-text-secondary">
                    Baseado em {score.amostra} tarefas no período ·{" "}
                    {SAMPLE_CONFIDENCE_LABEL[score.confidence]}
                  </p>
                )}

                <div className="mt-5 space-y-5">
                  <div>
                    <div className="mb-2.5 flex items-center justify-between gap-2">
                      <p className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-text-secondary">
                        <CheckCircle2 className="h-3 w-3" /> Entrega
                      </p>
                      <span className="text-xs font-semibold tabular-nums text-foreground">
                        {score.entregaPontos == null ? "—" : score.entregaPontos} / 50
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <MiniStat label="Concluídas no período" value={entrega.concluidas} />
                      <MiniStat label="No prazo" value={entrega.noPrazo} />
                      <MiniStat
                        label="Com atraso"
                        value={entrega.comAtraso}
                        tone={entrega.comAtraso > 0 ? "danger" : "neutral"}
                      />
                      <MiniStat
                        label="Atualmente atrasadas"
                        value={entrega.atualmenteAtrasadas}
                        tone={entrega.atualmenteAtrasadas > 0 ? "danger" : "neutral"}
                      />
                    </div>
                  </div>
                  <div className="border-t border-border pt-5">
                    <div className="mb-2.5 flex items-center justify-between gap-2">
                      <p className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-text-secondary">
                        <RefreshCcw className="h-3 w-3" /> Previsibilidade
                        <InfoTip text="Mede a estabilidade do planejamento considerando alterações de prazo e o momento em que ocorreram." />
                      </p>
                      <span className="text-xs font-semibold tabular-nums text-foreground">
                        {score.previsibilidadePontos == null ? "—" : score.previsibilidadePontos} /
                        35
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                      <MiniStat
                        label="Taxa de replanejamento"
                        value={fmtTaxaComN(
                          previsibilidade.taxaReplanejamento,
                          previsibilidade.tarefasReplanejadas,
                          previsibilidade.tarefasElegiveis,
                        )}
                      />
                      <MiniStat
                        label="No dia"
                        value={previsibilidade.porTiming.no_dia}
                        tone={previsibilidade.porTiming.no_dia > 0 ? "danger" : "neutral"}
                      />
                      <MiniStat
                        label="Após vencimento"
                        value={previsibilidade.porTiming.apos_vencimento}
                        tone={previsibilidade.porTiming.apos_vencimento > 0 ? "danger" : "neutral"}
                      />
                    </div>
                  </div>
                  <div className="border-t border-border pt-5">
                    <div className="mb-2.5 flex items-center justify-between gap-2">
                      <p className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-text-secondary">
                        <CalendarClock className="h-3 w-3" /> Compromissos
                        {!score.compromissosAplicavel && (
                          <InfoTip text="Sem reunião esperada desta pessoa no período — a dimensão não entra no cálculo do score (nem soma, nem penaliza)." />
                        )}
                      </p>
                      <span className="text-xs font-semibold tabular-nums text-foreground">
                        {score.compromissosAplicavel ? (
                          <>{score.compromissosPontos} / 15</>
                        ) : (
                          <span className="text-text-secondary">Não aplicável</span>
                        )}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <MiniStat
                        label="Reuniões consideradas"
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
                  className="mt-5 flex w-full items-center justify-between border-t border-border pt-4 text-[11px] font-medium text-text-secondary hover:text-foreground"
                >
                  Ver composição do score
                  <ChevronDown
                    className={`h-3 w-3 transition-transform ${showComposition ? "rotate-180" : ""}`}
                  />
                </button>

                {showComposition && (
                  <div className="mt-4 space-y-4 rounded-lg border border-border bg-muted/20 p-4 text-xs">
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-foreground">
                          Entregas e prazo — fórmula
                        </span>
                        <span className="tabular-nums text-text-secondary">
                          {score.entregaPontos == null ? "—" : score.entregaPontos} / 50
                        </span>
                      </div>
                      <div className="mt-1.5 space-y-0.5 text-text-secondary">
                        <p className="font-medium text-foreground/80">
                          Conclusões no prazo (até 40 pts)
                        </p>
                        <p>
                          onTimeRate = concluídas no prazo ÷ concluídas com prazo definido ={" "}
                          {entrega.completedOnTime} ÷ {entrega.completedTasksWithDeadline} ={" "}
                          {entrega.onTimeRate == null
                            ? "—"
                            : `${Math.round(entrega.onTimeRate * 100)}%`}
                        </p>
                        <p>
                          Pontos:{" "}
                          {entrega.onTimePoints == null ? "—" : entrega.onTimePoints.toFixed(1)} /
                          40
                        </p>
                        <p>Concluídas com atraso: {entrega.completedLate}</p>
                        <p>
                          Sem prazo definido (ignoradas nesta taxa): {entrega.semPrazoCount} — não
                          entram nem a favor nem contra por não terem prazo pra comparar.
                        </p>
                        <p className="mt-2 font-medium text-foreground/80">
                          Saúde atual dos prazos (até 10 pts)
                        </p>
                        <p>
                          healthRate = 1 − (atraso ponderado ÷ base do período) = 1 − (
                          {entrega.weightedCurrentOverdue.toFixed(2)} ÷ {entrega.periodTaskBase}) ={" "}
                          {entrega.currentHealthRate == null
                            ? "—"
                            : `${Math.round(entrega.currentHealthRate * 100)}%`}
                        </p>
                        <p>
                          Pontos:{" "}
                          {entrega.healthPoints == null ? "—" : entrega.healthPoints.toFixed(1)} /
                          10 · base do período (concluídas com prazo + abertas com prazo):{" "}
                          {entrega.periodTaskBase}
                        </p>
                      </div>

                      {entrega.overdueDetails.filter((d) => d.weightedContribution > 0).length >
                        0 && (
                        <div className="mt-2 rounded-md bg-background/60 p-2">
                          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-text-secondary">
                            Tarefas que causaram desconto na saúde atual
                          </p>
                          <ul className="space-y-1 text-text-secondary">
                            {entrega.overdueDetails
                              .filter((d) => d.weightedContribution > 0)
                              .map((d) => {
                                const found = d.id
                                  ? tasksForMember.find((t) => t.id === d.id)
                                  : null;
                                const label = (
                                  <>
                                    <span className="min-w-0 flex-1 truncate">
                                      {d.title ?? "Tarefa"}
                                    </span>
                                    <span className="shrink-0 text-destructive">
                                      +{d.daysOverdue}d{d.highPriority ? " · alta prioridade" : ""}
                                      {d.internallyBlocked ? " · bloqueada internamente" : ""} ·
                                      peso {d.weightedContribution.toFixed(2)}
                                    </span>
                                  </>
                                );
                                return (
                                  <li key={d.id} className="flex items-center gap-2">
                                    {found ? (
                                      <button
                                        type="button"
                                        onClick={() => openById(found.id)}
                                        className="flex w-full items-center gap-2 rounded px-1 py-0.5 text-left hover:bg-muted/50 hover:underline"
                                      >
                                        {label}
                                      </button>
                                    ) : (
                                      <div className="flex w-full items-center gap-2 px-1 py-0.5">
                                        {label}
                                      </div>
                                    )}
                                  </li>
                                );
                              })}
                          </ul>
                        </div>
                      )}

                      {entrega.overdueDetails.filter((d) => d.externallyBlocked).length > 0 && (
                        <div className="mt-2 rounded-md bg-background/60 p-2">
                          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-text-secondary">
                            Dependências externas desconsideradas (bloqueio ativo)
                          </p>
                          <ul className="space-y-0.5 text-text-secondary">
                            {entrega.overdueDetails
                              .filter((d) => d.externallyBlocked)
                              .map((d) => (
                                <li key={d.id} className="truncate">
                                  · {d.title ?? "Tarefa"} — atrasada há {d.daysOverdue}d, mas
                                  bloqueada aguardando cliente/fornecedor, não penalizada.
                                </li>
                              ))}
                          </ul>
                        </div>
                      )}
                    </div>

                    <div className="border-t border-border pt-3">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-foreground">Previsibilidade</span>
                        <span className="tabular-nums text-text-secondary">
                          {score.previsibilidadePontos == null ? "—" : score.previsibilidadePontos}{" "}
                          / 35
                        </span>
                      </div>
                      <div className="mt-1.5 space-y-0.5 text-text-secondary">
                        <p>
                          predictabilityLoss = sameDayRate×5 + lateReplanRate×20 + repeatedRate×10 ={" "}
                          {previsibilidade.predictabilityLoss.toFixed(1)} pts descontados de 35
                        </p>
                        <p>
                          Taxa de replanejamento:{" "}
                          {fmtTaxaComN(
                            previsibilidade.taxaReplanejamento,
                            previsibilidade.tarefasReplanejadas,
                            previsibilidade.tarefasElegiveis,
                          )}
                        </p>
                        <p>
                          Replanejamentos antecipados (sem penalidade):{" "}
                          {previsibilidade.earlyReplans}
                        </p>
                        <p>No dia (penalidade leve): {previsibilidade.sameDayReplans}</p>
                        <p>Após vencimento (penalidade maior): {previsibilidade.lateReplans}</p>
                        <p>
                          Repetições problemáticas na mesma tarefa:{" "}
                          {previsibilidade.repeatedProblematicReplans}
                        </p>
                        {previsibilidade.exemptedCount > 0 && (
                          <p>
                            Isentos por dependência externa registrada a tempo:{" "}
                            {previsibilidade.exemptedCount}
                          </p>
                        )}
                      </div>
                    </div>

                    {deadlineChanges.length > 0 && (
                      <div className="border-t border-border pt-2">
                        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-text-secondary">
                          Replanejamentos considerados no período
                        </p>
                        <ul className="space-y-0.5">
                          {deadlineChanges.map((d, i) => {
                            const timing = d.from
                              ? classifyReplanTiming(
                                  d.from,
                                  d.occurredAt,
                                  performanceSettings.deadlineCutoffHour,
                                )
                              : null;
                            const isSevere = timing === "no_dia" || timing === "apos_vencimento";
                            const exempted = isSevere && d.exemptFromResponsibility;
                            return (
                              <li
                                key={`${d.taskId}_${i}`}
                                className="flex items-center justify-between gap-2 px-1 py-0.5"
                              >
                                <span className="min-w-0 flex-1 truncate">
                                  {d.taskTitle ?? "Tarefa"}
                                </span>
                                <span
                                  className={`shrink-0 ${isSevere && !exempted ? "text-destructive" : "text-text-secondary"}`}
                                >
                                  {timing ? REPLAN_TIMING_LABEL[timing] : "—"}
                                  {exempted && " · isento (dependência externa)"}
                                  {d.motivo &&
                                    ` · ${DEADLINE_CHANGE_MOTIVO_LABEL[d.motivo as DeadlineChangeMotivo] ?? d.motivo}`}
                                </span>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    )}

                    <div className="border-t border-border pt-3">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-foreground">Compromissos</span>
                        <span className="tabular-nums text-text-secondary">
                          {score.compromissosAplicavel
                            ? `${score.compromissosPontos} / 15`
                            : "Não aplicável"}
                        </span>
                      </div>
                      <div className="mt-1.5 space-y-0.5 text-text-secondary">
                        {score.compromissosAplicavel ? (
                          <>
                            <p>Reuniões consideradas: {compromissos.expected}</p>
                            <p>Participadas: {compromissos.attended}</p>
                            <p>
                              Perdidas: {Math.max(0, compromissos.expected - compromissos.attended)}
                            </p>
                            {attendance.length > 0 && (
                              <ul className="mt-1 space-y-0.5">
                                {attendance.slice(0, 8).map((a, i) => {
                                  const meeting = a.meetingId
                                    ? meetingsById.get(a.meetingId)
                                    : null;
                                  return (
                                    <li key={a.meetingId ?? i} className="flex items-center gap-2">
                                      <span className="min-w-0 flex-1 truncate">
                                        {meeting?.titulo ?? "Reunião"}
                                      </span>
                                      <span
                                        className={
                                          a.attended ? "text-text-secondary" : "text-destructive"
                                        }
                                      >
                                        {a.attended ? "Participou" : "Perdeu"}
                                      </span>
                                    </li>
                                  );
                                })}
                              </ul>
                            )}
                          </>
                        ) : (
                          <p>
                            Nenhuma reunião esperada desta pessoa no período — peso redistribuído
                            entre Entrega e Previsibilidade (não conta nem a favor nem contra).
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="border-t border-border pt-2 text-text-secondary">
                      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide">
                        Dados desconsiderados nesta composição
                      </p>
                      <ul className="space-y-0.5">
                        <li>
                          · {entrega.semPrazoCount} tarefa{entrega.semPrazoCount === 1 ? "" : "s"}{" "}
                          concluída{entrega.semPrazoCount === 1 ? "" : "s"} sem prazo definido — sem
                          prazo pra comparar, não entram na taxa de conclusão no prazo.
                        </li>
                        <li>
                          · Ausência não justificada em reunião conta contra a taxa de Compromissos
                          — este produto ainda não distingue "ausência justificada" de "não
                          compareceu" no cadastro de reuniões (gap documentado, não uma aproximação
                          silenciosa).
                        </li>
                      </ul>
                    </div>

                    <p className="border-t border-border pt-2 text-[10px] text-text-secondary/70">
                      Fórmula v{score.version} · Score Operacional (
                      {OPERATIONAL_SCORE_VERSION === score.version ? "atual" : "versão anterior"})
                    </p>

                    {completions.length > 0 && (
                      <div className="border-t border-border pt-2">
                        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-text-secondary">
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
                                  className={`shrink-0 ${c.outcome === "late" ? "text-destructive" : "text-text-secondary"}`}
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
                                  <div className="flex items-center gap-2 px-1 py-0.5 text-text-secondary">
                                    {content}
                                  </div>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                        {completions.length > 8 && (
                          <p className="mt-1 text-[10px] text-text-secondary">
                            +{completions.length - 8} outra{completions.length - 8 === 1 ? "" : "s"}
                          </p>
                        )}
                      </div>
                    )}

                    {deadlineChanges.length > 0 && (
                      <div className="border-t border-border pt-2">
                        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-text-secondary">
                          Replanejamentos no período
                        </p>
                        <ul className="space-y-0.5">
                          {deadlineChanges.slice(0, 8).map((d, i) => {
                            const timing = d.from
                              ? classifyReplanTiming(
                                  d.from,
                                  d.occurredAt,
                                  performanceSettings.deadlineCutoffHour,
                                )
                              : null;
                            const isSevere = timing === "no_dia" || timing === "apos_vencimento";
                            return (
                              <li
                                key={`${d.taskId}_${i}`}
                                className="flex items-center justify-between gap-2 px-1 py-0.5"
                              >
                                <span className="min-w-0 flex-1 truncate">
                                  {d.taskTitle ?? "Tarefa"}
                                </span>
                                <span
                                  className={`shrink-0 ${isSevere ? "text-destructive" : "text-text-secondary"}`}
                                >
                                  {timing ? REPLAN_TIMING_LABEL[timing] : "—"}
                                  {d.motivo &&
                                    ` · ${DEADLINE_CHANGE_MOTIVO_LABEL[d.motivo as DeadlineChangeMotivo] ?? d.motivo}`}
                                </span>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </section>
            </TooltipProvider>

            {memberInsights.length > 0 && (
              <section className="space-y-1 rounded-lg border border-border p-4">
                <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-text-secondary">
                  <Sparkles className="h-3.5 w-3.5" /> Insights operacionais
                </p>
                <div className="divide-y divide-border">
                  {memberInsights.map((insight) => (
                    <InsightRow key={insight.ruleId} insight={insight} hideName />
                  ))}
                </div>
              </section>
            )}

            {hasAttention && (
              <section className="space-y-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
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
                              <p className="truncate px-1 py-0.5 text-xs text-text-secondary">
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
                          className="flex items-center gap-1.5 truncate px-1 py-0.5 text-xs text-text-secondary"
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
              <ProfileCard icon={<ListTodo className="h-3.5 w-3.5" />} title="Próximas entregas">
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
                            t.bucket === "atrasada" ? "text-destructive" : "text-text-secondary"
                          }`}
                        >
                          {t.due}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </ProfileCard>
            )}

            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <ProfileCard icon={<ClipboardList className="h-3.5 w-3.5" />} title="Carga atual">
                <p className="text-xs text-foreground">
                  {openTasksFull.length} tarefa{openTasksFull.length === 1 ? "" : "s"} aberta
                  {openTasksFull.length === 1 ? "" : "s"} · {vencemSemana} vence
                  {vencemSemana === 1 ? "" : "m"} esta semana ·{" "}
                  <span className={overdueNow.length > 0 ? "text-destructive" : ""}>
                    {overdueNow.length} atrasada{overdueNow.length === 1 ? "" : "s"}
                  </span>
                </p>
              </ProfileCard>

              {projectNames.length > 0 && (
                <ProfileCard
                  icon={<FolderKanban className="h-3.5 w-3.5" />}
                  title="Projetos e campanhas"
                >
                  <div className="flex flex-wrap gap-1.5">
                    {projectNames.slice(0, PROJECT_CHIP_LIMIT).map((name) => (
                      <span
                        key={name}
                        className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[11px] text-foreground"
                      >
                        {name}
                      </span>
                    ))}
                    {projectNames.length > PROJECT_CHIP_LIMIT && (
                      <span className="inline-flex items-center rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[11px] text-text-secondary">
                        +{projectNames.length - PROJECT_CHIP_LIMIT}
                      </span>
                    )}
                  </div>
                </ProfileCard>
              )}
            </div>

            {show("startOfDay") && (
              <ProfileCard icon={<Clock className="h-3.5 w-3.5" />} title="Início de dia">
                <StartOfDayContent member={member} />
              </ProfileCard>
            )}

            <InfoSection member={member} isAdmin={isAdmin} show={show} onEdit={onEdit} />
          </div>
        </div>
        <DialogFooter className="border-t border-border bg-muted/30 px-7 py-4">
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
    <section className="space-y-2.5 border-t border-border pt-5">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-center justify-between text-[10px] font-semibold uppercase tracking-widest text-text-secondary hover:text-foreground"
      >
        Informações do membro
        <ChevronDown className={`h-3 w-3 transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>
      {expanded &&
        (rows.length === 0 ? (
          <p className="text-xs text-text-secondary">
            Sem informações liberadas para visualização.
          </p>
        ) : (
          <dl className="space-y-2">
            {rows.map((r) => (
              <div
                key={r.key}
                className="flex items-start justify-between gap-3 rounded-md border border-border px-3 py-2"
              >
                <dt className="flex items-center gap-1.5 text-[11px] text-text-secondary">
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
          className="h-7 gap-1.5 text-[11px]"
          onClick={() => onEdit(member)}
        >
          <Pencil className="h-3 w-3" /> Editar membro
        </Button>
      )}
    </section>
  );
}
