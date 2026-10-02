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
  ListTodo,
  ClipboardList,
  Sparkles,
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
import { OPEN_STATUSES } from "@/lib/score";
import { BUCKET_ORDER, type DashTask } from "@/lib/task-aggregation";
import type { Meeting } from "@/lib/reunioes-store";
import {
  rangeForProfilePeriod,
  PROFILE_PERIOD_OPTIONS,
  type ProfilePeriodMode,
  type PerformanceSettings,
} from "@/lib/performance-engine";
import type { PerformanceOpenTask } from "@/lib/score";
import type { Member, TimeField } from "@/components/TimeSection";
import { avatarAccent, initialsOf, getStatus, PresenceDot } from "./member-ui";
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
import { ScoreOperacionalPanel } from "./ScoreOperacionalPanel";
import { useMemberPerformance } from "./use-member-performance";

function formatBirthday(value: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  const d = new Date(value);
  return isNaN(d.getTime()) ? value : d.toLocaleDateString("pt-BR");
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
  const {
    previousCompletions,
    previousScore,
    completions,
    deadlineChanges,
    attendance,
    overdueNow,
    score,
    trendLabel,
    aggCurrent,
    aggPrevious,
  } = useMemberPerformance(
    member.id,
    profileRange,
    openTasksForMember,
    performanceSettings.deadlineCutoffHour,
  );
  const previsibilidade = score.previsibilidade;

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

  // "Insights operacionais" (item 39 do pedido) — reaproveita 100% do que
  // esta ficha já calculou acima (Score/prazos/carga/reuniões), sem
  // nenhum fetch novo, exceto a extração equivalente do período ANTERIOR
  // (já buscado via `previousEvents`, só faltava extrair completions/
  // deadlineChanges no mesmo formato de `computeAggregateIndicators`).
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
            <ScoreOperacionalPanel
              score={score}
              trendLabel={trendLabel}
              completions={completions}
              deadlineChanges={deadlineChanges}
              attendance={attendance}
              meetingsById={meetingsById}
              performanceSettings={performanceSettings}
              tasksForMember={tasksForMember}
              openById={openById}
              initialShowComposition={initialShowComposition}
            />

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
