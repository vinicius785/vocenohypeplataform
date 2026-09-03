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
import { formatDateToIso } from "@/lib/utils";
import { OPEN_STATUSES } from "@/lib/score";
import { BUCKET_ORDER, type DashTask } from "@/lib/task-aggregation";
import type { Meeting } from "@/lib/reunioes-store";
import {
  computeCompromissos,
  computeEntrega,
  computePrevisibilidade,
  combineScoreV2,
  classifyReplanTiming,
  REPLAN_TIMING_LABEL,
  overdueOpenTasks,
  dedupAttendanceEvents,
  rangeForProfilePeriod,
  previousEquivalentRange,
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
        <Info className="h-3 w-3 shrink-0 cursor-help text-muted-foreground/70" />
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
        <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          {icon}
          {title}
        </p>
        {action}
      </div>
      {children}
    </section>
  );
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

/** Conteúdo de "Início de dia" — só o registro do dia corrente + um
 * botão "Ver histórico" que revela o `StartOfDayHistory` completo (que
 * já se colapsa internamente em 5 + "ver mais"). Duplo colapso
 * deliberado: a ficha não deve mostrar todos os dias permanentemente. */
function StartOfDayContent({ startTimes }: { startTimes?: Record<string, string> }) {
  const [showHistory, setShowHistory] = useState(false);
  const todayKey = formatDateToIso(new Date());
  const todayTime = startTimes?.[todayKey];
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
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
      {showHistory && (
        <div className="mt-2">
          <StartOfDayHistory startTimes={startTimes} />
        </div>
      )}
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
  /** Universo de tarefas "em jogo" no período — base tanto da penalidade
   * de Entrega (vencidas/universo) quanto da taxa de replanejamento de
   * Previsibilidade (tarefas replanejadas/universo): tudo que está aberto
   * agora (qualquer status/bucket) + tudo que foi concluído no período,
   * sem duplicar por id. Nenhum dado novo — só reaproveita o que a ficha
   * já carrega. */
  const universoTarefas = useMemo(() => {
    const ids = new Set<string>();
    for (const t of openTasksFull) ids.add(t.id);
    for (const c of completions) if (c.taskId) ids.add(c.taskId);
    return ids.size;
  }, [openTasksFull, completions]);

  const entrega = useMemo(
    () => computeEntrega(completions, overdueNow.length, universoTarefas),
    [completions, overdueNow.length, universoTarefas],
  );
  const previsibilidade = useMemo(
    () =>
      computePrevisibilidade(
        deadlineChanges.map((d) => ({ taskId: d.taskId, from: d.from, occurredAt: d.occurredAt })),
        universoTarefas,
        performanceSettings.deadlineCutoffHour,
      ),
    [deadlineChanges, universoTarefas, performanceSettings.deadlineCutoffHour],
  );
  const compromissos = useMemo(
    () => computeCompromissos(attendance.map((a) => ({ attended: a.attended }))),
    [attendance],
  );
  const score = useMemo(
    () => combineScoreV2(entrega, previsibilidade, compromissos),
    [entrega, previsibilidade, compromissos],
  );

  // Comparação com o período imediatamente anterior equivalente (item 12
  // do pedido) — mesmo fetch/extração, só sobre outra janela de tempo.
  const previousRange = useMemo(() => previousEquivalentRange(profileRange), [profileRange]);
  const { events: previousEvents } = usePerformanceEvents(previousRange, member.id);
  const previousScore = useMemo(() => {
    const prevCompletions = previousEvents
      .filter((e) => e.eventType === "task_completed")
      .map((e) => ({ outcome: e.data.outcome as TaskOutcome, taskId: e.taskId }));
    const prevDeadlineChanges = previousEvents
      .filter((e) => e.eventType === "task_deadline_changed")
      .map((e) => ({
        taskId: e.taskId,
        from: (e.data.from as string) ?? undefined,
        occurredAt: e.occurredAt,
      }));
    const prevAttendance = dedupAttendanceEvents(
      previousEvents.filter((e) => e.eventType === "meeting_attendance_recorded"),
    ).map((e) => ({ attended: !!e.data.attended }));
    // Sem `tasksForMember`/`openTasksForMember` do período anterior, o
    // universo é aproximado pelas próprias conclusões+alterações desse
    // período — suficiente pra uma comparação de tendência, não precisa
    // ser idêntico ao cálculo do período atual.
    const prevIds = new Set<string>();
    for (const c of prevCompletions) if (c.taskId) prevIds.add(c.taskId);
    for (const d of prevDeadlineChanges) if (d.taskId) prevIds.add(d.taskId);
    const prevUniverso = prevIds.size;
    const prevEntrega = computeEntrega(prevCompletions, 0, prevUniverso);
    const prevPrevisibilidade = computePrevisibilidade(
      prevDeadlineChanges,
      prevUniverso,
      performanceSettings.deadlineCutoffHour,
    );
    const prevCompromissos = computeCompromissos(prevAttendance);
    return combineScoreV2(prevEntrega, prevPrevisibilidade, prevCompromissos);
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
      ? "text-muted-foreground"
      : score.score >= 80
        ? "text-emerald-600 dark:text-emerald-400"
        : score.score < 50
          ? "text-destructive"
          : "text-foreground";

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

  const openById = (id: string) => {
    const t = tasksForMember.find((x) => x.id === id);
    if (t) {
      onOpenTask(t);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={!!member} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] max-w-3xl flex-col gap-0 overflow-hidden p-0">
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
                    <p className="truncate text-sm text-muted-foreground">{member.role}</p>
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
                    <span className="text-[11px] text-muted-foreground">
                      {STATUS_LABEL[status]}
                    </span>
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
                  <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    <Gauge className="h-3.5 w-3.5" /> Score Operacional
                  </p>
                  <div className="text-right">
                    <p className={`text-4xl font-light tracking-tight ${scoreTone}`}>
                      {score.score == null ? "—" : score.score}
                      <span className="text-base text-muted-foreground">/100</span>
                    </p>
                    {score.classificacao && (
                      <p className="text-xs font-medium text-muted-foreground">
                        {score.classificacao}
                      </p>
                    )}
                    {trendLabel && (
                      <p className="text-[11px] text-muted-foreground">{trendLabel}</p>
                    )}
                  </div>
                </div>
                {score.amostraReduzida && (
                  <p className="mt-3 rounded-md bg-muted/40 px-2.5 py-1.5 text-[11px] text-muted-foreground">
                    Score baseado em amostra reduzida — poucos dados no período selecionado.
                  </p>
                )}

                <div className="mt-5 space-y-5">
                  <div>
                    <div className="mb-2.5 flex items-center justify-between gap-2">
                      <p className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
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
                      <p className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
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
                      <p className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        <CalendarClock className="h-3 w-3" /> Compromissos
                      </p>
                      <span className="text-xs font-semibold tabular-nums text-foreground">
                        {score.compromissosPontos == null ? "—" : score.compromissosPontos} / 15
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
                  className="mt-5 flex w-full items-center justify-between border-t border-border pt-4 text-[11px] font-medium text-muted-foreground hover:text-foreground"
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
                        <span className="font-medium text-foreground">Entrega</span>
                        <span className="tabular-nums text-muted-foreground">
                          {score.entregaPontos == null ? "—" : score.entregaPontos} / 50
                        </span>
                      </div>
                      <div className="mt-1.5 space-y-0.5 text-muted-foreground">
                        <p>
                          Taxa de conclusão no prazo:{" "}
                          {entrega.concluidas > 0
                            ? `${Math.round((entrega.noPrazo / entrega.concluidas) * 100)}%`
                            : "—"}
                        </p>
                        <p>Tarefas concluídas: {entrega.concluidas}</p>
                        <p>No prazo: {entrega.noPrazo}</p>
                        <p>Com atraso: {entrega.comAtraso}</p>
                        <p>Atualmente vencidas: {entrega.atualmenteAtrasadas}</p>
                      </div>
                    </div>

                    <div className="border-t border-border pt-3">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-foreground">Previsibilidade</span>
                        <span className="tabular-nums text-muted-foreground">
                          {score.previsibilidadePontos == null ? "—" : score.previsibilidadePontos}{" "}
                          / 35
                        </span>
                      </div>
                      <div className="mt-1.5 space-y-0.5 text-muted-foreground">
                        <p>
                          Taxa de replanejamento:{" "}
                          {fmtTaxaComN(
                            previsibilidade.taxaReplanejamento,
                            previsibilidade.tarefasReplanejadas,
                            previsibilidade.tarefasElegiveis,
                          )}
                        </p>
                        <p>Replanejamentos antecipados: {previsibilidade.porTiming.antecipado}</p>
                        <p>Próximos do prazo: {previsibilidade.porTiming.proximo}</p>
                        <p>No dia: {previsibilidade.porTiming.no_dia}</p>
                        <p>Após vencimento: {previsibilidade.porTiming.apos_vencimento}</p>
                      </div>
                      {(previsibilidade.porTiming.no_dia > 0 ||
                        previsibilidade.porTiming.apos_vencimento > 0 ||
                        (previsibilidade.taxaReplanejamento ?? 0) > 0.15) && (
                        <div className="mt-2 rounded-md bg-background/60 p-2">
                          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                            Principais impactos
                          </p>
                          <ul className="space-y-0.5 text-muted-foreground">
                            {previsibilidade.porTiming.no_dia > 0 && (
                              <li>
                                · {previsibilidade.porTiming.no_dia} prazo
                                {previsibilidade.porTiming.no_dia > 1 ? "s" : ""} alterado
                                {previsibilidade.porTiming.no_dia > 1 ? "s" : ""} no dia da entrega
                              </li>
                            )}
                            {previsibilidade.porTiming.apos_vencimento > 0 && (
                              <li>
                                · {previsibilidade.porTiming.apos_vencimento} prazo
                                {previsibilidade.porTiming.apos_vencimento > 1 ? "s" : ""} alterado
                                {previsibilidade.porTiming.apos_vencimento > 1 ? "s" : ""} após
                                vencimento
                              </li>
                            )}
                            {(previsibilidade.taxaReplanejamento ?? 0) > 0.15 && (
                              <li>
                                · taxa de replanejamento de{" "}
                                {Math.round((previsibilidade.taxaReplanejamento ?? 0) * 100)}%
                              </li>
                            )}
                          </ul>
                        </div>
                      )}
                    </div>

                    <div className="border-t border-border pt-3">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-foreground">Compromissos</span>
                        <span className="tabular-nums text-muted-foreground">
                          {score.compromissosPontos == null ? "—" : score.compromissosPontos} / 15
                        </span>
                      </div>
                      <div className="mt-1.5 space-y-0.5 text-muted-foreground">
                        <p>Reuniões consideradas: {compromissos.expected}</p>
                        <p>Participadas: {compromissos.attended}</p>
                        <p>
                          Perdidas: {Math.max(0, compromissos.expected - compromissos.attended)}
                        </p>
                      </div>
                    </div>

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
                                  className={`shrink-0 ${isSevere ? "text-destructive" : "text-muted-foreground"}`}
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
                            t.bucket === "atrasada" ? "text-destructive" : "text-muted-foreground"
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
                      <span className="inline-flex items-center rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[11px] text-muted-foreground">
                        +{projectNames.length - PROJECT_CHIP_LIMIT}
                      </span>
                    )}
                  </div>
                </ProfileCard>
              )}
            </div>

            {show("startOfDay") && (
              <ProfileCard icon={<Clock className="h-3.5 w-3.5" />} title="Início de dia">
                <StartOfDayContent startTimes={member.startTimes} />
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
          className="h-7 gap-1.5 text-[11px]"
          onClick={() => onEdit(member)}
        >
          <Pencil className="h-3 w-3" /> Editar membro
        </Button>
      )}
    </section>
  );
}
