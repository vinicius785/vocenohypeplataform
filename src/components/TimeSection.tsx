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
} from "lucide-react";

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

export function TimeSection() {
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
      <div className="mx-auto w-full max-w-6xl space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Time</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {members.length} {members.length === 1 ? "membro" : "membros"} no workspace
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
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

        {loading ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-[132px] animate-pulse rounded-xl border border-border bg-muted/30"
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
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((m) => {
              const canManage = isAdmin;
              return (
                <MemberCard
                  key={m.id}
                  m={m}
                  isSelf={m.id === meId}
                  canManage={canManage}
                  onOpen={() => {
                    if (canManage) {
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
                  onDelete={() => handleDelete(m.id)}
                  onReset={() => handleReset(m.id)}
                />
              );
            })}
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

function MemberCard({
  m,
  isSelf,
  canManage,
  onOpen,
  onEdit,
  onDelete,
  onReset,
}: {
  m: Member;
  isSelf: boolean;
  canManage: boolean;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onReset: () => void;
}) {
  const stop = (e: React.MouseEvent) => e.stopPropagation();
  const allowed = (f: TimeField) => canManage || m.timeView.includes(f);
  const showName = allowed("name");
  const showRole = allowed("role");
  const showEmail = allowed("email");
  const showBirthday = allowed("birthday");
  const status = getStatus(m.id);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className="group relative cursor-pointer rounded-xl border border-white/10 bg-card/60 p-4 text-left shadow-sm backdrop-blur-md transition-all hover:-translate-y-0.5 hover:border-foreground/30 hover:bg-card/80 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-ring"
    >
      <div className="flex items-start gap-3">
        <div className="relative shrink-0">
          <Avatar className="h-12 w-12">
            {m.photo && <AvatarImage src={m.photo} alt={m.name} />}
            <AvatarFallback className={`text-sm font-semibold ${avatarAccent(m.id)}`}>
              {initialsOf(showName ? m.name : "", m.email)}
            </AvatarFallback>
          </Avatar>
          <PresenceDot status={status} />
        </div>
        <div className="min-w-0 flex-1 pt-0.5">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-sm font-semibold text-foreground">
              {showName ? m.name || "(sem nome)" : "Membro"}
            </p>
            {isSelf && (
              <Badge variant="secondary" className="shrink-0 px-1.5 py-0 text-[10px]">
                Você
              </Badge>
            )}
          </div>
          {showRole && m.role && <p className="truncate text-xs text-muted-foreground">{m.role}</p>}
          {m.isAdmin && (
            <Badge
              variant="outline"
              className="mt-1 gap-1 border-foreground/20 px-1.5 py-0 text-[10px] font-medium text-foreground"
            >
              <ShieldCheck className="h-2.5 w-2.5" /> Admin
            </Badge>
          )}
        </div>
        {canManage && (
          <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
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
      </div>

      {(showEmail || (showBirthday && m.birthday)) && (
        <dl className="mt-3 space-y-1 border-t border-border/60 pt-2.5 text-xs text-muted-foreground">
          {showEmail && (
            <div className="flex items-center gap-1.5 truncate">
              <Mail className="h-3 w-3 shrink-0" />
              <span className="truncate">{m.email}</span>
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

      {canManage && m.permissions.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {m.permissions.slice(0, 4).map((p) => (
            <Badge key={p} variant="secondary" className="px-1.5 py-0 text-[10px] font-normal">
              {p}
            </Badge>
          ))}
          {m.permissions.length > 4 && (
            <span className="self-center text-[10px] text-muted-foreground">
              +{m.permissions.length - 4}
            </span>
          )}
        </div>
      )}
    </div>
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
    setPermissions(initial?.permissions ?? []);
    setTimeView(initial?.timeView ?? DEFAULT_TIME_VIEW);
    setIsAdminRole(initial?.isAdmin ?? false);
    setError("");
  }, [open, initial]);

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
                  <section className="space-y-3">
                    <SectionTitle
                      icon={<Clock className="h-3.5 w-3.5" />}
                      title="Histórico de início de dia"
                      hint="Horário em que o membro tocou 'Começar o dia'."
                    />
                    {(() => {
                      const entries = Object.entries(initial?.startTimes ?? {})
                        .filter(([d, h]) => d && h)
                        .sort((a, b) => (a[0] < b[0] ? 1 : -1));
                      if (entries.length === 0) {
                        return (
                          <p className="text-xs text-muted-foreground">Sem registros ainda.</p>
                        );
                      }
                      const fmt = (d: string) => {
                        const [y, m, day] = d.split("-");
                        return `${day}/${m}/${y}`;
                      };
                      return (
                        <div className="max-h-48 overflow-y-auto rounded-lg border border-border">
                          <ul className="divide-y divide-border text-xs">
                            {entries.slice(0, 60).map(([d, h]) => (
                              <li key={d} className="flex items-center justify-between px-3 py-1.5">
                                <span className="text-muted-foreground">{fmt(d)}</span>
                                <span className="font-medium tabular-nums">{h}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      );
                    })()}
                  </section>
                </>
              )}

              <Separator />

              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <SectionTitle
                    icon={<Shield className="h-3.5 w-3.5" />}
                    title="Permissões"
                    hint="Selecione as áreas que este membro pode acessar."
                  />
                  <div className="flex items-center gap-2">
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
              <section className="space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                  <Clock className="h-3.5 w-3.5" /> Histórico de início de dia
                </div>
                <div className="max-h-48 overflow-y-auto rounded-lg border border-border">
                  <ul className="divide-y divide-border text-xs">
                    {startEntries.slice(0, 60).map(([d, h]) => (
                      <li key={d} className="flex items-center justify-between px-3 py-1.5">
                        <span className="text-muted-foreground">{fmtDate(d)}</span>
                        <span className="font-medium tabular-nums">{h}</span>
                      </li>
                    ))}
                  </ul>
                </div>
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
