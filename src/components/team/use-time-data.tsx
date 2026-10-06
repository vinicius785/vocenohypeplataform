import { stageComercialTask } from "@/lib/comercial-task-link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { loadProjetos, onProjetosChange } from "@/lib/projetos";
import { insightWindows } from "@/components/time-v2/team-metrics";
import { onMeetingsChange, loadMeetings } from "@/lib/reunioes-store";
import { useClientes } from "@/lib/clientes-store";
import { getAllCampanhaTarefas, onCampanhaTarefasChange } from "@/lib/campanha-scoped-store";
import { onStandaloneChange } from "@/lib/marketing-tasks";
import { comercialAsTaskGroup, onComercialTasksChange } from "@/lib/comercial-tasks";
import {
  weekdayProductivity,
  weeklyDeliveryTotalsByMember,
  loadOpenTasksByMemberId,
  OPEN_STATUSES,
  type TaskGroup,
  type PerformanceOpenTask,
} from "@/lib/score";
import {
  computeMemberScoreV2,
  computeAggregateIndicators,
  rangeForScorePeriod,
  groupEventsByPerson,
  dedupAttendanceEvents,
  type ScorePeriodMode,
  type ScoreOperacionalV2,
  type TaskOutcome,
  type PerformanceEventLike,
} from "@/lib/performance-engine";
import { usePerformanceEvents, usePerformanceSettings } from "@/lib/performance-events-store";
import {
  loadTasksByAssignee,
  loadAllTasksFlat,
  marketingStandaloneAsTaskGroup,
  type DashTask,
  type DashTaskFlat,
} from "@/lib/task-aggregation";
import { formatDateToIso } from "@/lib/utils";
import {
  currentWeekRangeBrasilia,
  previousWeekRangeBrasilia,
  weekdayIndexInBrasilia,
  todayIsoInBrasilia,
} from "@/lib/timezone";
import {
  generateInsights,
  INSIGHT_THRESHOLDS,
  type MemberInsightBundle,
} from "@/lib/insights-engine";
import type { DeliveryMemberRow } from "@/components/team/TeamDeliveriesWeek";
import {
  OPEN_CAMPANHA_TASK_KEY,
  OPEN_MEMBER_KEY,
  OPEN_MEMBER_EVENT,
  type SectionKey,
} from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import type { Permission } from "@/lib/permissions";
import {
  createTeamMember,
  updateTeamMember,
  deleteTeamMember,
  resetMemberPassword,
  getTeamDirectory,
} from "@/lib/team.functions";
import { getStatus, subscribeChat } from "@/lib/chat-store";
import { useStorageSync } from "@/lib/use-storage-sync";
import { withRetry, friendlyNetworkError } from "@/lib/net-retry";
import { useConfirm } from "@/hooks/use-confirm";
import type { Member, MemberFormPayload, TimeField } from "@/components/TimeSection";

const MEMBERS_KEY = "time:membros";
const friendlyError = friendlyNetworkError;

/**
 * Camada de dados única da aba Time — extraída de `DiretorioTab`
 * (TimeSection.tsx) sem mudar nenhuma regra, pra a V1 e a V2 lerem
 * exatamente os mesmos membros/score/tarefas/insights (nunca duas
 * implementações paralelas do mesmo cálculo). Estado de UI (busca,
 * modais abertos, aba de atenção) fica em cada página; aqui só dado +
 * ações que falam com o servidor.
 */
export function useTimeData() {
  const navigate = useNavigate();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createdInfo, setCreatedInfo] = useState<{ email: string; tempPassword: string } | null>(
    null,
  );
  const [isAdmin, setIsAdmin] = useState(false);
  const [meId, setMeId] = useState<string | null>(null);
  const [, forcePresence] = useState(0);
  const { confirm, confirmDialog } = useConfirm();
  const createFn = useServerFn(createTeamMember);
  const updateFn = useServerFn(updateTeamMember);
  const deleteFn = useServerFn(deleteTeamMember);
  const resetFn = useServerFn(resetMemberPassword);

  type TeamDirEntry = {
    id: string;
    email?: string;
    name?: string;
    role?: string;
    salary?: string;
    birthday?: string | null;
    photo?: string;
    permissions?: string[];
    timeView?: string[];
    startTimes?: Record<string, string>;
    isAdmin?: boolean;
  };

  const mapDirToMembers = (dir: TeamDirEntry[]): Member[] =>
    dir.map((d) => ({
      id: d.id,
      email: d.email ?? "",
      name: d.name === "Sem nome" ? "" : (d.name ?? ""),
      role: d.role ?? "",
      salary: d.salary ?? "",
      birthday: d.birthday ?? "",
      photo: d.photo ?? undefined,
      permissions: (d.permissions ?? []) as Permission[],
      timeView: (d.timeView ?? []) as TimeField[],
      startTimes: d.startTimes ?? {},
      isAdmin: Boolean(d.isAdmin),
    }));

  const load = async () => {
    setLoading(true);
    try {
      const dir = await withRetry(() => getTeamDirectory());
      setMembers(mapDirToMembers(dir));
      localStorage.setItem(MEMBERS_KEY, JSON.stringify(dir));
      window.dispatchEvent(new Event("time:membros:changed"));
      setError(null);
    } catch (e) {
      setError(friendlyError(e, "Falha ao carregar time"));
    }
    setLoading(false);
  };

  // Another tab/teammate hydrating their profile (or the background poll in
  // _authenticated/route.tsx) refreshes the shared `time:membros` cache —
  // just re-read it instead of triggering our own redundant server-fn call,
  // which was doubling up network traffic and doubling the odds of hitting a
  // transient "Failed to fetch" on every poll tick.
  const applyFromCache = () => {
    try {
      const raw = localStorage.getItem(MEMBERS_KEY);
      if (!raw) return;
      setMembers(mapDirToMembers(JSON.parse(raw) as TeamDirEntry[]));
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    let cancelled = false;
    applyFromCache();
    const hasCache = !!localStorage.getItem(MEMBERS_KEY);
    if (hasCache) setLoading(false);

    // The app-wide hydrate cycle in _authenticated/route.tsx already fetches
    // this same directory on every mount and every 30s poll. Firing our own
    // load() here too meant two concurrent requests to getTeamDirectory on
    // every single visit to this tab — doubling the odds of a transient
    // "Failed to fetch". Give that cycle a moment to populate the shared
    // cache first, and only fall back to our own fetch if it's truly empty.
    const timer = window.setTimeout(
      () => {
        if (!cancelled && !localStorage.getItem(MEMBERS_KEY)) void load();
      },
      hasCache ? 0 : 1200,
    );
    const onChanged = () => {
      applyFromCache();
      setLoading(false);
    };
    window.addEventListener("time:membros:changed", onChanged);

    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user || cancelled) return;
      setMeId(u.user.id);
      const { data: ok } = await supabase.rpc("is_admin", { _user_id: u.user.id });
      if (!cancelled) setIsAdmin(Boolean(ok));
    })();

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      window.removeEventListener("time:membros:changed", onChanged);
    };
  }, []);

  // Presence dots are driven by chat_status; re-render when it changes.
  useEffect(() => subscribeChat(() => forcePresence((n) => n + 1)), []);

  useStorageSync(MEMBERS_KEY, applyFromCache);

  const onlineCount = useMemo(
    () => members.filter((m) => getStatus(m.id) === "online").length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [members, forcePresence],
  );

  // Score/tarefas/reuniões — o que era a aba "Gestão", agora fundido aqui.
  const [tick, setTick] = useState(0);
  useEffect(() => onProjetosChange(() => setTick((t) => t + 1)), []);
  useEffect(() => onMeetingsChange(() => setTick((t) => t + 1)), []);
  useEffect(() => onCampanhaTarefasChange(() => setTick((t) => t + 1)), []);
  useEffect(() => onStandaloneChange(() => setTick((t) => t + 1)), []);
  useEffect(() => onComercialTasksChange(() => setTick((t) => t + 1)), []);

  const clientes = useClientes();
  const campanhaNames = useMemo(() => {
    const names = new Map<string, string>();
    for (const c of clientes) {
      for (const camp of c.campanhas ?? []) names.set(camp.id, camp.nome);
    }
    return names;
  }, [clientes]);
  const campanhaGroups = useMemo<TaskGroup[]>(() => {
    void tick;
    return Array.from(getAllCampanhaTarefas()).map(([id, tasks]) => ({
      id,
      name: campanhaNames.get(id) ?? "Campanha",
      tasks,
    }));
  }, [campanhaNames, tick]);
  // Tarefas avulsas do Marketing (`marketing_standalone_tasks`) viviam fora
  // do score/lista de tarefas do time inteiro — mesmo bug de origem já
  // corrigido em "Meu trabalho" (Início) nesta sessão: sem esse grupo, quem
  // só tinha tarefa avulsa do Marketing aparecia com "0 tarefas abertas"
  // mesmo tendo trabalho pendente.
  const groupsWithMarketing = useMemo<TaskGroup[]>(() => {
    void tick;
    // Comercial: tarefas como quaisquer outras (abertas/atrasadas/concluídas e Score).
    return [...campanhaGroups, marketingStandaloneAsTaskGroup(), comercialAsTaskGroup()];
  }, [campanhaGroups, tick]);

  // Score Operacional (0-100, gestão) — SEPARADO do XP/gamificação (o
  // "Ranking do mês" saiu da página Time, mas o ledger continua
  // gravando `xpDelta` normalmente). Execução/Compromissos vêm do
  // ledger `performance_events` filtrado ao período selecionado;
  // Pendências é sempre estado ATUAL (live), nunca filtrado por período
  // (item 2 do pedido: "quantidade ATUALMENTE atrasadas").
  const [scorePeriod, setScorePeriod] = useState<ScorePeriodMode>("mes");
  const scoreRange = useMemo(() => rangeForScorePeriod(scorePeriod), [scorePeriod]);
  const { events: performanceEvents } = usePerformanceEvents(scoreRange);
  const { settings: performanceSettings } = usePerformanceSettings();

  const openTasksByMemberId = useMemo(() => {
    void tick;
    return loadOpenTasksByMemberId(
      loadProjetos(),
      members,
      groupsWithMarketing,
      performanceSettings.deadlineCutoffHour,
    );
  }, [members, tick, groupsWithMarketing]);

  const eventsByPersonId = useMemo(
    () => groupEventsByPerson(performanceEvents),
    [performanceEvents],
  );

  const scoreByMemberId = useMemo(() => {
    const map = new Map<string, ScoreOperacionalV2>();
    for (const m of members) {
      const personEvents = eventsByPersonId.get(m.id) ?? [];
      const openTasks = openTasksByMemberId.get(m.id) ?? [];
      map.set(
        m.id,
        computeMemberScoreV2(personEvents, openTasks, performanceSettings.deadlineCutoffHour),
      );
    }
    return map;
  }, [members, eventsByPersonId, openTasksByMemberId, performanceSettings]);

  // Indicadores do período por pessoa (lista da aba Time: "No prazo",
  // "Replanejamentos") — mesmos eventos e mesma função
  // (`computeAggregateIndicators`) do perfil, nunca uma regra paralela.
  const periodIndicatorsByMemberId = useMemo(() => {
    const map = new Map<
      string,
      { completed: number; pctNoPrazo: number | null; replans: number }
    >();
    for (const m of members) {
      const personEvents = eventsByPersonId.get(m.id) ?? [];
      const completions = personEvents
        .filter((e) => e.eventType === "task_completed")
        .map((e) => ({
          outcome: e.data.outcome as TaskOutcome,
          delayMinutes: (e.data.delayMinutes as number) ?? 0,
          taskId: e.taskId,
        }));
      const changes = personEvents
        .filter((e) => e.eventType === "task_deadline_changed")
        .map((e) => ({
          taskId: e.taskId,
          isCritical: !!e.data.isCritical,
          exemptFromResponsibility: !!e.data.exemptFromResponsibility,
        }));
      const agg = computeAggregateIndicators(completions, changes, 0);
      map.set(m.id, {
        completed: completions.length,
        pctNoPrazo: agg.pctNoPrazo,
        replans: agg.qtdReplanejamentos,
      });
    }
    return map;
  }, [members, eventsByPersonId]);

  // Conclusão no prazo do time no período — sobre as conclusões
  // registradas no ledger (por pessoa responsável), só membros atuais.
  const teamOnTime = useMemo(() => {
    let completed = 0;
    let late = 0;
    for (const m of members) {
      for (const e of eventsByPersonId.get(m.id) ?? []) {
        if (e.eventType !== "task_completed") continue;
        completed += 1;
        if (e.data.outcome === "late") late += 1;
      }
    }
    return { completed, pct: completed > 0 ? (100 * (completed - late)) / completed : null };
  }, [members, eventsByPersonId]);

  // Tarefas vinculadas a CADA pessoa (não só a contagem do score) — uma
  // passada só sobre todo o trabalho da plataforma, igual "Meu trabalho" no
  // Início, mas pra todo mundo de uma vez.
  const tasksByMember = useMemo(() => {
    void tick;
    return loadTasksByAssignee(campanhaNames, performanceSettings.deadlineCutoffHour);
  }, [campanhaNames, tick, performanceSettings.deadlineCutoffHour]);

  // Lista achatada de TODAS as tarefas (uma linha por tarefa, com todos os
  // responsáveis) — alimenta o painel "Tarefas que precisam de atenção".
  const allTasksFlat = useMemo(() => {
    void tick;
    return loadAllTasksFlat(campanhaNames, performanceSettings.deadlineCutoffHour);
  }, [campanhaNames, tick, performanceSettings.deadlineCutoffHour]);

  // "Entregas da Semana" (substitui "Entregas por dia da semana") —
  // SEMPRE a semana atual (segunda a domingo, Brasília), sem seletor de
  // período (itens 1-2 do pedido). `weekdayProductivity` continua sendo
  // a mesma função de sempre — só o range passado muda.
  const weekRange = useMemo(() => currentWeekRangeBrasilia(), []);
  const previousWeekRange = useMemo(() => previousWeekRangeBrasilia(), []);
  const weekdayData = useMemo(() => {
    void tick;
    return weekdayProductivity(loadProjetos(), groupsWithMarketing, weekRange);
  }, [tick, groupsWithMarketing, weekRange]);
  const previousWeekdayData = useMemo(() => {
    void tick;
    return weekdayProductivity(loadProjetos(), groupsWithMarketing, previousWeekRange);
  }, [tick, groupsWithMarketing, previousWeekRange]);

  // "vs. semana anterior" (item 6) — nunca compara semana parcial com
  // semana anterior completa: os dois lados somam só até o mesmo dia da
  // semana (hoje), sáb/dom tratam a semana como já completa (corte em
  // sexta).
  const weekdayCutoff = useMemo(() => {
    const wd = weekdayIndexInBrasilia();
    return wd === 0 || wd > 5 ? 5 : wd;
  }, []);
  const weeklyTrendPct = useMemo(() => {
    const current = weekdayData
      .filter((d) => d.weekday <= weekdayCutoff)
      .reduce((s, d) => s + d.totalCompletions, 0);
    const previous = previousWeekdayData
      .filter((d) => d.weekday <= weekdayCutoff)
      .reduce((s, d) => s + d.totalCompletions, 0);
    if (previous === 0) return null;
    return ((current - previous) / previous) * 100;
  }, [weekdayData, previousWeekdayData, weekdayCutoff]);

  // Drill-down de "Entregas da Semana" (bloco geral + por membro) — mesma
  // janela de `weekRange`, devolve as tarefas de verdade (não só a
  // contagem) pra abrir a partir de um clique na barra/número. Fonte
  // separada (`allTasksFlat`, já achatado com id/projectId/campanhaId
  // prontos pra abrir) em vez de reaproveitar `weekdayProductivity`
  // internamente — essa função só serve o número da barra.
  const weekdayTasksByDay = useMemo(() => {
    const map = new Map<number, DashTaskFlat[]>([1, 2, 3, 4, 5].map((d) => [d, []]));
    for (const t of allTasksFlat) {
      if (t.status !== "Concluído" || !t.completedAt) continue;
      const day = todayIsoInBrasilia(new Date(t.completedAt));
      if (day < weekRange.from || day > weekRange.to) continue;
      const wd = weekdayIndexInBrasilia(new Date(t.completedAt));
      if (wd >= 1 && wd <= 5) map.get(wd)!.push(t);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""));
    }
    return map;
  }, [allTasksFlat, weekRange]);

  // Tarefas concluídas por CADA membro na semana atual (segunda a
  // domingo completo, item 10 — inclui fim de semana, diferente do
  // gráfico que só mostra seg-sex) — alimenta tanto a coluna "Esta
  // semana" quanto o drill-down ao clicar no número.
  const thisWeekTasksByMember = useMemo(() => {
    const map = new Map<string, DashTaskFlat[]>();
    for (const t of allTasksFlat) {
      if (t.status !== "Concluído" || !t.completedAt) continue;
      const day = todayIsoInBrasilia(new Date(t.completedAt));
      if (day < weekRange.from || day > weekRange.to) continue;
      for (const name of t.assignees) {
        if (!map.has(name)) map.set(name, []);
        map.get(name)!.push(t);
      }
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""));
    }
    return map;
  }, [allTasksFlat, weekRange]);

  // Médias semanais históricas por membro (mês/trimestre/ano corrente,
  // itens 11-13) — nunca inventa semana fora do histórico real: o início
  // de cada janela é limitado à data da entrega mais antiga carregada.
  const earliestCompletionIso = useMemo(() => {
    let earliest: string | null = null;
    for (const t of allTasksFlat) {
      if (t.status !== "Concluído" || !t.completedAt) continue;
      const day = todayIsoInBrasilia(new Date(t.completedAt));
      if (!earliest || day < earliest) earliest = day;
    }
    return earliest;
  }, [allTasksFlat]);
  const clampedRange = useCallback(
    (monthsBack: number): { from: string; to: string } => {
      const now = new Date();
      const from = new Date(now);
      from.setMonth(from.getMonth() - monthsBack);
      let fromIso = formatDateToIso(from);
      if (earliestCompletionIso && earliestCompletionIso > fromIso) fromIso = earliestCompletionIso;
      return { from: fromIso, to: todayIsoInBrasilia() };
    },
    [earliestCompletionIso],
  );
  const monthRange = useMemo(() => {
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    let fromIso = formatDateToIso(from);
    if (earliestCompletionIso && earliestCompletionIso > fromIso) fromIso = earliestCompletionIso;
    return { from: fromIso, to: todayIsoInBrasilia() };
  }, [earliestCompletionIso]);
  const quarterRange = useMemo(() => clampedRange(3), [clampedRange]);
  const yearRange = useMemo(() => clampedRange(12), [clampedRange]);

  const monthlyWeeklyTotals = useMemo(() => {
    void tick;
    return weeklyDeliveryTotalsByMember(loadProjetos(), groupsWithMarketing, monthRange);
  }, [groupsWithMarketing, monthRange, tick]);
  const quarterlyWeeklyTotals = useMemo(() => {
    void tick;
    return weeklyDeliveryTotalsByMember(loadProjetos(), groupsWithMarketing, quarterRange);
  }, [groupsWithMarketing, quarterRange, tick]);
  const yearlyWeeklyTotals = useMemo(() => {
    void tick;
    return weeklyDeliveryTotalsByMember(loadProjetos(), groupsWithMarketing, yearRange);
  }, [groupsWithMarketing, yearRange, tick]);
  const average = (arr: number[] | undefined): number | null => {
    if (!arr || arr.length === 0) return null;
    return arr.reduce((s, n) => s + n, 0) / arr.length;
  };

  // Tabela de produtividade por membro (substitui a tabela seg-sex
  // antiga) — uma linha por membro, tudo já resolvido aqui (item 8 do
  // pedido).
  const deliveryMemberRows = useMemo<DeliveryMemberRow[]>(() => {
    return members
      .map((m) => {
        const monthlyAvg = average(monthlyWeeklyTotals.get(m.name));
        const thisWeekTasksForMember = thisWeekTasksByMember.get(m.name) ?? [];
        const thisWeek = thisWeekTasksForMember.length;
        const byWeekday = weekdayData.map((d) => ({
          label: d.label,
          count: d.byMember.find((x) => x.name === m.name)?.count ?? 0,
        }));
        const trendPct =
          monthlyAvg != null && monthlyAvg > 0
            ? ((thisWeek - monthlyAvg) / monthlyAvg) * 100
            : null;
        return {
          member: m,
          thisWeek,
          monthlyAvg,
          quarterlyAvg: average(quarterlyWeeklyTotals.get(m.name)),
          yearlyAvg: average(yearlyWeeklyTotals.get(m.name)),
          trendPct,
          byWeekday,
          thisWeekTasks: thisWeekTasksForMember,
        };
      })
      .filter((r) => r.thisWeek > 0 || (monthlyWeeklyTotals.get(r.member.name)?.length ?? 0) > 0)
      .sort((a, b) => b.thisWeek - a.thisWeek);
  }, [
    members,
    monthlyWeeklyTotals,
    quarterlyWeeklyTotals,
    yearlyWeeklyTotals,
    thisWeekTasksByMember,
    weekdayData,
  ]);

  // Resolve título de reunião a partir do id — só usado pra exibir "N
  // reuniões perdidas" na ficha do membro (o ledger denormaliza
  // `meetingId`, não `meetingTitle`).
  const meetingsById = useMemo(() => {
    void tick;
    return new Map(loadMeetings().map((m) => [m.id, m]));
  }, [tick]);

  // "Insights do Time" — janela FIXA de 30 dias (independente do
  // `scorePeriod` selecionado em Performance do Time), pra comparar
  // "últimos 30 dias" vs. "30 dias antes disso" pra todo mundo de uma vez
  // (1 fetch cada, não 1 por pessoa).
  // Janela única dos Insights (`insightWindows`): este mês até hoje (Brasília) contra o mesmo
  // trecho do mês passado — a MESMA usada em resposta e tarefas novas.
  const { current: last30Range, previous: previous30Range } = useMemo(
    () => insightWindows(todayIsoInBrasilia()),
    [],
  );
  const { events: events30d } = usePerformanceEvents(last30Range);
  const { events: eventsPrev30d } = usePerformanceEvents(previous30Range);
  const eventsByPersonId30d = useMemo(() => groupEventsByPerson(events30d), [events30d]);
  const eventsByPersonIdPrev30d = useMemo(
    () => groupEventsByPerson(eventsPrev30d),
    [eventsPrev30d],
  );

  const teamAvgActiveProjects = useMemo(() => {
    if (members.length === 0) return null;
    const counts = members.map((m) => {
      const open = (tasksByMember.get(m.name) ?? []).filter((t) => OPEN_STATUSES.has(t.status));
      return new Set(open.map((t) => t.campanhaId ?? t.projectId)).size;
    });
    return counts.reduce((s, n) => s + n, 0) / counts.length;
  }, [members, tasksByMember]);

  const insightBundles = useMemo<MemberInsightBundle[]>(() => {
    const scoreFromEvents = (
      personEvents: PerformanceEventLike[],
      openTasks: PerformanceOpenTask[],
    ) => {
      const attendance = dedupAttendanceEvents(
        personEvents.filter((e) => e.eventType === "meeting_attendance_recorded"),
      ).map((e) => ({ attended: !!e.data.attended }));
      const score = computeMemberScoreV2(
        personEvents,
        openTasks,
        performanceSettings.deadlineCutoffHour,
      );
      return { score, attendance };
    };

    return members.map((m) => {
      const personEvents30d = eventsByPersonId30d.get(m.id) ?? [];
      const personEventsPrev30d = eventsByPersonIdPrev30d.get(m.id) ?? [];
      const openTasks = openTasksByMemberId.get(m.id) ?? [];

      const completions30d = personEvents30d
        .filter((e) => e.eventType === "task_completed")
        .map((e) => ({
          outcome: e.data.outcome as TaskOutcome,
          delayMinutes: (e.data.delayMinutes as number) ?? 0,
          taskId: e.taskId,
          occurredAt: e.occurredAt,
        }));
      const deadlineChanges30d = personEvents30d
        .filter((e) => e.eventType === "task_deadline_changed")
        .map((e) => ({
          taskId: e.taskId,
          isCritical: !!e.data.isCritical,
          motivo: (e.data.motivo as string) ?? undefined,
          exemptFromResponsibility: !!e.data.exemptFromResponsibility,
        }));
      const agg30d = computeAggregateIndicators(completions30d, deadlineChanges30d, 0);

      const completionsPrev30d = personEventsPrev30d
        .filter((e) => e.eventType === "task_completed")
        .map((e) => ({
          outcome: e.data.outcome as TaskOutcome,
          delayMinutes: (e.data.delayMinutes as number) ?? 0,
          taskId: e.taskId,
        }));
      const deadlineChangesPrev30d = personEventsPrev30d
        .filter((e) => e.eventType === "task_deadline_changed")
        .map((e) => ({
          taskId: e.taskId,
          isCritical: !!e.data.isCritical,
          motivo: (e.data.motivo as string) ?? undefined,
          exemptFromResponsibility: !!e.data.exemptFromResponsibility,
        }));
      const aggPrev30d = computeAggregateIndicators(completionsPrev30d, deadlineChangesPrev30d, 0);

      const last14 = new Date();
      last14.setDate(last14.getDate() - 14);
      const last14Iso = formatDateToIso(last14);
      const completionsLast14 = completions30d.filter((c) => c.occurredAt >= last14Iso);
      const noLateInLast14 =
        completionsLast14.length >= INSIGHT_THRESHOLDS.amostraMinima &&
        !completionsLast14.some((c) => c.outcome === "late");

      const scoreNowResult = scoreFromEvents(personEvents30d, openTasks);
      const scorePreviousResult = scoreFromEvents(personEventsPrev30d, openTasks);

      const overdueTasks = (tasksByMember.get(m.name) ?? []).filter((t) => t.bucket === "atrasada");
      const overdueHighPriorityCount = overdueTasks.filter(
        (t) => t.priority === "Alta" || t.priority === "Urgente",
      ).length;
      const overdueOlderThanThresholdCount = overdueTasks.filter(
        (t) => (t.overdueDays ?? 0) >= INSIGHT_THRESHOLDS.atrasadasAntigasDias,
      ).length;

      const openTasksForMember = (tasksByMember.get(m.name) ?? []).filter((t) =>
        OPEN_STATUSES.has(t.status),
      );
      const activeProjectsCount = new Set(
        openTasksForMember.map((t) => t.campanhaId ?? t.projectId),
      ).size;
      const concentrationGroups = new Map<string, { count: number; label: string }>();
      for (const t of openTasksForMember) {
        const key = t.campanhaId ?? t.projectId;
        const g = concentrationGroups.get(key);
        if (g) g.count += 1;
        else concentrationGroups.set(key, { count: 1, label: t.projectName });
      }
      let topConcentration: { count: number; label: string } | null = null;
      for (const g of concentrationGroups.values()) {
        if (!topConcentration || g.count > topConcentration.count) topConcentration = g;
      }

      const startTimes = m.startTimes ?? {};
      const recentDays = Object.keys(startTimes)
        .sort((a, b) => (a < b ? 1 : -1))
        .slice(0, 10);
      const earlyStartCount =
        recentDays.length > 0
          ? recentDays.filter((d) => {
              const hhmm = startTimes[d];
              const hour = Number(hhmm?.split(":")[0]);
              return Number.isFinite(hour) && hour < INSIGHT_THRESHOLDS.inicioDiaAntesDasHora;
            }).length
          : null;

      const bundle: MemberInsightBundle = {
        memberId: m.id,
        memberName: m.name,
        role: m.role,
        thisWeekTotal: thisWeekTasksByMember.get(m.name)?.length ?? 0,
        monthlyWeeklyAvg: average(monthlyWeeklyTotals.get(m.name)),
        onTimeRateCurrent: agg30d.pctNoPrazo,
        onTimeRatePrevious: aggPrev30d.pctNoPrazo,
        onTimeSampleCurrent: completions30d.length,
        onTimeSamplePrevious: completionsPrev30d.length,
        avgDelayDaysCurrent: agg30d.tempoMedioAtrasoDias,
        avgDelayDaysPrevious: aggPrev30d.tempoMedioAtrasoDias,
        replansCurrent: agg30d.qtdReplanejamentos,
        replansPrevious: aggPrev30d.qtdReplanejamentos,
        criticalReplansCurrent: agg30d.qtdReplanejamentosNoDia,
        criticalReplansPrevious: aggPrev30d.qtdReplanejamentosNoDia,
        repeatedProblematicReplansCurrent:
          scoreNowResult.score.previsibilidade.repeatedProblematicReplans,
        // Janela sempre "últimos 30 dias" dos dois lados (rolante, nunca
        // calendário) — nunca parcial por construção, diferente do
        // seletor de período da ficha individual (`profilePeriod`).
        currentPeriodPartial: false,
        overdueCount: overdueTasks.length,
        overdueHighPriorityCount,
        overdueOlderThanThresholdCount,
        noOverdueForDays: noLateInLast14 ? INSIGHT_THRESHOLDS.semAtrasoDias : null,
        scoreNow: scoreNowResult.score.score,
        scorePrevious: scorePreviousResult.score.score,
        scorePeriodLabel: "neste mês (contra o mesmo período do mês passado)",
        openTasksCount: openTasksForMember.length,
        activeProjectsCount,
        teamAvgActiveProjects,
        topConcentrationLabel: topConcentration?.label ?? null,
        topConcentrationPct:
          topConcentration && openTasksForMember.length > 0
            ? topConcentration.count / openTasksForMember.length
            : null,
        meetingsExpected: scoreNowResult.attendance.length,
        meetingsAttended: scoreNowResult.attendance.filter((a) => a.attended).length,
        earlyStartCount,
        earlyStartWindow: recentDays.length > 0 ? recentDays.length : null,
      };
      return bundle;
    });
  }, [
    members,
    eventsByPersonId30d,
    eventsByPersonIdPrev30d,
    openTasksByMemberId,
    performanceSettings.deadlineCutoffHour,
    tasksByMember,
    thisWeekTasksByMember,
    monthlyWeeklyTotals,
    teamAvgActiveProjects,
  ]);

  const teamInsights = useMemo(() => generateInsights(insightBundles, 40), [insightBundles]);
  const membersById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);

  // Mesmo deep-link (sessionStorage + navegação) já usado em "Meu trabalho"
  // (Início) e no indicador de timer ativo — abrir uma tarefa da lista de
  // alguém na aba Time precisa cair no mesmo lugar.
  const openTask = (t: DashTask) => {
    if (t.comercial) {
      // Tarefa do Comercial: sem projeto/campanha — abre a seção Comercial já na tarefa.
      stageComercialTask(t.id);
      navigate({ to: "/time", search: { section: "comercial" as SectionKey } });
      return;
    }
    // `?taskId=` já resolve subtarefa (procura dentro de `subtasks` da
    // mãe e abre o mesmo diálogo já direto nela — `TaskBoard.tsx`), então
    // passa o id de verdade, nunca mais colapsado pro pai.
    if (t.campanhaId) {
      sessionStorage.setItem(
        OPEN_CAMPANHA_TASK_KEY,
        JSON.stringify({ campanhaId: t.campanhaId, taskId: t.id }),
      );
      navigate({ to: "/time", search: { section: "campanhas" as SectionKey } });
      return;
    }
    navigate({ to: "/projeto/$id", params: { id: t.projectId }, search: { taskId: t.id } });
  };

  const handleSave = async (payload: MemberFormPayload): Promise<boolean> => {
    try {
      if (payload.isNew) {
        const res = await withRetry(() =>
          createFn({
            data: {
              email: payload.email,
              tempPassword: payload.tempPassword,
              fullName: payload.name,
              roleLabel: payload.role,
              salary: payload.salary,
              birthday: payload.birthday,
              permissions: payload.permissions,
              timeView: payload.timeView,
              role: payload.isAdminRole ? "admin" : "member",
            },
          }),
        );
        setCreatedInfo({ email: res.email, tempPassword: res.tempPassword });
      } else if (payload.id) {
        await withRetry(() =>
          updateFn({
            data: {
              id: payload.id!,
              fullName: payload.name,
              roleLabel: payload.role,
              salary: payload.salary,
              birthday: payload.birthday,
              permissions: payload.permissions,
              timeView: payload.timeView,
              role: payload.isAdminRole ? "admin" : "member",
            },
          }),
        );
      }
      await load();
      return true;
    } catch (err) {
      setError(friendlyError(err, "Erro ao salvar."));
      return false;
    }
  };

  const handleDelete = async (id: string) => {
    const ok = await confirm("Remover este membro? Essa ação é permanente.");
    if (!ok) return;
    try {
      await withRetry(() => deleteFn({ data: { id } }));
      await load();
    } catch (err) {
      setError(friendlyError(err, "Erro ao remover."));
    }
  };

  const handleReset = async (id: string) => {
    const pwd = prompt("Digite a nova senha temporária:");
    if (!pwd || pwd.length < 6) return;
    try {
      await withRetry(() => resetFn({ data: { id, newPassword: pwd } }));
      alert(`Senha redefinida. Envie ao membro: ${pwd}`);
    } catch (err) {
      alert(friendlyError(err, "Erro ao redefinir senha."));
    }
  };

  return {
    members,
    loading,
    error,
    setError,
    load,
    isAdmin,
    meId,
    createdInfo,
    setCreatedInfo,
    onlineCount,
    clientes,
    campanhaNames,
    scorePeriod,
    setScorePeriod,
    scoreRange,
    periodIndicatorsByMemberId,
    teamOnTime,
    performanceSettings,
    openTasksByMemberId,
    scoreByMemberId,
    tasksByMember,
    allTasksFlat,
    weekRange,
    weekdayData,
    weekdayTasksByDay,
    weeklyTrendPct,
    deliveryMemberRows,
    meetingsById,
    teamInsights,
    insightBundles,
    membersById,
    openTask,
    handleSave,
    handleDelete,
    handleReset,
    confirmDialog,
  };
}

/** Deep link vindo de uma @menção de pessoa no Chat (sessionStorage +
 * evento) — abre o perfil central do membro. `members` carrega assíncrono,
 * então tenta de novo sempre que a lista mudar. */
export function useOpenMemberDeepLink(members: Member[], onOpen: (m: Member) => void) {
  useEffect(() => {
    const openFromSession = () => {
      try {
        const raw = sessionStorage.getItem(OPEN_MEMBER_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw) as { memberId?: string };
        if (!parsed.memberId) return;
        const match = members.find((m) => m.id === parsed.memberId);
        if (!match) return;
        sessionStorage.removeItem(OPEN_MEMBER_KEY);
        onOpen(match);
      } catch {
        /* ignore */
      }
    };
    openFromSession();
    window.addEventListener(OPEN_MEMBER_EVENT, openFromSession);
    return () => window.removeEventListener(OPEN_MEMBER_EVENT, openFromSession);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onOpen é um setState estável do chamador
  }, [members]);
}
