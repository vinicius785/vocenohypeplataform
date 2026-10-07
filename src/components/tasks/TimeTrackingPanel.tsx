"use client";

import { useEffect, useMemo, useState } from "react";
import { Play, Square, Pencil, Trash2, Loader2, Plus, X, ChevronLeft } from "lucide-react";
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
  participantStart,
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
/* Linha de histórico: UMA sessão, vários participantes                */
/* ------------------------------------------------------------------ */

function SessionRow({
  session,
  memberFor,
  canEdit,
  onEdit,
  onDelete,
}: {
  session: TimeSession<TimeEntry>;
  memberFor: (userId: string | null) => TimeTrackingMember | undefined;
  canEdit: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const shared = session.entries.length > 1;
  const interval = session.endedAt
    ? `${toTimeInput(session.startedAt)} → ${toTimeInput(session.endedAt)}`
    : `${toTimeInput(session.startedAt)} → em andamento`;
  return (
    <div className="group px-3 py-1.5 text-xs hover:bg-muted/40">
      <div className="flex items-baseline gap-2">
        <span className="shrink-0 text-[11px] text-muted-foreground">
          {dayLabel(session.startedAt)}
        </span>
        <span className="min-w-0 flex-1 truncate tabular-nums text-foreground">
          {interval} ·{" "}
          <LiveText
            active={session.running}
            compute={(n) => formatDuration(sessionElapsedSeconds(session, n))}
          />
        </span>
        {canEdit && !session.running && (
          <span className="flex shrink-0 items-center gap-2 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 max-sm:opacity-100">
            <button
              type="button"
              aria-label="Editar registro de tempo"
              onClick={onEdit}
              className="cursor-pointer text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <Pencil className="h-3 w-3" />
            </button>
            <button
              type="button"
              aria-label="Excluir registro de tempo"
              onClick={onDelete}
              className="cursor-pointer text-muted-foreground hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </span>
        )}
      </div>
      {shared ? (
        <ul className="mt-0.5 space-y-0.5 pl-0.5">
          {session.entries.map((e) => (
            <li key={e.id} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Avatar member={memberFor(e.userId)} size={14} />
              <span className="min-w-0 flex-1 truncate">
                {memberFor(e.userId)?.name ?? "Alguém"}
              </span>
              <span className="tabular-nums">
                <LiveText active={!e.endedAt} compute={(n) => formatDuration(entryEffort(e, n))} />
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Avatar member={memberFor(session.entries[0].userId)} size={14} />
          <span className="truncate">{memberFor(session.entries[0].userId)?.name ?? "Alguém"}</span>
        </p>
      )}
    </div>
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
  onSaved: () => void;
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
      onSaved();
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
/* Painel (botão + popover)                                            */
/* ------------------------------------------------------------------ */

type Props = {
  taskId: string;
  taskOrigin: TaskOrigin;
  members: TimeTrackingMember[];
};

export function TimeTrackingPanel({ taskId, taskOrigin, members }: Props) {
  const access = useMyAccess();
  const canManageOthers = hasPermission(access, "time");
  const me = getMe();
  const running = useRunningTimer();
  const { entries, loading, refetch } = useTaskTimeEntries(taskId, taskOrigin);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"main" | "add">("main");
  const [manualOpen, setManualOpen] = useState(false);
  const [editing, setEditing] = useState<TimeSession<TimeEntry> | undefined>(undefined);
  const [conflict, setConflict] = useState<TimeEntry | null>(null);
  const [deleting, setDeleting] = useState<TimeSession<TimeEntry> | null>(null);
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
  const canEditSession = (s: TimeSession<TimeEntry>) =>
    canManageOthers || s.entries.some((e) => e.userId === me.id);

  const hasRunning = entries.some((e) => !e.endedAt);

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
    setBusy(true);
    const { error } = await stopSession(runningHere);
    setBusy(false);
    if (error) toast.error(error);
    else toast.success("Tempo registrado.");
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
      const nowIso = new Date().toISOString();
      const startedAt = participantStart(mode, activeSession.startedAt, nowIso, true);
      let added = 0;
      for (const userId of picked) {
        const { error } = await addParticipant({
          sessionId: ensured.sessionId,
          userId,
          startedAt,
        });
        if (error) toast.error(`${memberFor(userId)?.name ?? "Participante"}: ${error}`);
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

  const deleteSession = async (s: TimeSession<TimeEntry>) => {
    setBusy(true);
    for (const e of s.entries) {
      const { error } = await deleteEntry(e.id);
      if (error) {
        toast.error(error);
        break;
      }
    }
    setBusy(false);
    setDeleting(null);
    refreshAll();
  };

  const openManual = (s?: TimeSession<TimeEntry>) => {
    setEditing(s);
    setOpen(false);
    setAllOpen(false);
    setManualOpen(true);
  };

  const recent = sessions.slice(0, 3);
  const participantsRunning = activeSession?.entries ?? [];
  const addable = addableMembers(members, activeSession?.entries.map((e) => e.userId ?? "") ?? []);

  const triggerContent = runningHere ? (
    <>
      <span aria-hidden className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-sky-500" />
      <LiveText
        active
        compute={(n) => formatClock((n - Date.parse(runningHere.startedAt)) / 1000)}
      />
    </>
  ) : totals.effortSeconds > 0 ? (
    formatDuration(totals.effortSeconds)
  ) : (
    <>
      <Play className="h-3.5 w-3.5 shrink-0" />
      Iniciar
    </>
  );

  return (
    <>
      <Popover
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) {
            setView("main");
            setPicked(new Set());
          }
        }}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={
              runningHere ? "Cronômetro ativo — abrir controle de tempo" : "Tempo da tarefa"
            }
            className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium tabular-nums transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
              runningHere ? "text-sky-700 dark:text-sky-400" : "text-foreground/80"
            }`}
          >
            {triggerContent}
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80 max-w-[calc(100vw-2rem)] p-0">
          {view === "add" && runningHere && activeSession ? (
            <div className="p-3">
              <button
                type="button"
                onClick={() => setView("main")}
                className="mb-2 inline-flex cursor-pointer items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <ChevronLeft className="h-3 w-3" /> Voltar
              </button>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Trabalhando nesta tarefa
              </p>
              <ul className="mt-2 max-h-56 space-y-0.5 overflow-y-auto">
                {participantsRunning.map((e) => (
                  <li key={e.id} className="flex items-center gap-2 px-1 py-1 text-sm">
                    <Checkbox
                      checked
                      disabled
                      aria-label={`${memberFor(e.userId)?.name} já participa`}
                    />
                    <Avatar member={memberFor(e.userId)} />
                    <span className="min-w-0 flex-1 truncate">
                      {memberFor(e.userId)?.name ?? "Alguém"}
                    </span>
                  </li>
                ))}
                {addable.map((m) => (
                  <li key={m.id}>
                    <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-muted">
                      <Checkbox
                        checked={picked.has(m.id!)}
                        onCheckedChange={(c) =>
                          setPicked((prev) => {
                            const next = new Set(prev);
                            if (c === true) next.add(m.id!);
                            else next.delete(m.id!);
                            return next;
                          })
                        }
                        aria-label={`Adicionar ${m.name}`}
                      />
                      <Avatar member={m} />
                      <span className="min-w-0 flex-1 truncate">{m.name}</span>
                    </label>
                  </li>
                ))}
              </ul>
              <div className="mt-3 space-y-1.5">
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
                  className="w-full cursor-pointer text-center text-xs font-medium text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Aplicar desde o início ({toTimeInput(activeSession.startedAt)})
                </button>
              </div>
            </div>
          ) : (
            <div className="p-3">
              <div className="flex items-baseline justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Tempo registrado
                </span>
                <span className="text-sm font-semibold tabular-nums">
                  <LiveText
                    active={hasRunning}
                    compute={(n) => formatDuration(taskTotals(entries, n).effortSeconds)}
                  />
                </span>
              </div>
              {totals.hasShared && (
                <p className="mt-0.5 text-right text-[11px] text-muted-foreground">
                  horas-pessoa · {formatDuration(totals.sessionSeconds)} de sessões
                </p>
              )}

              <div className="mt-3">
                {runningHere ? (
                  <>
                    <button
                      type="button"
                      onClick={() => void handleStop()}
                      disabled={busy}
                      className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-md bg-sky-500/15 px-3 py-2 text-sm font-semibold tabular-nums text-sky-700 hover:bg-sky-500/25 disabled:opacity-60 dark:text-sky-400"
                    >
                      <Square className="h-3.5 w-3.5 fill-current" />
                      {participantsRunning.length > 1 ? "Parar sessão" : "Parar"} ·{" "}
                      <LiveText
                        active
                        compute={(n) => formatClock((n - Date.parse(runningHere.startedAt)) / 1000)}
                      />
                    </button>
                    <ul className="mt-2 space-y-0.5" aria-label="Participantes da sessão">
                      {participantsRunning.map((e) => (
                        <li key={e.id} className="flex items-center gap-2 px-0.5 py-0.5 text-xs">
                          <Avatar member={memberFor(e.userId)} />
                          <span className="min-w-0 flex-1 truncate text-foreground">
                            {memberFor(e.userId)?.name ?? "Alguém"}
                            {e.id !== runningHere.id || participantsRunning.length > 1 ? (
                              <span className="text-muted-foreground">
                                {" "}
                                · {e.endedAt ? "saiu" : `desde ${toTimeInput(e.startedAt)}`}
                              </span>
                            ) : null}
                          </span>
                          {!e.endedAt && participantsRunning.length > 1 && (
                            <button
                              type="button"
                              aria-label={`Parar o tempo de ${memberFor(e.userId)?.name ?? "participante"}`}
                              onClick={() => void stopOne(e)}
                              className="cursor-pointer text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                            >
                              <Square className="h-3 w-3" />
                            </button>
                          )}
                          {e.id !== runningHere.id && (
                            <button
                              type="button"
                              aria-label={`Remover ${memberFor(e.userId)?.name ?? "participante"} da sessão`}
                              onClick={() => void removeParticipant(e)}
                              className="cursor-pointer text-muted-foreground hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
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
                      disabled={addable.length === 0}
                      className="mt-1.5 inline-flex cursor-pointer items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Plus className="h-3 w-3" /> Adicionar participante
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => void handleStart()}
                    disabled={busy}
                    className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
                  >
                    {busy ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Play className="h-3.5 w-3.5" />
                    )}
                    {busy ? "Iniciando..." : "Iniciar cronômetro"}
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => openManual()}
                className="mt-3 w-full cursor-pointer rounded-md border-t border-border pt-2.5 text-left text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                + Registrar tempo manualmente
              </button>

              {loading ? null : recent.length === 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">Nenhum tempo registrado.</p>
              ) : (
                <div className="-mx-3 mt-3 border-t border-border pt-2">
                  <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Registros recentes
                  </p>
                  <div className="space-y-0.5">
                    {recent.map((s) => (
                      <SessionRow
                        key={s.key}
                        session={s}
                        memberFor={memberFor}
                        canEdit={canEditSession(s)}
                        onEdit={() => openManual(s)}
                        onDelete={() => setDeleting(s)}
                      />
                    ))}
                  </div>
                  {sessions.length > 3 && (
                    <button
                      type="button"
                      onClick={() => {
                        setOpen(false);
                        setAllOpen(true);
                      }}
                      className="mt-1 w-full cursor-pointer px-3 py-1.5 text-left text-xs font-medium text-muted-foreground hover:text-foreground"
                    >
                      Ver todos os registros ({sessions.length})
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </PopoverContent>
      </Popover>

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
        onSaved={refreshAll}
      />

      <Dialog open={allOpen} onOpenChange={setAllOpen}>
        <DialogContent mobileFullScreen className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">Registros de tempo</DialogTitle>
            <DialogDescription className="sr-only">
              Todas as sessões desta tarefa.
            </DialogDescription>
          </DialogHeader>
          <div className="-mx-2 max-h-[60vh] space-y-0.5 overflow-y-auto">
            {sessions.map((s) => (
              <SessionRow
                key={s.key}
                session={s}
                memberFor={memberFor}
                canEdit={canEditSession(s)}
                onEdit={() => openManual(s)}
                onDelete={() => setDeleting(s)}
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

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <div className="space-y-3">
            <p className="text-sm">
              Excluir este registro de tempo
              {deleting && deleting.entries.length > 1 ? " (todos os participantes)" : ""}?
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleting(null)}
                className="cursor-pointer rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => deleting && void deleteSession(deleting)}
                className="cursor-pointer rounded-md bg-destructive px-3 py-1.5 text-sm font-medium text-destructive-foreground hover:opacity-90 disabled:opacity-60"
              >
                Excluir
              </button>
            </div>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/** Reexporta o instante de parede usado pelos testes/outros painéis (mesmo fuso do painel). */
export { combine as combineBrasilia };
