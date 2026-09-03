import { useEffect, useMemo, useState } from "react";
import {
  Plus,
  Search,
  Mail,
  Calendar,
  Briefcase,
  DollarSign,
  KeyRound,
  User,
  Eye,
  Copy,
  ChevronDown,
  Check,
} from "lucide-react";
import { SectionHeader } from "./SectionHeader";
import { useNavigate } from "@tanstack/react-router";
import { loadProjetos, onProjetosChange } from "@/lib/projetos";
import { onMeetingsChange, loadMeetings } from "@/lib/reunioes-store";
import { useClientes } from "@/lib/clientes-store";
import { getAllCampanhaTarefas, onCampanhaTarefasChange } from "@/lib/campanha-scoped-store";
import { onStandaloneChange } from "@/lib/marketing-tasks";
import {
  weeklyCompletions,
  weekdayProductivity,
  rangeForWeekdayPeriod,
  loadOpenTasksByMemberId,
  type TaskGroup,
  type WeekdayPeriodMode,
} from "@/lib/score";
import {
  computeScoreOperacional,
  computeExecucao,
  computePendencias,
  computeCompromissos,
  rangeForScorePeriod,
  groupEventsByPerson,
  dedupAttendanceEvents,
  type ScorePeriodMode,
  type ScoreOperacionalResult,
  type TaskOutcome,
} from "@/lib/performance-engine";
import { usePerformanceEvents, usePerformanceSettings } from "@/lib/performance-events-store";
import {
  loadTasksByAssignee,
  loadAllTasksFlat,
  marketingStandaloneAsTaskGroup,
  type DashTask,
} from "@/lib/task-aggregation";
import {
  OPEN_CAMPANHA_TASK_KEY,
  OPEN_MEMBER_KEY,
  OPEN_MEMBER_EVENT,
  type SectionKey,
} from "@/components/AppShell";
import { TeamDashboard } from "@/components/team/TeamDashboard";
import type { AttentionTab } from "@/components/team/AttentionTasks";
import { MemberProfileDialog } from "@/components/team/MemberProfileDialog";
import { TimeTrackingReport } from "@/components/team/TimeTrackingReport";

import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import {
  type Permission,
  PERMISSION_GROUPS,
  CONFIG_SUB_PERMISSIONS,
  ALL_PERMISSIONS,
} from "@/lib/permissions";
import {
  createTeamMember,
  updateTeamMember,
  deleteTeamMember,
  resetMemberPassword,
  getTeamDirectory,
} from "@/lib/team.functions";
import { getStatus, subscribeChat, STATUS_LABEL, STATUS_COLOR } from "@/lib/chat-store";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DateField } from "@/components/ui/date-field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useStorageSync } from "@/lib/use-storage-sync";
import { withRetry, friendlyNetworkError } from "@/lib/net-retry";
import { useConfirm } from "@/hooks/use-confirm";

function formatBirthday(value: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  const d = new Date(value);
  return isNaN(d.getTime()) ? value : d.toLocaleDateString("pt-BR");
}

// Photos are always shown in the Time tab (not gated by timeView) — a profile
// picture isn't sensitive the way birthday/salary/email are.
export type TimeField = "name" | "role" | "birthday" | "salary" | "email" | "startOfDay";
const TIME_FIELDS: { key: TimeField; label: string }[] = [
  { key: "name", label: "Nome" },
  { key: "role", label: "Cargo" },
  { key: "birthday", label: "Aniversário" },
  { key: "salary", label: "Salário" },
  { key: "email", label: "Email" },
  { key: "startOfDay", label: "Início do dia" },
];
const DEFAULT_TIME_VIEW: TimeField[] = ["name", "role", "email"];

/** Preset "padrão" pra criar membro novo sem precisar entender a lista
 * inteira de permissões — cobre a operação do dia a dia, exclui áreas
 * sensíveis (comercial, financeiro, configurações). "Personalizado" abre a
 * lista completa de checkboxes, como sempre existiu. */
type PermissionPreset = "padrao" | "personalizado";
const MEMBER_DEFAULT_PERMISSIONS: Permission[] = [
  "clientes",
  "campanhas",
  "projetos",
  "reunioes",
  "influenciadores",
  "time",
  "chat",
];

function isDefaultPermissionSet(permissions: Permission[]): PermissionPreset {
  if (permissions.length !== MEMBER_DEFAULT_PERMISSIONS.length) return "personalizado";
  const sortedA = [...permissions].sort();
  const sortedB = [...MEMBER_DEFAULT_PERMISSIONS].sort();
  return sortedA.every((p, i) => p === sortedB[i]) ? "padrao" : "personalizado";
}

export type Member = {
  id: string;
  photo?: string;
  name: string;
  role: string;
  birthday: string;
  salary: string;
  email: string;
  permissions: Permission[];
  timeView: TimeField[];
  startTimes?: Record<string, string>;
  isAdmin?: boolean;
};

const MEMBERS_KEY = "time:membros";
const friendlyError = friendlyNetworkError;

function DiretorioTab() {
  const navigate = useNavigate();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Member | null>(null);
  const [viewing, setViewing] = useState<Member | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [createdInfo, setCreatedInfo] = useState<{ email: string; tempPassword: string } | null>(
    null,
  );
  const [isAdmin, setIsAdmin] = useState(false);
  const [meId, setMeId] = useState<string | null>(null);
  const [topTab, setTopTab] = useState<"equipe" | "horas">("equipe");
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

  const filtered = useMemo(
    () =>
      members.filter(
        (m) =>
          m.name.toLowerCase().includes(query.toLowerCase()) ||
          m.role.toLowerCase().includes(query.toLowerCase()) ||
          m.email.toLowerCase().includes(query.toLowerCase()),
      ),
    [members, query],
  );

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

  // Deep link vindo de uma @menção de pessoa no Chat (mesmo padrão de
  // OPEN_CAMPANHA_TASK_KEY) — abre o MemberProfileDialog já existente em vez de
  // um popover de perfil novo. `members` carrega assíncrono, então tenta de
  // novo sempre que a lista mudar.
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
        setViewing(match);
      } catch {
        /* ignore */
      }
    };
    openFromSession();
    window.addEventListener(OPEN_MEMBER_EVENT, openFromSession);
    return () => window.removeEventListener(OPEN_MEMBER_EVENT, openFromSession);
  }, [members]);

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
    return [...campanhaGroups, marketingStandaloneAsTaskGroup()];
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
    return loadOpenTasksByMemberId(loadProjetos(), members, groupsWithMarketing);
  }, [members, tick, groupsWithMarketing]);

  const eventsByPersonId = useMemo(
    () => groupEventsByPerson(performanceEvents),
    [performanceEvents],
  );

  const scoreByMemberId = useMemo(() => {
    const map = new Map<string, ScoreOperacionalResult>();
    for (const m of members) {
      const personEvents = eventsByPersonId.get(m.id) ?? [];
      const completions = personEvents
        .filter((e) => e.eventType === "task_completed")
        .map((e) => ({
          outcome: e.data.outcome as TaskOutcome,
          delayMinutes: (e.data.delayMinutes as number) ?? 0,
        }));
      const attendance = dedupAttendanceEvents(
        personEvents.filter((e) => e.eventType === "meeting_attendance_recorded"),
      ).map((e) => ({ attended: !!e.data.attended }));
      const execucao = computeExecucao(completions);
      const pendencias = computePendencias(
        openTasksByMemberId.get(m.id) ?? [],
        performanceSettings.pendenciasDiasTeto,
        undefined,
        performanceSettings.deadlineCutoffHour,
      );
      const compromissos = computeCompromissos(attendance);
      map.set(
        m.id,
        computeScoreOperacional(execucao, pendencias, compromissos, {
          execucao: performanceSettings.weightExecucao,
          pendencias: performanceSettings.weightPendencias,
          compromissos: performanceSettings.weightCompromissos,
        }),
      );
    }
    return map;
  }, [members, eventsByPersonId, openTasksByMemberId, performanceSettings]);

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

  // Conclusões por semana do time inteiro — alimenta só o KPI "Concluídas
  // na semana" (o gráfico "Entregas por semana" foi substituído por
  // "Produtividade por dia da semana", abaixo).
  const weeklyData = useMemo(() => {
    void tick;
    return weeklyCompletions(loadProjetos(), groupsWithMarketing);
  }, [tick, groupsWithMarketing]);

  // Produtividade por dia da semana — período PRÓPRIO, independente do
  // `scorePeriod` da Performance do Time (opções diferentes: Esta
  // semana/Últimos 30/90 dias/Este ano).
  const [weekdayPeriod, setWeekdayPeriod] = useState<WeekdayPeriodMode>("30dias");
  const weekdayData = useMemo(() => {
    void tick;
    return weekdayProductivity(
      loadProjetos(),
      groupsWithMarketing,
      rangeForWeekdayPeriod(weekdayPeriod),
    );
  }, [tick, groupsWithMarketing, weekdayPeriod]);

  // Resolve título de reunião a partir do id — só usado pra exibir "N
  // reuniões perdidas" na ficha do membro (o ledger denormaliza
  // `meetingId`, não `meetingTitle`).
  const meetingsById = useMemo(() => {
    void tick;
    return new Map(loadMeetings().map((m) => [m.id, m]));
  }, [tick]);

  const [attentionTab, setAttentionTab] = useState<AttentionTab>("atrasadas");

  // Mesmo deep-link (sessionStorage + navegação) já usado em "Meu trabalho"
  // (Início) e no indicador de timer ativo — abrir uma tarefa da lista de
  // alguém na aba Time precisa cair no mesmo lugar.
  const openTask = (t: DashTask) => {
    const targetId = t.parentId ?? t.id;
    if (t.campanhaId) {
      sessionStorage.setItem(
        OPEN_CAMPANHA_TASK_KEY,
        JSON.stringify({ campanhaId: t.campanhaId, taskId: targetId }),
      );
      navigate({ to: "/time", search: { section: "campanhas" as SectionKey } });
      return;
    }
    navigate({ to: "/projeto/$id", params: { id: t.projectId }, search: { taskId: targetId } });
  };

  const handleSave = async (payload: MemberFormPayload) => {
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
      setOpen(false);
      setEditing(null);
      await load();
    } catch (err) {
      setError(friendlyError(err, "Erro ao salvar."));
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

  const headerAction = (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar membro"
          className="h-9 w-40 pl-8 text-xs sm:w-56"
        />
      </div>
      {isAdmin && (
        <Button
          size="sm"
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
        >
          <Plus className="h-3.5 w-3.5" />
          Novo membro
        </Button>
      )}
    </div>
  );

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-6">
        <SectionHeader
          title="Time"
          subtitle="Visão geral da operação, produtividade e carga do time."
          action={headerAction}
        />

        <div className="flex items-center gap-1 rounded-md border border-border p-0.5 text-xs">
          <button
            type="button"
            onClick={() => setTopTab("equipe")}
            className={`cursor-pointer rounded-sm px-3 py-1.5 font-medium ${topTab === "equipe" ? "bg-muted" : "text-muted-foreground"}`}
          >
            Visão da equipe
          </button>
          <button
            type="button"
            onClick={() => setTopTab("horas")}
            className={`cursor-pointer rounded-sm px-3 py-1.5 font-medium ${topTab === "horas" ? "bg-muted" : "text-muted-foreground"}`}
          >
            Horas trabalhadas
          </button>
        </div>

        {error && (
          <div className="flex items-start justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-xs text-destructive">
            <span>{error}</span>
            <div className="flex shrink-0 items-center gap-3">
              <button
                onClick={() => void load()}
                disabled={loading}
                className="font-medium underline underline-offset-2 disabled:opacity-50"
              >
                {loading ? "tentando..." : "tentar novamente"}
              </button>
              <button
                onClick={() => setError(null)}
                className="font-medium underline underline-offset-2"
              >
                fechar
              </button>
            </div>
          </div>
        )}

        {createdInfo && (
          <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-xs">
            <div className="mb-1.5 font-medium text-foreground">
              Membro criado! Envie estas credenciais:
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span>
                Email: <b className="font-semibold">{createdInfo.email}</b>
              </span>
              <span className="text-muted-foreground">·</span>
              <span>
                Senha temporária: <b className="font-semibold">{createdInfo.tempPassword}</b>
              </span>
              <Button
                size="sm"
                variant="outline"
                className="h-6 gap-1 px-2 text-[11px]"
                onClick={() =>
                  navigator.clipboard.writeText(
                    `Email: ${createdInfo.email}\nSenha temporária: ${createdInfo.tempPassword}`,
                  )
                }
              >
                <Copy className="h-3 w-3" /> Copiar
              </Button>
              <button
                onClick={() => setCreatedInfo(null)}
                className="ml-auto font-medium text-muted-foreground underline underline-offset-2 hover:text-foreground"
              >
                fechar
              </button>
            </div>
          </div>
        )}

        {topTab === "equipe" ? (
          <TeamDashboard
            allMembers={members}
            filteredMembers={filtered}
            scoreByMemberId={scoreByMemberId}
            scorePeriod={scorePeriod}
            onScorePeriodChange={setScorePeriod}
            performanceEvents={performanceEvents}
            performanceSettings={performanceSettings}
            allTasksFlat={allTasksFlat}
            tasksByMember={tasksByMember}
            weeklyData={weeklyData}
            weekdayData={weekdayData}
            weekdayPeriod={weekdayPeriod}
            onWeekdayPeriodChange={setWeekdayPeriod}
            onlineCount={onlineCount}
            meId={meId}
            isAdmin={isAdmin}
            loading={loading}
            attentionTab={attentionTab}
            onAttentionTabChange={setAttentionTab}
            onOpenTask={openTask}
            onOpenMember={(m) => setViewing(m)}
            onEditMember={(m) => {
              setEditing(m);
              setOpen(true);
            }}
            onDeleteMember={(id) => void handleDelete(id)}
            onResetMember={(id) => void handleReset(id)}
          />
        ) : (
          <TimeTrackingReport members={members} meId={meId} isAdmin={isAdmin} />
        )}

        <MemberDialog
          open={open}
          initial={editing}
          isSelf={!!editing && editing.id === meId}
          onOpenChange={(v) => {
            setOpen(v);
            if (!v) setEditing(null);
          }}
          onSave={handleSave}
        />

        {viewing && (
          <MemberProfileDialog
            member={viewing}
            isSelf={viewing.id === meId}
            isAdmin={isAdmin}
            tasksForMember={tasksByMember.get(viewing.name) ?? []}
            openTasksForMember={openTasksByMemberId.get(viewing.id) ?? []}
            performanceSettings={performanceSettings}
            meetingsById={meetingsById}
            onOpenTask={openTask}
            onOpenChange={(v) => {
              if (!v) setViewing(null);
            }}
            onEdit={(m) => {
              setViewing(null);
              setEditing(m);
              setOpen(true);
            }}
          />
        )}
        {confirmDialog}
      </div>
    </TooltipProvider>
  );
}

export type MemberFormPayload = {
  isNew: boolean;
  id?: string;
  email: string;
  tempPassword: string;
  name: string;
  role: string;
  birthday: string;
  salary: string;
  permissions: Permission[];
  timeView: TimeField[];
  isAdminRole: boolean;
};

type AccessType = "padrao" | "personalizado" | "admin";

function accessTypeFor(isAdmin: boolean, permissions: Permission[]): AccessType {
  if (isAdmin) return "admin";
  return isDefaultPermissionSet(permissions);
}

function memberInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

const ACCESS_TYPE_OPTIONS: { key: AccessType; label: string; hint: string }[] = [
  { key: "padrao", label: "Membro padrão", hint: "Permissões padrão da equipe." },
  {
    key: "personalizado",
    label: "Personalizado",
    hint: "Escolha quais áreas este membro pode acessar.",
  },
  { key: "admin", label: "Administrador", hint: "Acesso completo ao workspace." },
];

export function MemberDialog({
  open,
  initial,
  isSelf,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  initial: Member | null;
  isSelf: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (p: MemberFormPayload) => void | Promise<void>;
}) {
  const isNew = !initial;
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [birthday, setBirthday] = useState("");
  const [salary, setSalary] = useState("");
  const [email, setEmail] = useState("");
  const [tempPassword, setTempPassword] = useState("");
  // `permissions` guarda sempre o conjunto EDITÁVEL (usado de verdade só
  // quando `accessType === "personalizado"`) — pra padrão/admin, o
  // conjunto efetivo é calculado (`MEMBER_DEFAULT_PERMISSIONS`/
  // `ALL_PERMISSIONS`) só na hora de salvar, sem precisar ficar
  // sincronizado com este estado o tempo todo.
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [timeView, setTimeView] = useState<TimeField[]>(DEFAULT_TIME_VIEW);
  const [accessType, setAccessType] = useState<AccessType>("padrao");
  const [showIncluded, setShowIncluded] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Re-seed local form state whenever the dialog opens for a (possibly different) member.
  useEffect(() => {
    if (!open) return;
    setName(initial?.name ?? "");
    setRole(initial?.role ?? "");
    setBirthday(initial?.birthday ?? "");
    setSalary(initial?.salary ?? "");
    setEmail(initial?.email ?? "");
    setTempPassword("");
    const seedPermissions = initial ? initial.permissions : MEMBER_DEFAULT_PERMISSIONS;
    setPermissions(seedPermissions);
    setTimeView(initial?.timeView ?? DEFAULT_TIME_VIEW);
    // Abre no tipo de acesso que já bate com os dados salvos — sem isso,
    // um membro padrão sempre reabria marcado como Personalizado,
    // parecendo que a troca não salvou.
    setAccessType(accessTypeFor(!!initial?.isAdmin, seedPermissions));
    setShowIncluded(false);
    setError("");
  }, [open, initial]);

  const selectAccessType = (next: AccessType) => {
    if (isSelf) return;
    setAccessType(next);
    if (next === "padrao") setPermissions(MEMBER_DEFAULT_PERMISSIONS);
  };

  const togglePerm = (p: Permission) =>
    setPermissions((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));
  const toggleField = (f: TimeField) =>
    setTimeView((prev) => (prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]));
  const canSeeTime = permissions.includes("time");

  useEffect(() => {
    if (!canSeeTime && timeView.length > 0) setTimeView([]);
  }, [canSeeTime, timeView.length]);

  const generatePassword = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
    let out = "";
    for (let i = 0; i < 10; i++) out += chars[Math.floor(Math.random() * chars.length)];
    setTempPassword(out);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (isNew) {
      if (!email.trim()) return setError("Email é obrigatório.");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setError("Email inválido.");
      if (tempPassword.length < 6)
        return setError("Senha temporária precisa ter pelo menos 6 caracteres.");
    }
    const isAdminRole = accessType === "admin";
    const finalPermissions =
      accessType === "admin"
        ? ALL_PERMISSIONS
        : accessType === "padrao"
          ? MEMBER_DEFAULT_PERMISSIONS
          : permissions;
    setSubmitting(true);
    try {
      await onSave({
        isNew,
        id: initial?.id,
        email: email.trim(),
        tempPassword,
        name: name.trim(),
        role: role.trim(),
        birthday,
        salary,
        permissions: finalPermissions,
        timeView,
        isAdminRole,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const presenceStatus = initial ? getStatus(initial.id) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] w-full max-w-4xl flex-col gap-0 overflow-hidden p-0">
        {isNew ? (
          <DialogHeader className="border-b border-border px-6 py-4 pr-10">
            <DialogTitle>Adicionar membro</DialogTitle>
            <DialogDescription>Cadastre os dados e defina o acesso deste membro.</DialogDescription>
          </DialogHeader>
        ) : (
          <div className="flex items-center gap-3 border-b border-border px-6 py-4 pr-10">
            <Avatar className="h-11 w-11 shrink-0">
              <AvatarImage src={initial?.photo} alt={initial?.name} />
              <AvatarFallback className="text-sm">
                {memberInitials(initial?.name || "?")}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <DialogTitle className="truncate text-base">
                {initial?.name || "Sem nome"}
              </DialogTitle>
              <DialogDescription className="mt-0.5 truncate text-xs">
                {[initial?.role, initial?.email].filter(Boolean).join(" · ") ||
                  "Sem cargo definido"}
              </DialogDescription>
            </div>
            {presenceStatus && (
              <span className="flex shrink-0 items-center gap-1.5 text-[11px] text-muted-foreground">
                <span className={`h-1.5 w-1.5 rounded-full ${STATUS_COLOR[presenceStatus]}`} />
                {STATUS_LABEL[presenceStatus]}
              </span>
            )}
          </div>
        )}

        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="space-y-6 px-6 py-5">
              <section className="space-y-3">
                <SectionTitle title="Dados do membro" />
                <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
                  <Field label="Nome" icon={<User className="h-3.5 w-3.5" />}>
                    <Input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="h-9 text-sm"
                    />
                  </Field>
                  <Field label="Cargo" icon={<Briefcase className="h-3.5 w-3.5" />}>
                    <Input
                      value={role}
                      onChange={(e) => setRole(e.target.value)}
                      className="h-9 text-sm"
                      placeholder="Ex: Designer"
                    />
                  </Field>
                  <Field label="Email" icon={<Mail className="h-3.5 w-3.5" />}>
                    <Input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="h-9 text-sm"
                      required
                      disabled={!isNew}
                    />
                  </Field>
                  {isNew ? (
                    <Field label="Senha temporária" icon={<KeyRound className="h-3.5 w-3.5" />}>
                      <div className="flex gap-1.5">
                        <Input
                          value={tempPassword}
                          onChange={(e) => setTempPassword(e.target.value)}
                          className="h-9 text-sm"
                          placeholder="•••••••"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-9 shrink-0"
                          onClick={generatePassword}
                        >
                          Gerar
                        </Button>
                      </div>
                    </Field>
                  ) : (
                    <Field label="Aniversário" icon={<Calendar className="h-3.5 w-3.5" />}>
                      <DateField
                        value={birthday || undefined}
                        onChange={(v) => setBirthday(v ?? "")}
                        className="h-9 text-sm"
                      />
                    </Field>
                  )}
                  {isNew && (
                    <Field label="Aniversário" icon={<Calendar className="h-3.5 w-3.5" />}>
                      <DateField
                        value={birthday || undefined}
                        onChange={(v) => setBirthday(v ?? "")}
                        className="h-9 text-sm"
                      />
                    </Field>
                  )}
                  <Field label="Salário" icon={<DollarSign className="h-3.5 w-3.5" />}>
                    <Input
                      value={salary}
                      onChange={(e) => setSalary(e.target.value)}
                      className="h-9 text-sm"
                      placeholder="R$ 0,00"
                      inputMode="decimal"
                    />
                  </Field>
                </div>
              </section>

              <Separator />

              <section className="space-y-2.5">
                <SectionTitle
                  title="Tipo de acesso"
                  hint={
                    isSelf
                      ? "Você não pode alterar seu próprio nível de acesso."
                      : "O que este membro pode acessar na plataforma."
                  }
                />
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {ACCESS_TYPE_OPTIONS.map((opt) => (
                    <button
                      key={opt.key}
                      type="button"
                      disabled={isSelf}
                      onClick={() => selectAccessType(opt.key)}
                      className={`rounded-lg border px-3 py-2.5 text-left text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                        accessType === opt.key
                          ? "border-foreground/40 bg-muted"
                          : "border-border hover:bg-muted/50"
                      }`}
                    >
                      <span className="block font-medium text-foreground">{opt.label}</span>
                      <span className="text-muted-foreground">{opt.hint}</span>
                    </button>
                  ))}
                </div>

                {accessType === "padrao" && (
                  <div className="rounded-lg border border-border/60 bg-muted/20 px-3.5 py-3">
                    <p className="text-xs text-muted-foreground">
                      Este membro utilizará as permissões padrão do workspace.
                    </p>
                    <button
                      type="button"
                      onClick={() => setShowIncluded((v) => !v)}
                      className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-foreground hover:underline"
                    >
                      <ChevronDown
                        className={`h-3 w-3 transition-transform ${showIncluded ? "rotate-180" : ""}`}
                      />
                      {showIncluded ? "Ocultar permissões incluídas" : "Ver permissões incluídas"}
                    </button>
                    {showIncluded && (
                      <div className="mt-3 grid grid-cols-1 gap-x-6 gap-y-3 border-t border-border/60 pt-3 sm:grid-cols-2 lg:grid-cols-3">
                        {PERMISSION_GROUPS.map((group) => {
                          const items = group.items.filter((i) =>
                            MEMBER_DEFAULT_PERMISSIONS.includes(i.key),
                          );
                          if (items.length === 0) return null;
                          return (
                            <div key={group.label}>
                              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                                {group.label}
                              </p>
                              <ul className="mt-1 space-y-0.5">
                                {items.map((i) => (
                                  <li
                                    key={i.key}
                                    className="flex items-center gap-1.5 text-xs text-foreground"
                                  >
                                    <Check className="h-3 w-3 shrink-0 text-muted-foreground" />
                                    {i.label}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {accessType === "admin" && (
                  <p className="rounded-lg border border-border/60 bg-muted/20 px-3.5 py-3 text-xs text-muted-foreground">
                    Administradores possuem acesso completo ao workspace, incluindo configurações e
                    gerenciamento de membros.
                  </p>
                )}

                {accessType === "personalizado" && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-6 px-2 text-[11px]"
                        onClick={() => setPermissions(ALL_PERMISSIONS)}
                      >
                        Todas
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-6 px-2 text-[11px]"
                        onClick={() => setPermissions([])}
                      >
                        Nenhuma
                      </Button>
                    </div>
                    <div className="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
                      {PERMISSION_GROUPS.map((group) => {
                        const groupKeys = group.items.map((i) => i.key);
                        const allOn = groupKeys.every((k) => permissions.includes(k));
                        const toggleGroup = () =>
                          setPermissions((prev) =>
                            allOn
                              ? prev.filter((k) => !groupKeys.includes(k))
                              : Array.from(new Set([...prev, ...groupKeys])),
                          );
                        return (
                          <div key={group.label}>
                            <div className="flex items-center justify-between border-b border-border/60 pb-1.5">
                              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                {group.label}
                              </span>
                              <button
                                type="button"
                                onClick={toggleGroup}
                                className="text-[11px] text-muted-foreground hover:text-foreground"
                              >
                                {allOn ? "Desmarcar tudo" : "Selecionar tudo"}
                              </button>
                            </div>
                            <div className="mt-2 space-y-1">
                              {group.items.map((p) => {
                                const checked = permissions.includes(p.key);
                                return (
                                  <label
                                    key={p.key}
                                    className="flex cursor-pointer items-center gap-2 py-0.5 text-xs text-foreground"
                                  >
                                    <Checkbox
                                      checked={checked}
                                      onCheckedChange={() => togglePerm(p.key)}
                                      className="h-3.5 w-3.5 rounded-[3px]"
                                    />
                                    {p.label}
                                  </label>
                                );
                              })}
                            </div>
                            {group.label === "Administração" &&
                              permissions.includes("configuracoes") && (
                                <div className="mt-2 border-t border-border/60 pt-2">
                                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/80">
                                    Abas de Configurações
                                  </p>
                                  <div className="space-y-1">
                                    {CONFIG_SUB_PERMISSIONS.map((sp) => {
                                      const on = permissions.includes(sp.key);
                                      return (
                                        <label
                                          key={sp.key}
                                          className="flex cursor-pointer items-center gap-2 py-0.5 text-[11px] text-foreground"
                                        >
                                          <Checkbox
                                            checked={on}
                                            onCheckedChange={() => togglePerm(sp.key)}
                                            className="h-3.5 w-3.5 rounded-[3px]"
                                          />
                                          {sp.label}
                                        </label>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                            {group.label === "Gestão" && canSeeTime && (
                              <div className="mt-2 border-t border-border/60 pt-2">
                                <p className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/80">
                                  <Eye className="h-2.5 w-2.5" /> Visibilidade na aba Time
                                </p>
                                <div className="space-y-1">
                                  {TIME_FIELDS.map((f) => {
                                    const checked = timeView.includes(f.key);
                                    return (
                                      <label
                                        key={f.key}
                                        className="flex cursor-pointer items-center gap-2 py-0.5 text-[11px] text-foreground"
                                      >
                                        <Checkbox
                                          checked={checked}
                                          onCheckedChange={() => toggleField(f.key)}
                                          className="h-3.5 w-3.5 rounded-[3px]"
                                        />
                                        {f.label}
                                      </label>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </section>

              {error && <p className="text-xs text-destructive">{error}</p>}
            </div>
          </div>

          <DialogFooter className="border-t border-border bg-muted/30 px-6 py-3">
            <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" size="sm" disabled={submitting}>
              {submitting ? "Salvando..." : isNew ? "Adicionar membro" : "Salvar alterações"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SectionTitle({
  icon,
  title,
  hint,
}: {
  icon?: React.ReactNode;
  title: string;
  hint?: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-foreground">
        {icon}
        {title}
      </div>
      {hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Field({
  label,
  icon,
  children,
}: {
  label: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="block">
      <Label className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
        {icon}
        {label}
      </Label>
      {children}
    </div>
  );
}

/**
 * "Time" é um cockpit operacional (inspirado conceitualmente no
 * ClickUp, sem copiar o visual): em poucos segundos mostra como a
 * operação está — tarefas que precisam de atenção, carga por pessoa,
 * produtividade por dia da semana, e um ranking de performance que é a
 * própria lista de membros ("Performance do Time"). A página IDENTIFICA
 * problemas; a ficha individual do membro (`MemberProfileDialog`)
 * EXPLICA, com o detalhamento completo do Score. Administração (senhas
 * esquecidas, bugs, configuração do Score) vive em Configurações, não
 * aqui. `DiretorioTab` continua sendo a única camada de dados; a grade
 * visual em si vive em `src/components/team/TeamDashboard.tsx`.
 */
export function TimeSection() {
  return (
    <div className="mx-auto w-full max-w-6xl">
      <DiretorioTab />
    </div>
  );
}
