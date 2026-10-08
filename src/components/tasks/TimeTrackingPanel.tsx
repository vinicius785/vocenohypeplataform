"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Play,
  Square,
  Pencil,
  Trash2,
  Loader2,
  Plus,
  X,
  ChevronLeft,
  MoreVertical,
  Search,
  UserPlus,
} from "lucide-react";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { AlertDialog, AlertDialogContent } from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { useConfirm } from "@/hooks/use-confirm";
import { useIsMobile } from "@/hooks/use-mobile";
import { Checkbox } from "@/components/ui/checkbox";
import { TimeField } from "@/components/ui/time-field";
import { DateField } from "@/components/ui/date-field";
import { getMe } from "@/lib/chat-store";
import { useMyAccess, hasPermission } from "@/lib/permissions";
import {
  type TimeEntry,
  type TaskOrigin,
  useTaskTimeEntries,
  useRunningTimer,
  startTimer,
  stopTimer,
  deleteEntry,
  ensureSession,
  addParticipant,
  createManualSession,
  stopSession,
  editEntryRow,
} from "@/lib/time-entries";
import {
  type TimeSession,
  addableMembers,
  combine,
  derivedDurationLabel,
  entryEffort,
  formatClock,
  formatDuration,
  groupSessions,
  joinPlus,
  participantStart,
  personTotals,
  searchMembers,
  sessionsOfDay,
  timeActivityText,
  planManualSession,
  sessionElapsedSeconds,
  taskTotals,
  toDateInput,
  toTimeInput,
} from "@/lib/time-sessions";

export type TimeTrackingMember = {
  id?: string;
  name: string;
  initials: string;
  color: string;
  photo?: string;
};

const todayInput = () => toDateInput(new Date().toISOString());
const nowInput = () => toTimeInput(new Date().toISOString());

/** Relógio local: só ESTE componente re-renderiza a cada segundo (não a tarefa nem o painel). */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const iv = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(iv);
  }, [active]);
  return now;
}
function LiveText({ compute, active }: { compute: (nowMs: number) => string; active: boolean }) {
  const now = useNow(active);
  return <>{compute(now)}</>;
}

function Avatar({ member, size = 20 }: { member?: TimeTrackingMember; size?: number }) {
  return (
    <span
      aria-hidden
      style={{ width: size, height: size }}
      className={`flex shrink-0 items-center justify-center rounded-full text-[10px] font-medium ${member?.color ?? "bg-muted text-foreground"}`}
    >
      {member?.initials ?? "?"}
    </span>
  );
}

function dayLabel(iso: string): string {
  const d = toDateInput(iso);
  const today = todayInput();
  const yesterday = toDateInput(new Date(Date.now() - 86_400_000).toISOString());
  if (d === today) return "Hoje";
  if (d === yesterday) return "Ontem";
  return d.split("-").reverse().slice(0, 2).join("/");
}

/* ------------------------------------------------------------------ */
/* Linha de registro: UMA sessão, vários participantes                 */
/* ------------------------------------------------------------------ */

function AvatarStack({ members }: { members: (TimeTrackingMember | undefined)[] }) {
  const shown = members.slice(0, 3);
  return (
    <span className="flex shrink-0 -space-x-1.5" aria-hidden="true">
      {shown.map((m, i) => (
        <span key={i} className="rounded-full ring-2 ring-background">
          <Avatar member={m} size={18} />
        </span>
      ))}
    </span>
  );
}

function SessionRow({
  session,
  memberFor,
  canEdit,
  showDay,
  onEdit,
  onAddParticipant,
  onDelete,
}: {
  session: TimeSession<TimeEntry>;
  memberFor: (userId: string | null) => TimeTrackingMember | undefined;
  canEdit: boolean;
  showDay?: boolean;
  onEdit: () => void;
  onAddParticipant: () => void;
  onDelete: () => void;
}) {
  const people = session.entries.map((e) => memberFor(e.userId));
  const names = joinPlus(people.map((m) => m?.name ?? "Alguém"));
  const interval = session.endedAt
    ? `${toTimeInput(session.startedAt)} → ${toTimeInput(session.endedAt)}`
    : `${toTimeInput(session.startedAt)} → agora`;
  return (
    <div className="group flex items-center gap-2 px-1 py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm tabular-nums text-foreground">
          {showDay && <span className="text-text-secondary">{dayLabel(session.startedAt)} · </span>}
          {interval} ·{" "}
          <LiveText
            active={session.running}
            compute={(n) => formatDuration(sessionElapsedSeconds(session, n))}
          />
        </p>
        <p className="mt-0.5 flex items-center gap-1.5 text-xs text-text-secondary">
          <AvatarStack members={people} />
          <span className="truncate">{names}</span>
        </p>
      </div>
      {canEdit && !session.running && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Ações do registro"
              className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-text-secondary hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <MoreVertical className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onEdit}>
              <Pencil className="h-3.5 w-3.5" /> Editar
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onAddParticipant}>
              <UserPlus className="h-3.5 w-3.5" /> Adicionar participante
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={onDelete}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" /> Excluir
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Seletor de participantes (busca + seleção múltipla)                 */
/* ------------------------------------------------------------------ */

function ParticipantPicker({
  members,
  taken,
  selected,
  onToggle,
}: {
  members: TimeTrackingMember[];
  /** Quem já participa (aparece marcado e travado). */
  taken: Set<string>;
  selected: Set<string>;
  onToggle: (id: string, on: boolean) => void;
}) {
  const [query, setQuery] = useState("");
  const list = searchMembers(
    members.filter((m) => !!m.id),
    query,
  );
  return (
    <div className="space-y-2">
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-secondary"
          aria-hidden="true"
        />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar pessoa"
          aria-label="Buscar pessoa"
          className="h-9 w-full rounded-md border border-input bg-background pl-8 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand"
        />
      </div>
      <ul className="max-h-56 overflow-y-auto" aria-label="Pessoas do time">
        {list.length === 0 && (
          <li className="px-1 py-2 text-xs text-text-secondary">Ninguém encontrado.</li>
        )}
        {list.map((m) => {
          const already = taken.has(m.id!);
          return (
            <li key={m.id}>
              <label
                className={`flex items-center gap-2.5 rounded-md px-1.5 py-1.5 text-sm ${
                  already ? "opacity-70" : "cursor-pointer hover:bg-muted"
                }`}
              >
                <Checkbox
                  checked={already || selected.has(m.id!)}
                  disabled={already}
                  onCheckedChange={(c) => onToggle(m.id!, c === true)}
                  aria-label={already ? `${m.name} já participa` : `Adicionar ${m.name}`}
                />
                <Avatar member={m} size={24} />
                <span className="min-w-0 flex-1 truncate">{m.name}</span>
                {already && <span className="text-[11px] text-text-secondary">participando</span>}
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Adiciona pessoas a uma sessão JÁ ENCERRADA: cada uma recebe o intervalo inteiro (nada se divide). */
function AddParticipantDialog({
  session,
  members,
  onOpenChange,
  onDone,
}: {
  session: TimeSession<TimeEntry> | null;
  members: TimeTrackingMember[];
  onOpenChange: (o: boolean) => void;
  onDone: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (session) setSelected(new Set());
  }, [session]);
  const taken = new Set(session?.entries.map((e) => e.userId ?? "") ?? []);

  const confirm = async () => {
    if (!session || !session.endedAt || selected.size === 0 || saving) return;
    setSaving(true);
    try {
      let sessionId = session.sessionId;
      if (!sessionId) {
        const ensured = await ensureSession(session.entries[0]);
        if (ensured.error || !ensured.sessionId)
          return void toast.error(ensured.error ?? "Não foi possível compartilhar o registro.");
        sessionId = ensured.sessionId;
      }
      let added = 0;
      for (const userId of selected) {
        const { error } = await addParticipant({
          sessionId,
          userId,
          startedAt: session.startedAt,
          endedAt: session.endedAt,
        });
        if (error) toast.error(error);
        else added += 1;
      }
      if (added > 0)
        toast.success(added === 1 ? "Participante adicionado." : "Participantes adicionados.");
      onOpenChange(false);
      onDone();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!session} onOpenChange={onOpenChange}>
      <DialogContent mobileFullScreen className="max-w-sm gap-4">
        <DialogHeader>
          <DialogTitle className="text-base">Adicionar participante</DialogTitle>
          <DialogDescription>
            {session
              ? `${toTimeInput(session.startedAt)} → ${session.endedAt ? toTimeInput(session.endedAt) : ""} · cada pessoa recebe o tempo inteiro, sem dividir.`
              : ""}
          </DialogDescription>
        </DialogHeader>
        <ParticipantPicker
          members={members}
          taken={taken}
          selected={selected}
          onToggle={(id, on) =>
            setSelected((prev) => {
              const next = new Set(prev);
              if (on) next.add(id);
              else next.delete(id);
              return next;
            })
          }
        />
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="cursor-pointer rounded-md px-3 py-1.5 text-sm text-text-secondary hover:bg-muted"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void confirm()}
            disabled={selected.size === 0 || saving}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Adicionar{selected.size > 0 ? ` (${selected.size})` : ""}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Registro manual / edição de sessão (diálogo compacto)               */
/* ------------------------------------------------------------------ */

type ParticipantFormRow = { userId: string; start: string; end: string };

function ManualSessionDialog({
  open,
  onOpenChange,
  taskId,
  taskOrigin,
  members,
  session,
  meId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  taskId: string;
  taskOrigin: TaskOrigin;
  members: TimeTrackingMember[];
  /** Sessão sendo editada; ausente = novo registro. */
  session?: TimeSession<TimeEntry>;
  meId: string;
  onSaved: (summary?: { seconds: number; userIds: string[] }) => void;
}) {
  const memberFor = (id: string | null) => members.find((m) => m.id === id);
  const [date, setDate] = useState(todayInput());
  const [start, setStart] = useState(nowInput());
  const [end, setEnd] = useState("");
  const [note, setNote] = useState("");
  const [rows, setRows] = useState<ParticipantFormRow[]>([{ userId: meId, start: "", end: "" }]);
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [touched, setTouched] = useState(false);

  // Abre sempre com os valores iniciais certos (novo) ou os da sessão (edição).
  useEffect(() => {
    if (!open) return;
    setTouched(false);
    setSaving(false);
    setPicking(false);
    if (session && session.endedAt) {
      const s0 = toTimeInput(session.startedAt);
      const e0 = toTimeInput(session.endedAt);
      setDate(toDateInput(session.startedAt));
      setStart(s0);
      setEnd(e0);
      setNote(session.note ?? "");
      setRows(
        session.entries.map((e) => {
          const es = toTimeInput(e.startedAt);
          const ee = e.endedAt ? toTimeInput(e.endedAt) : e0;
          return { userId: e.userId ?? "", start: es === s0 ? "" : es, end: ee === e0 ? "" : ee };
        }),
      );
    } else {
      setDate(todayInput());
      setStart(nowInput());
      setEnd("");
      setNote("");
      setRows([{ userId: meId, start: "", end: "" }]);
    }
  }, [open, session, meId]);

  const plan = planManualSession({
    date,
    start,
    end,
    participants: rows.map((r) => ({ userId: r.userId, start: r.start, end: r.end })),
  });
  const addable = addableMembers(
    members,
    rows.map((r) => r.userId),
  );
  const perUser = new Map(plan.ok ? plan.rows.map((r) => [r.userId, r.seconds]) : []);
  const showError = touched && !plan.ok;

  const save = async () => {
    setTouched(true);
    if (!plan.ok || saving) return;
    setSaving(true);
    try {
      if (!session) {
        const { error } = await createManualSession({
          taskId,
          taskOrigin,
          note,
          rows: plan.rows.map((r) => ({
            userId: r.userId,
            startedAt: r.startedAt,
            endedAt: r.endedAt,
          })),
        });
        if (error) return void toast.error(error);
        toast.success("Tempo registrado.");
      } else {
        const byUser = new Map(session.entries.map((e) => [e.userId, e]));
        const keep = new Set(plan.rows.map((r) => r.userId));
        let sessionId = session.sessionId;
        for (const r of plan.rows) {
          const existing = byUser.get(r.userId);
          if (existing) {
            const { error } = await editEntryRow(
              existing.id,
              { startedAt: r.startedAt, endedAt: r.endedAt, note },
              { foreign: existing.userId !== meId },
            );
            if (error) return void toast.error(error);
          } else {
            if (!sessionId) {
              const mine = session.entries.find((e) => e.userId === meId) ?? session.entries[0];
              const ensured = await ensureSession(mine);
              if (ensured.error || !ensured.sessionId)
                return void toast.error(
                  ensured.error ?? "Não foi possível compartilhar o registro.",
                );
              sessionId = ensured.sessionId;
            }
            const { error } = await addParticipant({
              sessionId,
              userId: r.userId,
              startedAt: r.startedAt,
              endedAt: r.endedAt,
            });
            if (error) return void toast.error(error);
          }
        }
        for (const e of session.entries) {
          if (e.userId && !keep.has(e.userId)) {
            const { error } = await deleteEntry(e.id);
            if (error) return void toast.error(error);
          }
        }
        toast.success("Registro atualizado.");
      }
      onOpenChange(false);
      onSaved(
        plan.ok
          ? { seconds: plan.durationSeconds, userIds: plan.rows.map((r) => r.userId) }
          : undefined,
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent mobileFullScreen className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">
            {session ? "Editar registro" : "Registrar tempo"}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Data, início e fim; a duração é calculada. Participantes podem ter intervalos próprios.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">Data</span>
              <DateField
                value={date}
                onChange={(d) => d && setDate(d)}
                ariaLabel="Data do registro"
                className="h-9"
              />
            </div>
            <div className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">Início</span>
              <TimeField value={start} onChange={setStart} ariaLabel="Início" className="h-9" />
            </div>
            <div className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">Fim</span>
              <TimeField
                value={end}
                onChange={setEnd}
                ariaLabel="Fim"
                placeholder="Em aberto"
                className="h-9"
              />
            </div>
          </div>

          <div className="flex items-baseline justify-between">
            <span className="text-xs font-medium text-muted-foreground">Duração</span>
            <span className="text-sm font-semibold tabular-nums" aria-live="polite">
              {derivedDurationLabel(date, start, end)}
            </span>
          </div>
          {showError && !plan.ok && (
            <p role="alert" className="-mt-2 text-xs text-destructive">
              {plan.error}
            </p>
          )}

          <div className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">Participantes</span>
            <ul className="space-y-1.5">
              {rows.map((r, i) => {
                const m = memberFor(r.userId);
                const own = r.start !== "" || r.end !== "";
                return (
                  <li key={r.userId} className="rounded-md border border-border/60 px-2.5 py-1.5">
                    <div className="flex items-center gap-2">
                      <Avatar member={m} />
                      <span className="min-w-0 flex-1 truncate text-sm">
                        {m?.name ?? "Alguém"}
                        {r.userId === meId && (
                          <span className="text-xs text-muted-foreground"> · você</span>
                        )}
                      </span>
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        {perUser.has(r.userId) ? formatDuration(perUser.get(r.userId)!) : ""}
                      </span>
                      {rows.length > 1 && (
                        <button
                          type="button"
                          aria-label={`Remover ${m?.name ?? "participante"}`}
                          onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
                          className="cursor-pointer text-muted-foreground hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    {rows.length > 1 && (
                      <div className="mt-1.5 flex items-center gap-2 pl-7">
                        <TimeField
                          value={r.start}
                          onChange={(v) =>
                            setRows((rs) => rs.map((x, j) => (j === i ? { ...x, start: v } : x)))
                          }
                          ariaLabel={`Início de ${m?.name ?? "participante"}`}
                          placeholder={start || "Início"}
                          className="h-8 w-24"
                        />
                        <span className="text-xs text-muted-foreground">→</span>
                        <TimeField
                          value={r.end}
                          onChange={(v) =>
                            setRows((rs) => rs.map((x, j) => (j === i ? { ...x, end: v } : x)))
                          }
                          ariaLabel={`Fim de ${m?.name ?? "participante"}`}
                          placeholder={end || "Fim"}
                          className="h-8 w-24"
                        />
                        {!own && (
                          <span className="text-[11px] text-muted-foreground">mesmo da sessão</span>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
            {picking ? (
              <ul
                className="max-h-40 overflow-y-auto rounded-md border border-border"
                aria-label="Escolher participante"
              >
                {addable.length === 0 && (
                  <li className="px-2.5 py-2 text-xs text-muted-foreground">
                    Ninguém mais para adicionar.
                  </li>
                )}
                {addable.map((m) => (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setRows((rs) => [...rs, { userId: m.id!, start: "", end: "" }]);
                        setPicking(false);
                      }}
                      className="flex w-full cursor-pointer items-center gap-2 px-2.5 py-1.5 text-left text-sm hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                    >
                      <Avatar member={m} />
                      {m.name}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <button
                type="button"
                onClick={() => setPicking(true)}
                disabled={addable.length === 0}
                className="inline-flex cursor-pointer items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Plus className="h-3 w-3" /> Adicionar participante
              </button>
            )}
          </div>

          <div className="space-y-1">
            <label htmlFor="time-note" className="text-xs font-medium text-muted-foreground">
              Observação
            </label>
            <textarea
              id="time-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              maxLength={500}
              placeholder="O que foi feito..."
              className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="cursor-pointer rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving || (touched && !plan.ok) || !end}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {session ? "Salvar" : "Registrar"}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Controle de tempo (botão no header + popover / sheet no mobile)     */
/* ------------------------------------------------------------------ */

type Props = {
  taskId: string;
  taskOrigin: TaskOrigin;
  members: TimeTrackingMember[];
  /** Registra uma linha compacta na atividade da tarefa ("registrou 32min com João"). */
  onActivity?: (text: string) => void;
};

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <p className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
    {children}
  </p>
);

export function TimeTrackingPanel({ taskId, taskOrigin, members, onActivity }: Props) {
  const access = useMyAccess();
  const canManageOthers = hasPermission(access, "time");
  const isMobile = useIsMobile();
  const me = getMe();
  const running = useRunningTimer();
  const { entries, loading, refetch } = useTaskTimeEntries(taskId, taskOrigin);
  const { confirm, confirmDialog } = useConfirm();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"main" | "add">("main");
  const [manualOpen, setManualOpen] = useState(false);
  const [editing, setEditing] = useState<TimeSession<TimeEntry> | undefined>(undefined);
  const [addingTo, setAddingTo] = useState<TimeSession<TimeEntry> | null>(null);
  const [conflict, setConflict] = useState<TimeEntry | null>(null);
  const [allOpen, setAllOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const [confirmRetro, setConfirmRetro] = useState(false);

  const runningHere =
    running.entry && running.entry.taskId === taskId && running.entry.taskOrigin === taskOrigin
      ? running.entry
      : null;

  const refreshAll = () => {
    refetch();
    running.refetch();
  };

  const sessions = useMemo(() => groupSessions(entries), [entries]);
  const activeSession = useMemo(
    () =>
      runningHere
        ? (sessions.find((s) => s.entries.some((e) => e.id === runningHere.id)) ?? null)
        : null,
    [sessions, runningHere],
  );
  const totals = taskTotals(entries);
  const memberFor = (userId: string | null) =>
    userId ? members.find((m) => m.id === userId) : undefined;
  const nameOf = (userId: string | null) => memberFor(userId)?.name ?? "Alguém";
  const canEditSession = (s: TimeSession<TimeEntry>) =>
    canManageOthers || s.entries.some((e) => e.userId === me.id);
  const hasRunning = entries.some((e) => !e.endedAt);
  const today = sessionsOfDay(sessions, todayInput());
  const todayShown = today.slice(0, 3);
  const perPerson = personTotals(totals.byUser);
  const participantsRunning = activeSession?.entries ?? [];

  const log = (seconds: number, userIds: (string | null)[]) => {
    const others = userIds.filter((u) => u && u !== me.id).map((u) => nameOf(u));
    onActivity?.(timeActivityText(seconds, others));
  };

  const handleStart = async () => {
    if (busy) return;
    if (running.entry && !runningHere) return void setConflict(running.entry);
    setBusy(true);
    const { conflict: conflictEntry, error } = await startTimer(taskId, taskOrigin);
    setBusy(false);
    if (error) return void toast.error("Não foi possível iniciar o cronômetro. Tente novamente.");
    if (conflictEntry) return void setConflict(conflictEntry);
    refreshAll();
  };

  const handleStop = async () => {
    if (!runningHere || busy) return;
    const seconds = activeSession ? sessionElapsedSeconds(activeSession) : 0;
    const ids = participantsRunning.map((e) => e.userId);
    setBusy(true);
    const { error } = await stopSession(runningHere);
    setBusy(false);
    if (error) toast.error(error);
    else {
      toast.success("Tempo registrado.");
      log(seconds, ids);
    }
    refreshAll();
  };

  const stopOne = async (entry: TimeEntry) => {
    if (busy) return;
    setBusy(true);
    const { error } = await stopTimer(entry.id, entry.startedAt);
    setBusy(false);
    if (error) toast.error(error);
    refreshAll();
  };

  const removeParticipant = async (entry: TimeEntry) => {
    if (busy) return;
    setBusy(true);
    const { error } = await deleteEntry(entry.id);
    setBusy(false);
    if (error) toast.error(error);
    refreshAll();
  };

  const resolveConflict = async () => {
    if (!conflict) return;
    const { error } = await stopTimer(conflict.id, conflict.startedAt);
    if (error) return void toast.error(error);
    setConflict(null);
    setBusy(true);
    const { error: startError } = await startTimer(taskId, taskOrigin);
    setBusy(false);
    if (startError) toast.error("Não foi possível iniciar o cronômetro. Tente novamente.");
    refreshAll();
  };

  const addPicked = async (mode: "agora" | "desde_o_inicio") => {
    if (!runningHere || !activeSession || picked.size === 0 || busy) return;
    setBusy(true);
    try {
      const ensured = await ensureSession(runningHere);
      if (ensured.error || !ensured.sessionId)
        return void toast.error(ensured.error ?? "Não foi possível compartilhar o tempo.");
      const startedAt = participantStart(
        mode,
        activeSession.startedAt,
        new Date().toISOString(),
        true,
      );
      let added = 0;
      for (const userId of picked) {
        const { error } = await addParticipant({ sessionId: ensured.sessionId, userId, startedAt });
        if (error) toast.error(`${nameOf(userId)}: ${error}`);
        else added += 1;
      }
      if (added > 0)
        toast.success(added === 1 ? "Participante adicionado." : "Participantes adicionados.");
      setPicked(new Set());
      setView("main");
    } finally {
      setBusy(false);
      setConfirmRetro(false);
      refreshAll();
    }
  };

  const requestDelete = async (s: TimeSession<TimeEntry>) => {
    const shared = s.entries.length > 1;
    const ok = await confirm(
      shared
        ? "Este registro será removido para todos os participantes."
        : "Este registro de tempo será removido.",
      { title: "Excluir registro?", confirmLabel: "Excluir", destructive: true },
    );
    if (!ok) return;
    setBusy(true);
    for (const e of s.entries) {
      const { error } = await deleteEntry(e.id);
      if (error) {
        toast.error(error);
        break;
      }
    }
    setBusy(false);
    refreshAll();
  };

  const openManual = (s?: TimeSession<TimeEntry>) => {
    setEditing(s);
    setOpen(false);
    setAllOpen(false);
    setManualOpen(true);
  };

  const closePanel = (o: boolean) => {
    setOpen(o);
    if (!o) {
      setView("main");
      setPicked(new Set());
    }
  };

  const triggerContent = runningHere ? (
    <>
      <span aria-hidden className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-emerald-500" />
      <LiveText
        active
        compute={(n) => formatClock((n - Date.parse(runningHere.startedAt)) / 1000)}
      />
    </>
  ) : totals.effortSeconds > 0 ? (
    formatDuration(totals.effortSeconds)
  ) : (
    <>
      <Play className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      Iniciar
    </>
  );

  const triggerButton = (onClick?: () => void) => (
    <button
      type="button"
      onClick={onClick}
      aria-label={runningHere ? "Cronômetro ativo — abrir controle de tempo" : "Controle de tempo"}
      className="inline-flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium tabular-nums text-foreground/80 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
    >
      {triggerContent}
    </button>
  );

  /* ---------- conteúdo (o mesmo no popover e no sheet) ---------- */
  const body =
    view === "add" && runningHere && activeSession ? (
      <div className="space-y-3 p-4">
        <button
          type="button"
          onClick={() => setView("main")}
          className="inline-flex cursor-pointer items-center gap-1 text-xs text-text-secondary hover:text-foreground"
        >
          <ChevronLeft className="h-3 w-3" /> Voltar
        </button>
        <SectionLabel>Adicionar participante</SectionLabel>
        <ParticipantPicker
          members={members}
          taken={new Set(participantsRunning.map((e) => e.userId ?? ""))}
          selected={picked}
          onToggle={(id, on) =>
            setPicked((prev) => {
              const next = new Set(prev);
              if (on) next.add(id);
              else next.delete(id);
              return next;
            })
          }
        />
        <div className="space-y-1.5">
          <button
            type="button"
            disabled={picked.size === 0 || busy}
            onClick={() => void addPicked("agora")}
            className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Começar agora
          </button>
          <button
            type="button"
            disabled={picked.size === 0 || busy}
            onClick={() => setConfirmRetro(true)}
            className="w-full cursor-pointer text-center text-xs font-medium text-text-secondary hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            Aplicar desde o início ({toTimeInput(activeSession.startedAt)})
          </button>
        </div>
      </div>
    ) : (
      <div className="space-y-4 p-4">
        {/* 1) Estou contando tempo agora? */}
        {runningHere ? (
          <div className="space-y-3">
            <div>
              <SectionLabel>Tempo</SectionLabel>
              <p
                className="mt-1 text-4xl font-semibold tabular-nums leading-none text-foreground"
                aria-live="off"
              >
                <LiveText
                  active
                  compute={(n) => formatClock((n - Date.parse(runningHere.startedAt)) / 1000)}
                />
              </p>
              <p className="mt-1.5 flex items-center gap-1.5 text-xs text-text-secondary">
                <span
                  className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500"
                  aria-hidden="true"
                />
                Em andamento
              </p>
            </div>
            <button
              type="button"
              onClick={() => void handleStop()}
              disabled={busy}
              className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-md bg-primary px-3 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Square className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
              )}
              Parar
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <SectionLabel>Tempo</SectionLabel>
              <p className="mt-1 text-4xl font-semibold tabular-nums leading-none text-foreground">
                <LiveText
                  active={hasRunning}
                  compute={(n) => formatDuration(taskTotals(entries, n).effortSeconds)}
                />
              </p>
              <p className="mt-1.5 text-xs text-text-secondary">
                {totals.hasShared ? "Tempo total registrado (horas-pessoa)" : "Tempo registrado"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void handleStart()}
              disabled={busy}
              className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-md bg-primary px-3 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Play className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              {busy ? "Iniciando..." : "Iniciar cronômetro"}
            </button>
          </div>
        )}

        {/* 2) Para quem está sendo registrado? (só com sessão ativa) */}
        {runningHere && (
          <div className="space-y-1.5 border-t border-border/60 pt-3">
            <SectionLabel>Participantes</SectionLabel>
            <ul aria-label="Participantes da sessão">
              {participantsRunning.map((e) => (
                <li key={e.id} className="flex items-center gap-2 py-1 text-sm">
                  <Avatar member={memberFor(e.userId)} size={22} />
                  <span className="min-w-0 flex-1 truncate text-foreground">
                    {e.userId === me.id ? `${nameOf(e.userId)} (você)` : nameOf(e.userId)}
                    {participantsRunning.length > 1 &&
                      toTimeInput(e.startedAt) !== toTimeInput(activeSession!.startedAt) && (
                        <span className="text-xs text-text-secondary">
                          {" "}
                          · desde {toTimeInput(e.startedAt)}
                        </span>
                      )}
                    {e.endedAt && <span className="text-xs text-text-secondary"> · saiu</span>}
                  </span>
                  {!e.endedAt && participantsRunning.length > 1 && (
                    <button
                      type="button"
                      aria-label={`Parar o tempo de ${nameOf(e.userId)}`}
                      onClick={() => void stopOne(e)}
                      className="cursor-pointer rounded p-1 text-text-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                    >
                      <Square className="h-3 w-3" />
                    </button>
                  )}
                  {e.id !== runningHere.id && (
                    <button
                      type="button"
                      aria-label={`Remover ${nameOf(e.userId)} da sessão`}
                      onClick={() => void removeParticipant(e)}
                      className="cursor-pointer rounded p-1 text-text-secondary hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => setView("add")}
              className="inline-flex cursor-pointer items-center gap-1 text-xs font-medium text-text-secondary hover:text-foreground"
            >
              <Plus className="h-3 w-3" /> Adicionar participante
            </button>
          </div>
        )}

        {/* Quanto já foi registrado, por pessoa (parado e com mais de uma pessoa) */}
        {!runningHere && perPerson.length > 1 && (
          <div className="space-y-1.5 border-t border-border/60 pt-3">
            <SectionLabel>Por pessoa</SectionLabel>
            <ul>
              {perPerson.map((p) => (
                <li key={p.userId} className="flex items-center gap-2 py-0.5 text-sm">
                  <Avatar member={memberFor(p.userId)} size={20} />
                  <span className="min-w-0 flex-1 truncate">{nameOf(p.userId)}</span>
                  <span className="tabular-nums text-text-secondary">
                    {formatDuration(p.seconds)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* 3) Registros de hoje */}
        <div className="border-t border-border/60 pt-3">
          <SectionLabel>Registros de hoje</SectionLabel>
          {loading ? null : todayShown.length === 0 ? (
            <p className="mt-1.5 text-xs text-text-secondary">Nenhum registro hoje.</p>
          ) : (
            <div className="-mx-1 mt-1 divide-y divide-border/40">
              {todayShown.map((s) => (
                <SessionRow
                  key={s.key}
                  session={s}
                  memberFor={memberFor}
                  canEdit={canEditSession(s)}
                  onEdit={() => openManual(s)}
                  onAddParticipant={() => setAddingTo(s)}
                  onDelete={() => void requestDelete(s)}
                />
              ))}
            </div>
          )}
          {sessions.length > todayShown.length && (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setAllOpen(true);
              }}
              className="mt-1 cursor-pointer text-xs font-medium text-text-secondary hover:text-foreground"
            >
              Ver todos ({sessions.length})
            </button>
          )}
        </div>

        {/* 4) Registro manual (ação secundária) */}
        <button
          type="button"
          onClick={() => openManual()}
          className="inline-flex cursor-pointer items-center gap-1 text-xs font-medium text-text-secondary hover:text-foreground"
        >
          <Plus className="h-3 w-3" /> Registrar tempo manualmente
        </button>
      </div>
    );

  return (
    <>
      {isMobile ? (
        <>
          {triggerButton(() => setOpen(true))}
          <Sheet open={open} onOpenChange={closePanel}>
            <SheetContent side="bottom" className="max-h-[88dvh] overflow-y-auto rounded-t-2xl p-0">
              <SheetTitle className="sr-only">Controle de tempo</SheetTitle>
              <SheetDescription className="sr-only">
                Cronômetro, participantes e registros de tempo desta tarefa.
              </SheetDescription>
              {body}
            </SheetContent>
          </Sheet>
        </>
      ) : (
        <Popover open={open} onOpenChange={closePanel}>
          <PopoverTrigger asChild>{triggerButton()}</PopoverTrigger>
          <PopoverContent align="start" className="w-80 max-w-[calc(100vw-2rem)] p-0">
            {body}
          </PopoverContent>
        </Popover>
      )}

      <ManualSessionDialog
        open={manualOpen}
        onOpenChange={(o) => {
          setManualOpen(o);
          if (!o) setEditing(undefined);
        }}
        taskId={taskId}
        taskOrigin={taskOrigin}
        members={members}
        session={editing}
        meId={me.id}
        onSaved={(summary) => {
          if (summary && !editing) log(summary.seconds, summary.userIds);
          refreshAll();
        }}
      />

      <AddParticipantDialog
        session={addingTo}
        members={members}
        onOpenChange={(o) => !o && setAddingTo(null)}
        onDone={refreshAll}
      />

      <Dialog open={allOpen} onOpenChange={setAllOpen}>
        <DialogContent mobileFullScreen className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">Registros de tempo</DialogTitle>
            <DialogDescription className="sr-only">
              Todas as sessões desta tarefa.
            </DialogDescription>
          </DialogHeader>
          <div className="-mx-1 max-h-[60vh] divide-y divide-border/40 overflow-y-auto">
            {sessions.map((s) => (
              <SessionRow
                key={s.key}
                session={s}
                showDay
                memberFor={memberFor}
                canEdit={canEditSession(s)}
                onEdit={() => openManual(s)}
                onAddParticipant={() => {
                  setAllOpen(false);
                  setAddingTo(s);
                }}
                onDelete={() => void requestDelete(s)}
              />
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!conflict} onOpenChange={(o) => !o && setConflict(null)}>
        <AlertDialogContent>
          <div className="space-y-3">
            <p className="text-sm">
              Você já tem um cronômetro rodando em outra tarefa desde{" "}
              {conflict ? toTimeInput(conflict.startedAt) : ""}.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConflict(null)}
                className="cursor-pointer rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void resolveConflict()}
                className="cursor-pointer rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                Parar o outro e iniciar este
              </button>
            </div>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmRetro} onOpenChange={(o) => !o && setConfirmRetro(false)}>
        <AlertDialogContent>
          <div className="space-y-3">
            <p className="text-sm">
              Atribuir às pessoas selecionadas o tempo desde{" "}
              {activeSession ? toTimeInput(activeSession.startedAt) : ""}? O período anterior à
              entrada delas passa a contar no tempo de cada uma.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmRetro(false)}
                className="cursor-pointer rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void addPicked("desde_o_inicio")}
                className="cursor-pointer rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                Aplicar desde o início
              </button>
            </div>
          </div>
        </AlertDialogContent>
      </AlertDialog>
      {confirmDialog}
    </>
  );
}
