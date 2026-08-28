import { useEffect, useMemo, useState } from "react";
import {
  Plus,
  Search,
  X,
  Shield,
  ShieldCheck,
  Mail,
  Calendar,
  Briefcase,
  DollarSign,
  KeyRound,
  User,
  Eye,
  Pencil,
  Copy,
  Clock,
  Users as UsersIcon,
  CalendarClock,
  AlertTriangle,
  ChevronDown,
  Trophy,
  Bug,
  Trash2,
  ImageIcon,
} from "lucide-react";
import { SectionHeader } from "./SectionHeader";
import {
  listBugReports,
  deleteBugReport,
  getBugScreenshotUrl,
  type BugReport,
} from "@/lib/bug-reports";
import { useNavigate } from "@tanstack/react-router";
import { loadProjetos, onProjetosChange } from "@/lib/projetos";
import { loadMeetings, onMeetingsChange } from "@/lib/reunioes-store";
import { todayISO } from "@/lib/financeiro-entries";
import { useClientes } from "@/lib/clientes-store";
import { getAllCampanhaTarefas, onCampanhaTarefasChange } from "@/lib/campanha-scoped-store";
import { onStandaloneChange } from "@/lib/marketing-tasks";
import {
  computeMemberScores,
  collectTaskItems,
  tasksDueToday,
  tasksOverdue,
  SCORE_RULES,
  type MemberScore,
  type TaskItem,
  type TaskGroup,
} from "@/lib/score";
import {
  loadTasksByAssignee,
  marketingStandaloneAsTaskGroup,
  type DashTask,
} from "@/lib/task-aggregation";
import { TASK_STATUS_TONE, TASK_STATUS_DOT } from "@/components/tasks/TaskBoard";
import { OPEN_CAMPANHA_TASK_KEY, type SectionKey } from "@/components/AppShell";

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
import {
  getStatus,
  subscribeChat,
  STATUS_COLOR,
  STATUS_LABEL,
  type MemberStatus,
} from "@/lib/chat-store";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useStorageSync } from "@/lib/use-storage-sync";
import { withRetry, friendlyNetworkError } from "@/lib/net-retry";
import { useConfirm } from "@/hooks/use-confirm";

function formatBirthday(value: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  const d = new Date(value);
  return isNaN(d.getTime()) ? value : d.toLocaleDateString("pt-BR");
}

// Deterministic accent so every avatar fallback isn't the same flat gray.
const AVATAR_ACCENTS = [
  "bg-chart-1/15 text-chart-1",
  "bg-chart-2/15 text-chart-2",
  "bg-chart-3/15 text-chart-3",
  "bg-chart-4/15 text-chart-4",
  "bg-chart-5/15 text-chart-5",
];
function avatarAccent(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_ACCENTS[hash % AVATAR_ACCENTS.length];
}
function initialsOf(name: string, fallback: string): string {
  const source = name.trim() || fallback;
  return source.slice(0, 1).toUpperCase();
}

// Photos are always shown in the Time tab (not gated by timeView) — a profile
// picture isn't sensitive the way birthday/salary/email are.
type TimeField = "name" | "role" | "birthday" | "salary" | "email" | "startOfDay";
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
  const [expandedId, setExpandedId] = useState<string | null>(null);
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

  const adminCount = useMemo(() => members.filter((m) => m.isAdmin).length, [members]);
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

  const scores = useMemo<MemberScore[]>(() => {
    void tick;
    return computeMemberScores(
      loadProjetos(),
      loadMeetings(),
      members,
      undefined,
      groupsWithMarketing,
    );
  }, [members, tick, groupsWithMarketing]);
  const scoreByMemberId = useMemo(() => new Map(scores.map((s) => [s.member.id, s])), [scores]);

  // Tarefas vinculadas a CADA pessoa (não só a contagem do score) — uma
  // passada só sobre todo o trabalho da plataforma, igual "Meu trabalho" no
  // Início, mas pra todo mundo de uma vez.
  const tasksByMember = useMemo(() => {
    void tick;
    return loadTasksByAssignee(campanhaNames);
  }, [campanhaNames, tick]);

  const taskItems = useMemo(() => {
    void tick;
    return collectTaskItems(loadProjetos(), groupsWithMarketing);
  }, [tick, groupsWithMarketing]);

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
  const today = todayISO();
  const dueTodayAll = useMemo(() => tasksDueToday(taskItems, today), [taskItems, today]);
  const overdueAll = useMemo(() => tasksOverdue(taskItems, today), [taskItems, today]);
  const checkedInToday = useMemo(
    () => members.filter((m) => m.startTimes?.[today]).length,
    [members, today],
  );

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

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-6">
        <div className="flex gap-x-6 overflow-x-auto whitespace-nowrap pb-1">
          <div className="flex shrink-0 items-baseline gap-2">
            <span className="text-lg font-bold text-foreground">{members.length}</span>
            <span className="text-xs uppercase text-muted-foreground">
              {members.length === 1 ? "Membro" : "Membros"}
            </span>
          </div>
          <div className="flex shrink-0 items-baseline gap-2 border-l border-border pl-6">
            <span className="text-lg font-bold text-foreground">{adminCount}</span>
            <span className="text-xs uppercase text-muted-foreground">Admins</span>
          </div>
          <div className="flex shrink-0 items-baseline gap-2 border-l border-border pl-6">
            <span className="text-lg font-bold text-foreground">{onlineCount}</span>
            <span className="text-xs uppercase text-muted-foreground">Online agora</span>
          </div>
          <div className="flex shrink-0 items-baseline gap-2 border-l border-border pl-6">
            <span
              className={`text-lg font-bold ${overdueAll.length > 0 ? "text-destructive" : "text-foreground"}`}
            >
              {overdueAll.length}
            </span>
            <span className="text-xs uppercase text-muted-foreground">Tarefas atrasadas</span>
          </div>
          <div className="flex shrink-0 items-baseline gap-2 border-l border-border pl-6">
            <span className="text-lg font-bold text-foreground">{dueTodayAll.length}</span>
            <span className="text-xs uppercase text-muted-foreground">Vencem hoje</span>
          </div>
          <div className="flex shrink-0 items-baseline gap-2 border-l border-border pl-6">
            <span className="text-lg font-bold text-foreground">
              {checkedInToday}/{members.length}
            </span>
            <span className="text-xs uppercase text-muted-foreground">Começaram o dia</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por nome, cargo ou email"
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

        {(dueTodayAll.length > 0 || overdueAll.length > 0) && (
          <TeamTasksPanel dueToday={dueTodayAll} overdue={overdueAll} members={members} />
        )}

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-1 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1 font-semibold uppercase tracking-wider">
            <Trophy className="h-3 w-3 text-amber-500" /> Pontuação:
          </span>
          {SCORE_RULES.map((r) => (
            <span key={r.key} className="whitespace-nowrap">
              {r.label}{" "}
              <span
                className={
                  r.points > 0
                    ? "font-semibold text-emerald-600 dark:text-emerald-400"
                    : "font-semibold text-destructive"
                }
              >
                {r.points > 0 ? "+" : ""}
                {r.points}
              </span>
            </span>
          ))}
        </div>

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-[68px] animate-pulse rounded-xl border border-border bg-muted/30"
              />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-background p-12 text-center">
            <UsersIcon className="mx-auto h-8 w-8 text-muted-foreground/50" />
            <p className="mt-3 text-sm text-muted-foreground">
              {members.length === 0 ? "Nenhum membro ainda." : "Nenhum resultado para essa busca."}
            </p>
            {members.length === 0 && isAdmin && (
              <button
                onClick={() => setOpen(true)}
                className="mt-3 text-xs font-medium text-foreground underline underline-offset-2"
              >
                Adicionar o primeiro
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-border rounded-lg border border-border">
            {filtered.map((m) => (
              <PersonRow
                key={m.id}
                member={m}
                score={scoreByMemberId.get(m.id)}
                tasks={tasksByMember.get(m.name) ?? []}
                onOpenTask={openTask}
                isSelf={m.id === meId}
                isAdmin={isAdmin}
                expanded={expandedId === m.id}
                onToggleExpand={() => setExpandedId((id) => (id === m.id ? null : m.id))}
                onOpenProfile={() => {
                  if (isAdmin) {
                    setEditing(m);
                    setOpen(true);
                  } else {
                    setViewing(m);
                  }
                }}
                onEdit={() => {
                  setEditing(m);
                  setOpen(true);
                }}
                onDelete={() => void handleDelete(m.id)}
                onReset={() => void handleReset(m.id)}
              />
            ))}
          </div>
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
          <MemberViewDialog
            member={viewing}
            isSelf={viewing.id === meId}
            onOpenChange={(v) => {
              if (!v) setViewing(null);
            }}
          />
        )}
        {confirmDialog}
      </div>
    </TooltipProvider>
  );
}

function PresenceDot({ status }: { status: MemberStatus }) {
  return (
    <span
      title={STATUS_LABEL[status]}
      className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-card ${STATUS_COLOR[status]}`}
    />
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 text-sm font-semibold tabular-nums text-foreground">{value}</p>
    </div>
  );
}

function fmtDateBR(d: string) {
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

function TeamTasksPanel({
  dueToday,
  overdue,
  members,
}: {
  dueToday: TaskItem[];
  overdue: TaskItem[];
  members: Member[];
}) {
  const [open, setOpen] = useState(false);
  const findMember = (name?: string) => members.find((m) => m.name === name);

  const Row = ({ item }: { item: TaskItem }) => {
    const member = findMember(item.assignee);
    return (
      <li className="flex items-center justify-between gap-3 px-3 py-2 text-xs">
        <div className="flex min-w-0 items-center gap-2">
          <Avatar className="h-6 w-6 shrink-0">
            {member?.photo && <AvatarImage src={member.photo} alt="" />}
            <AvatarFallback className="text-[10px]">
              {initialsOf(member?.name ?? "", item.assignee ?? "?")}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate font-medium text-foreground">{item.title}</p>
            <p className="truncate text-[11px] text-muted-foreground">
              {item.assignee ?? "Sem responsável"} · {item.projectName}
            </p>
          </div>
        </div>
        <span className="shrink-0 text-[11px] text-muted-foreground">
          {item.dueDate ? fmtDateBR(item.dueDate) : "—"}
        </span>
      </li>
    );
  };

  return (
    <div className="rounded-lg border border-border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          <CalendarClock className="h-3.5 w-3.5" /> Tarefas do time — {dueToday.length} hoje,{" "}
          {overdue.length} atrasada{overdue.length === 1 ? "" : "s"}
        </span>
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="grid grid-cols-1 gap-0 border-t border-border sm:grid-cols-2 sm:divide-x sm:divide-border">
          <div>
            <p className="px-3 pt-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Hoje
            </p>
            {dueToday.length === 0 ? (
              <p className="p-3 text-xs text-muted-foreground">Ninguém tem tarefa vencendo hoje.</p>
            ) : (
              <ul className="max-h-64 divide-y divide-border overflow-y-auto">
                {dueToday.map((t) => (
                  <Row key={t.id} item={t} />
                ))}
              </ul>
            )}
          </div>
          <div>
            <p className="px-3 pt-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              <AlertTriangle className="mr-1 inline h-3 w-3 text-destructive" />
              Atrasadas
            </p>
            {overdue.length === 0 ? (
              <p className="p-3 text-xs text-muted-foreground">Nenhuma tarefa atrasada. 🎉</p>
            ) : (
              <ul className="max-h-64 divide-y divide-border overflow-y-auto">
                {overdue.map((t) => (
                  <Row key={t.id} item={t} />
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

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

function PersonRow({
  member: m,
  score,
  tasks,
  onOpenTask,
  isSelf,
  isAdmin,
  expanded,
  onToggleExpand,
  onOpenProfile,
  onEdit,
  onDelete,
  onReset,
}: {
  member: Member;
  score?: MemberScore;
  /** Todas as tarefas (projeto, campanha, avulsa do Marketing) vinculadas a
   * esta pessoa — vazio quando ela não tem nenhuma no momento. */
  tasks: DashTask[];
  onOpenTask: (t: DashTask) => void;
  isSelf: boolean;
  isAdmin: boolean;
  expanded: boolean;
  onToggleExpand: () => void;
  onOpenProfile: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onReset: () => void;
}) {
  const canManage = isAdmin;
  const stop = (e: React.MouseEvent) => e.stopPropagation();
  const allowed = (f: TimeField) => canManage || isSelf || m.timeView.includes(f);
  const showName = allowed("name");
  const showRole = allowed("role");
  const showEmail = allowed("email");
  const showBirthday = allowed("birthday");
  const status = getStatus(m.id);
  const attendanceTotal = (score?.meetingsAttended ?? 0) + (score?.meetingsMissed ?? 0);

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        onClick={onToggleExpand}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggleExpand();
          }
        }}
        className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left hover:bg-muted/40 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-inset"
      >
        <div className="relative shrink-0">
          <Avatar className="h-10 w-10">
            {m.photo && <AvatarImage src={m.photo} alt={m.name} />}
            <AvatarFallback className={`text-sm font-semibold ${avatarAccent(m.id)}`}>
              {initialsOf(showName ? m.name : "", m.email)}
            </AvatarFallback>
          </Avatar>
          <PresenceDot status={status} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-sm font-semibold text-foreground">
              {showName ? m.name || "(sem nome)" : "Membro"}
            </p>
            {isSelf && (
              <Badge variant="secondary" className="shrink-0 px-1.5 py-0 text-[10px]">
                Você
              </Badge>
            )}
            {m.isAdmin && (
              <Badge
                variant="outline"
                className="shrink-0 gap-1 border-foreground/20 px-1.5 py-0 text-[10px] font-medium text-foreground"
              >
                <ShieldCheck className="h-2.5 w-2.5" /> Admin
              </Badge>
            )}
          </div>
          {showRole && m.role && <p className="truncate text-xs text-muted-foreground">{m.role}</p>}
        </div>
        {score && (
          <span
            className={`shrink-0 text-base font-semibold tabular-nums ${
              score.score > 0
                ? "text-emerald-600 dark:text-emerald-400"
                : score.score < 0
                  ? "text-destructive"
                  : "text-foreground"
            }`}
          >
            {score.score > 0 ? "+" : ""}
            {score.score}
          </span>
        )}
        {canManage && (
          <div className="flex shrink-0 items-center gap-0.5">
            <IconAction
              label="Redefinir senha"
              onClick={(e) => {
                stop(e);
                onReset();
              }}
            >
              <KeyRound className="h-3.5 w-3.5" />
            </IconAction>
            <IconAction
              label="Editar"
              onClick={(e) => {
                stop(e);
                onEdit();
              }}
            >
              <Pencil className="h-3.5 w-3.5" />
            </IconAction>
            {!isSelf && (
              <IconAction
                label="Remover"
                destructive
                onClick={(e) => {
                  stop(e);
                  onDelete();
                }}
              >
                <X className="h-3.5 w-3.5" />
              </IconAction>
            )}
          </div>
        )}
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`}
        />
      </div>

      {expanded && (
        <div className="space-y-4 border-t border-border bg-muted/20 px-4 py-4">
          {(showEmail || (showBirthday && m.birthday)) && (
            <dl className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
              {showEmail && (
                <div className="flex items-center gap-1.5">
                  <Mail className="h-3 w-3 shrink-0" />
                  <span>{m.email}</span>
                </div>
              )}
              {showBirthday && m.birthday && (
                <div className="flex items-center gap-1.5">
                  <Calendar className="h-3 w-3 shrink-0" />
                  <span>{formatBirthday(m.birthday)}</span>
                </div>
              )}
            </dl>
          )}

          {score ? (
            <div>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                Score geral
              </p>
              <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 md:grid-cols-4">
                <Stat label="No prazo" value={score.tasksOnTime} />
                <Stat label="Entregue atrasada" value={score.tasksLate} />
                <Stat label="Atrasada (aberta)" value={score.tasksOverdue} />
                <Stat label="Abertas agora" value={score.openTasks} />
                <Stat
                  label="Atraso médio"
                  value={
                    score.avgDelayDays === null
                      ? "—"
                      : score.avgDelayDays === 0
                        ? "no dia"
                        : score.avgDelayDays > 0
                          ? `${score.avgDelayDays.toFixed(1)}d atraso`
                          : `${Math.abs(score.avgDelayDays).toFixed(1)}d adiantado`
                  }
                />
                <Stat label="Reuniões OK" value={score.meetingsAttended} />
                <Stat label="Reuniões perdidas" value={score.meetingsMissed} />
                <Stat
                  label="Presença em reuniões"
                  value={
                    attendanceTotal === 0
                      ? "—"
                      : `${Math.round((score.meetingsAttended / attendanceTotal) * 100)}%`
                  }
                />
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Sem dados de pontuação ainda.</p>
          )}

          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Tarefas vinculadas ({tasks.length})
            </p>
            <PersonTasksList tasks={tasks} onOpenTask={onOpenTask} stopClick={stop} />
          </div>

          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Início de dia
            </p>
            <StartOfDayHistory startTimes={m.startTimes} />
          </div>

          <button
            type="button"
            onClick={(e) => {
              stop(e);
              onOpenProfile();
            }}
            className="text-xs font-medium text-foreground underline underline-offset-2"
          >
            {canManage ? "Editar perfil completo" : "Ver perfil completo"}
          </button>
        </div>
      )}
    </div>
  );
}

// Mais urgente primeiro — mesma ordem de prioridade visual que "Meu
// trabalho" (Início) já usa pros próprios buckets.
const TASK_BUCKET_ORDER: Record<DashTask["bucket"], number> = {
  atrasada: 0,
  hoje: 1,
  amanha: 2,
  semana: 3,
  outro: 4,
};

/** Lista de tarefas vinculadas a UMA pessoa, dentro da linha expandida dela
 * na aba Time — antes só existiam contagens agregadas (score), sem nenhum
 * jeito de ver QUAIS tarefas geraram aquele número. */
function PersonTasksList({
  tasks,
  onOpenTask,
  stopClick,
}: {
  tasks: DashTask[];
  onOpenTask: (t: DashTask) => void;
  stopClick: (e: React.MouseEvent) => void;
}) {
  const sorted = useMemo(
    () => [...tasks].sort((a, b) => TASK_BUCKET_ORDER[a.bucket] - TASK_BUCKET_ORDER[b.bucket]),
    [tasks],
  );

  if (sorted.length === 0) {
    return <p className="text-xs text-muted-foreground">Nenhuma tarefa vinculada no momento.</p>;
  }

  return (
    <ul className="max-h-72 divide-y divide-border overflow-y-auto rounded-md border border-border">
      {sorted.map((t) => (
        <li key={`${t.projectId}_${t.id}`}>
          <button
            type="button"
            onClick={(e) => {
              stopClick(e);
              onOpenTask(t);
            }}
            className="group flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/40"
          >
            <div className="min-w-0 flex-1">
              <p className="flex min-w-0 items-center gap-1.5 truncate text-xs text-foreground group-hover:underline">
                {t.parentTitle && (
                  <span
                    title={`Subtarefa de "${t.parentTitle}"`}
                    className="inline-flex shrink-0 items-center rounded border border-border bg-muted/60 px-1 py-0.5 text-[9px] font-semibold uppercase leading-none tracking-wide text-muted-foreground"
                  >
                    Sub
                  </span>
                )}
                <span className="truncate">{t.title}</span>
              </p>
              <p className="truncate text-[11px] text-muted-foreground">{t.projectName}</p>
            </div>
            <span
              className={`hidden shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide sm:inline-flex ${TASK_STATUS_TONE[t.status]}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${TASK_STATUS_DOT[t.status]}`} />
              {t.status}
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
  );
}

function IconAction({
  label,
  destructive,
  onClick,
  children,
}: {
  label: string;
  destructive?: boolean;
  onClick: (e: React.MouseEvent) => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          aria-label={label}
          className={`rounded-md p-1.5 text-muted-foreground hover:bg-muted ${destructive ? "hover:text-destructive" : "hover:text-foreground"}`}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

type MemberFormPayload = {
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

function MemberDialog({
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
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [timeView, setTimeView] = useState<TimeField[]>(DEFAULT_TIME_VIEW);
  const [isAdminRole, setIsAdminRole] = useState(false);
  const [preset, setPreset] = useState<PermissionPreset>("padrao");
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
    setPermissions(initial ? initial.permissions : MEMBER_DEFAULT_PERMISSIONS);
    setTimeView(initial?.timeView ?? DEFAULT_TIME_VIEW);
    setIsAdminRole(initial?.isAdmin ?? false);
    // Abre no preset "Membro padrão" se as permissões salvas baterem
    // exatamente com o padrão; senão abre em Personalizado mostrando as
    // permissões reais. Sem isso, um membro salvo como padrão sempre
    // reabria marcado como Personalizado, parecendo que a troca não salvou.
    setPreset(isDefaultPermissionSet(initial ? initial.permissions : MEMBER_DEFAULT_PERMISSIONS));
    setError("");
  }, [open, initial]);

  const applyPreset = (next: PermissionPreset) => {
    setPreset(next);
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
        permissions,
        timeView,
        isAdminRole,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] max-w-2xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-border px-6 py-4">
          <DialogTitle>{isNew ? "Novo membro" : "Editar membro"}</DialogTitle>
          <DialogDescription>
            {isNew
              ? "Cadastre o email e uma senha temporária. O membro completará foto, nome, aniversário, telefone e nova senha no primeiro acesso."
              : "Atualize dados do membro."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="space-y-6 px-6 py-5">
              <section className="space-y-3">
                <SectionTitle
                  icon={<KeyRound className="h-3.5 w-3.5" />}
                  title="Acesso"
                  hint="Credenciais para o primeiro login."
                />
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
                  {isNew && (
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
                  )}
                </div>
                <label
                  className={`mt-1 flex items-start justify-between gap-3 rounded-lg border px-3.5 py-3 transition-colors ${
                    isSelf ? "cursor-not-allowed opacity-70" : "cursor-pointer"
                  } ${isAdminRole ? "border-foreground/30 bg-muted/60" : "border-border hover:bg-muted/30"}`}
                >
                  <span className="flex items-start gap-2.5">
                    <Shield className="mt-0.5 h-4 w-4 shrink-0 text-foreground" />
                    <span>
                      <span className="block text-sm font-medium text-foreground">
                        Administrador
                      </span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {isSelf
                          ? "Você não pode remover seu próprio acesso de admin."
                          : "Admins podem gerenciar o time, criar/editar membros e acessar tudo."}
                      </span>
                    </span>
                  </span>
                  <Switch
                    checked={isAdminRole}
                    onCheckedChange={setIsAdminRole}
                    disabled={isSelf}
                    className="mt-0.5 shrink-0"
                  />
                </label>
              </section>

              <Separator />

              <section className="space-y-3">
                <SectionTitle
                  icon={<User className="h-3.5 w-3.5" />}
                  title="Dados opcionais"
                  hint="Podem ser preenchidos agora ou pelo próprio membro."
                />
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
                  <Field label="Aniversário" icon={<Calendar className="h-3.5 w-3.5" />}>
                    <Input
                      type="date"
                      value={birthday}
                      onChange={(e) => setBirthday(e.target.value)}
                      className="h-9 text-sm"
                    />
                  </Field>
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

              {!isNew && (
                <>
                  <Separator />
                  <section className="space-y-2">
                    <SectionTitle
                      icon={<Clock className="h-3.5 w-3.5" />}
                      title="Início de dia"
                      hint="Horário em que o membro tocou 'Começar o dia'."
                    />
                    {(() => {
                      const entries = Object.entries(initial?.startTimes ?? {}).filter(
                        ([d, h]) => d && h,
                      );
                      if (entries.length === 0) {
                        return (
                          <p className="text-xs text-muted-foreground">Sem registros ainda.</p>
                        );
                      }
                      const [lastDate, lastTime] = entries.sort((a, b) =>
                        a[0] < b[0] ? 1 : -1,
                      )[0];
                      const [y, m, day] = lastDate.split("-");
                      return (
                        <p className="text-xs text-muted-foreground">
                          Último registro:{" "}
                          <span className="font-medium tabular-nums text-foreground">
                            {day}/{m}/{y} às {lastTime}
                          </span>{" "}
                          · histórico completo na aba "Início de dia".
                        </p>
                      );
                    })()}
                  </section>
                </>
              )}

              <Separator />

              <section className="space-y-3">
                <SectionTitle
                  icon={<Shield className="h-3.5 w-3.5" />}
                  title="Permissões"
                  hint="O que este membro pode acessar."
                />

                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => applyPreset("padrao")}
                    className={`flex-1 rounded-lg border px-3 py-2 text-left text-xs transition-colors ${
                      preset === "padrao"
                        ? "border-foreground/40 bg-muted"
                        : "border-border hover:bg-muted/50"
                    }`}
                  >
                    <span className="block font-medium text-foreground">Membro padrão</span>
                    <span className="text-muted-foreground">
                      Clientes, campanhas, projetos, reuniões, influenciadores, time e chat.
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPreset("personalizado")}
                    className={`flex-1 rounded-lg border px-3 py-2 text-left text-xs transition-colors ${
                      preset === "personalizado"
                        ? "border-foreground/40 bg-muted"
                        : "border-border hover:bg-muted/50"
                    }`}
                  >
                    <span className="block font-medium text-foreground">Personalizado</span>
                    <span className="text-muted-foreground">
                      Escolher área por área (inclui comercial, financeiro, configurações...).
                    </span>
                  </button>
                </div>

                {preset === "personalizado" && (
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
                    <div className="space-y-3">
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
                          <div key={group.label} className="rounded-lg border border-border">
                            <div className="flex items-center justify-between border-b border-border bg-muted/40 px-3 py-1.5">
                              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                {group.label}
                              </span>
                              <button
                                type="button"
                                onClick={toggleGroup}
                                className="text-[10px] text-muted-foreground hover:text-foreground"
                              >
                                {allOn ? "Desmarcar grupo" : "Marcar grupo"}
                              </button>
                            </div>
                            <div className="grid grid-cols-2 gap-1.5 p-2 sm:grid-cols-3">
                              {group.items.map((p) => {
                                const checked = permissions.includes(p.key);
                                return (
                                  <label
                                    key={p.key}
                                    className={`flex cursor-pointer items-center gap-2 rounded-md border px-2 py-1.5 text-xs ${checked ? "border-foreground/40 bg-muted" : "border-border hover:bg-muted/50"}`}
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
                                <div className="border-t border-border bg-background px-3 py-2">
                                  <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                                    Abas de Configurações permitidas
                                  </p>
                                  <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                                    {CONFIG_SUB_PERMISSIONS.map((sp) => {
                                      const on = permissions.includes(sp.key);
                                      return (
                                        <label
                                          key={sp.key}
                                          className={`flex cursor-pointer items-center gap-2 rounded-md border px-2 py-1 text-[11px] ${on ? "border-foreground/40 bg-muted" : "border-border hover:bg-muted/50"}`}
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
                            {group.label === "Time & Comunicação" && canSeeTime && (
                              <div className="border-t border-border bg-background px-3 py-2">
                                <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                                  <Eye className="h-3 w-3" /> Visibilidade na aba Time
                                </p>
                                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                                  {TIME_FIELDS.map((f) => {
                                    const checked = timeView.includes(f.key);
                                    return (
                                      <label
                                        key={f.key}
                                        className={`flex cursor-pointer items-center gap-2 rounded-md border px-2 py-1 text-[11px] ${checked ? "border-foreground/40 bg-muted" : "border-border hover:bg-muted/50"}`}
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
              {submitting ? "Salvando..." : isNew ? "Criar membro" : "Salvar alterações"}
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
  icon: React.ReactNode;
  title: string;
  hint?: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
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

function MemberViewDialog({
  member,
  isSelf,
  onOpenChange,
}: {
  member: Member;
  isSelf: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const tv = member.timeView ?? [];
  const show = (f: TimeField) => isSelf || tv.includes(f);
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

  const startEntries = show("startOfDay")
    ? Object.entries(member.startTimes ?? {})
        .filter(([d, h]) => d && h)
        .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    : [];
  const fmtDate = (d: string) => {
    const [y, m, day] = d.split("-");
    return `${day}/${m}/${y}`;
  };
  const status = getStatus(member.id);

  return (
    <Dialog open={!!member} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] max-w-md flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-border px-6 py-4">
          <DialogTitle>Perfil</DialogTitle>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="space-y-5 px-6 py-5">
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
                  <span className="text-[11px] text-muted-foreground">{STATUS_LABEL[status]}</span>
                </div>
              </div>
            </div>

            {rows.length === 0 && startEntries.length === 0 ? (
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
            )}

            {startEntries.length > 0 && (
              <section className="space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                  <Clock className="h-3.5 w-3.5" /> Início de dia
                </div>
                <p className="text-xs text-muted-foreground">
                  Último registro:{" "}
                  <span className="font-medium tabular-nums text-foreground">
                    {fmtDate(startEntries[0][0])} às {startEntries[0][1]}
                  </span>{" "}
                  · histórico completo na aba "Início de dia".
                </p>
              </section>
            )}
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

/**
 * "Time" e "Gestão" eram duas seções separadas no menu (diretório de
 * membros vs. métricas/ranking/tarefas/início de dia) mostrando dados
 * sobrepostos (início de dia aparecia em 3 lugares diferentes) e exigindo
 * trocar de tela pra ver o score de alguém que você já estava olhando.
 * Unificadas numa lista única: cada linha é uma pessoa (foto + cargo +
 * score), e expandir mostra o detalhe (tarefas, reuniões, início de dia)
 * sem sair da lista.
 */
export function TimeSection() {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <SectionHeader title="Time" subtitle="Membros, métricas e pontuação do time." />
      <DiretorioTab />
      <PasswordResetRequestsPanel />
      <BugReportsPanel />
    </div>
  );
}

type PasswordResetRequest = {
  id: string;
  email: string;
  created_at: string;
  resolved: boolean;
};

/** Painel admin-only com os pedidos de "esqueci minha senha" feitos na tela
 * de login (sem sessão, então não têm como cair direto no perfil de
 * ninguém) — o admin vê o e-mail, reseta manualmente pela aba de membros
 * (KeyRound no perfil) e marca aqui como resolvido. */
function PasswordResetRequestsPanel() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [checked, setChecked] = useState(false);
  const [open, setOpen] = useState(false);
  const [requests, setRequests] = useState<PasswordResetRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return setChecked(true);
      const { data: ok } = await supabase.rpc("is_admin", { _user_id: u.user.id });
      setIsAdmin(Boolean(ok));
      setChecked(true);
    })();
  }, []);

  const load = async () => {
    setLoading(true);
    setError("");
    const { data, error: err } = await supabase
      .from("password_reset_requests")
      .select("id, email, created_at, resolved")
      .eq("resolved", false)
      .order("created_at", { ascending: false });
    if (err) setError(err.message);
    else setRequests(data ?? []);
    setLoading(false);
  };

  useEffect(() => {
    if (open) void load();
  }, [open]);

  const resolve = async (id: string) => {
    setRequests((prev) => prev.filter((r) => r.id !== id));
    const { data: u } = await supabase.auth.getUser();
    const { error: err } = await supabase
      .from("password_reset_requests")
      .update({ resolved: true, resolved_at: new Date().toISOString(), resolved_by: u.user?.id })
      .eq("id", id);
    if (err) setError(err.message);
  };

  if (!checked || !isAdmin) return null;

  return (
    <div className="rounded-xl border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 px-5 py-4 text-left"
      >
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold text-foreground">Senhas esquecidas</span>
          {requests.length > 0 && (
            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
              {requests.length}
            </span>
          )}
        </div>
        <ChevronDown
          className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="space-y-3 border-t border-border px-5 py-4">
          {error && <p className="text-xs text-destructive">{error}</p>}
          {loading && <p className="text-xs text-muted-foreground">Carregando...</p>}
          {!loading && requests.length === 0 && (
            <p className="text-xs text-muted-foreground">Nenhum pedido pendente.</p>
          )}
          {requests.map((r) => (
            <div
              key={r.id}
              className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{r.email}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(r.created_at).toLocaleString("pt-BR")} · redefina pelo perfil do membro
                  (ícone de chave)
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void resolve(r.id)}
                className="shrink-0"
              >
                Marcar resolvido
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BugReportsPanel() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [checked, setChecked] = useState(false);
  const [open, setOpen] = useState(false);
  const [reports, setReports] = useState<BugReport[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<{ id: string; url: string } | null>(null);
  const { confirm, confirmDialog } = useConfirm();

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return setChecked(true);
      const { data: ok } = await supabase.rpc("is_admin", { _user_id: u.user.id });
      setIsAdmin(Boolean(ok));
      setChecked(true);
    })();
  }, []);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      setReports(await listBugReports("plataforma"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar relatos.");
    }
    setLoading(false);
  };

  useEffect(() => {
    if (open) void load();
  }, [open]);

  const handleDelete = async (r: BugReport) => {
    const ok = await confirm("Remover este relato de bug?");
    if (!ok) return;
    try {
      await deleteBugReport(r.id, r.screenshotPath);
      setReports((prev) => prev.filter((x) => x.id !== r.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao remover.");
    }
  };

  const handlePreview = async (r: BugReport) => {
    if (!r.screenshotPath) return;
    try {
      const url = await getBugScreenshotUrl(r.screenshotPath);
      setPreview({ id: r.id, url });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar print.");
    }
  };

  if (!checked || !isAdmin) return null;

  return (
    <div className="rounded-xl border border-border bg-card">
      {confirmDialog}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 px-5 py-4 text-left"
      >
        <div className="flex items-center gap-2">
          <Bug className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold text-foreground">Bugs reportados</span>
          {reports.length > 0 && (
            <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-xs font-medium text-destructive">
              {reports.length}
            </span>
          )}
        </div>
        <ChevronDown
          className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="space-y-3 border-t border-border px-5 py-4">
          {error && <p className="text-xs text-destructive">{error}</p>}
          {loading && <p className="text-xs text-muted-foreground">Carregando...</p>}
          {!loading && reports.length === 0 && (
            <p className="text-xs text-muted-foreground">Nenhum bug reportado até agora.</p>
          )}
          {reports.map((r) => (
            <div
              key={r.id}
              className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:flex-row sm:items-start sm:justify-between"
            >
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {r.reporterName || r.clientLabel || "Sem nome"}
                  </span>
                  <span>{new Date(r.createdAt).toLocaleString("pt-BR")}</span>
                  {r.pageContext && <span className="truncate">{r.pageContext}</span>}
                </div>
                <p className="whitespace-pre-wrap text-sm text-foreground">{r.description}</p>
                {r.screenshotPath && (
                  <button
                    type="button"
                    onClick={() => handlePreview(r)}
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    <ImageIcon className="h-3.5 w-3.5" />
                    Ver print
                  </button>
                )}
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleDelete(r)}
                className="shrink-0 text-destructive hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Print anexado</DialogTitle>
          </DialogHeader>
          {preview && (
            <img
              src={preview.url}
              alt="Print do bug"
              className="w-full rounded-md border border-border"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
