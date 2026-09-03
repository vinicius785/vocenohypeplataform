"use client";

import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Play, Square, Pencil, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { AlertDialog, AlertDialogContent } from "@/components/ui/alert-dialog";
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
  createManualEntry,
  editOwnEntry,
  deleteEntry,
} from "@/lib/time-entries";
import { correctTimeEntry } from "@/lib/time-entries.functions";

/** Pequena duplicação intencional de `formatDuration`/`formatClock` — não
 * são importados de TaskBoard.tsx pra não criar um ciclo (TaskBoard.tsx
 * importa este painel). Funções puras de poucas linhas, mesmo espírito
 * de tolerância a duplicação já usado em `projetos.ts` pro tipo `Task`. */
function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h${m > 0 ? `${m.toString().padStart(2, "0")}` : ""}`;
  if (m > 0) return `${m}min`;
  return `${sec}s`;
}

/** Relógio do cronômetro ativo — MM:SS abaixo de 1h, HH:MM:SS acima. */
function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(sec).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function liveSeconds(entry: TimeEntry): number {
  return (Date.now() - Date.parse(entry.startedAt)) / 1000;
}

/** Registros são salvos como instante UTC (`toISOString()`, ver
 * `time-entries.ts`) — exibir/editar precisa sempre passar pelo fuso de
 * Brasília explicitamente, nunca fatiar a string ISO direto (isso mostra
 * a hora em UTC) nem usar `Date.getHours()`/`getMinutes()` (isso mostra a
 * hora no fuso do SISTEMA OPERACIONAL de quem está usando, que pode não
 * ser Brasília) — sem isso os horários batiam só por coincidência, quando
 * o computador da pessoa já estava configurado pra Brasília. */
const TIME_ZONE = "America/Sao_Paulo";

function toDateInput(iso: string): string {
  // Locale en-CA formata como YYYY-MM-DD, o mesmo formato que <input type="date"> espera.
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: TIME_ZONE });
}
function toTimeInput(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", {
    timeZone: TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
  });
}
/** Inverso de `toDateInput`/`toTimeInput`: interpreta `date`+`time` como
 * horário de parede em Brasília (não no fuso do sistema operacional) e
 * devolve o instante UTC correspondente. Funciona pra qualquer fuso IANA
 * (inclusive com horário de verão, se algum dia voltar a existir) — pega
 * o instante "como se fosse UTC", vê como esse instante seria lido em
 * Brasília, e corrige pela diferença entre os dois. */
function combine(date: string, time: string, timeZone: string = TIME_ZONE): string {
  const asUtc = new Date(`${date}T${time}:00Z`);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
    .formatToParts(asUtc)
    .reduce<Record<string, string>>((acc, p) => {
      acc[p.type] = p.value;
      return acc;
    }, {});
  const readAsIfUtc = new Date(
    `${parts.year}-${parts.month}-${parts.day}T${parts.hour === "24" ? "00" : parts.hour}:${parts.minute}:${parts.second}Z`,
  );
  const offsetMs = asUtc.getTime() - readAsIfUtc.getTime();
  return new Date(asUtc.getTime() + offsetMs).toISOString();
}
function addMinutesToTime(time: string, minutes: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = (((h * 60 + m + minutes) % (24 * 60)) + 24 * 60) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/** Aceita "30m", "1h", "1h30", "1h 30m", "2h15" — normaliza pra minutos.
 * Número puro é tratado como minutos ("90" = 1h30). */
function parseDurationToMinutes(raw: string): number | null {
  const s = raw.trim().toLowerCase();
  if (!s) return null;
  if (/^\d+$/.test(s)) return parseInt(s, 10);
  let m = s.match(/^(\d+(?:[.,]\d+)?)\s*h(?:\s*(\d+)\s*m(?:in)?)?$/);
  if (!m) m = s.match(/^(\d+(?:[.,]\d+)?)\s*h\s*(\d+)$/);
  if (m) {
    const hours = parseFloat(m[1].replace(",", "."));
    const mins = m[2] ? parseInt(m[2], 10) : 0;
    return Math.round(hours * 60 + mins);
  }
  const mOnly = s.match(/^(\d+)\s*m(?:in)?$/);
  if (mOnly) return parseInt(mOnly[1], 10);
  return null;
}

function minutesToDurationLabel(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h > 0 && m > 0) return `${h}h${m}min`;
  if (h > 0) return `${h}h`;
  return `${m}min`;
}

export type TimeTrackingMember = {
  id?: string;
  name: string;
  initials: string;
  color: string;
  photo?: string;
};

type EntryDraft = {
  date: string;
  start: string;
  end: string;
  durationText: string;
  note: string;
};

function draftFromEntry(entry?: TimeEntry): EntryDraft {
  if (!entry || !entry.endedAt) {
    const nowIso = new Date().toISOString();
    const start = toTimeInput(nowIso);
    return {
      date: toDateInput(nowIso),
      start,
      end: start,
      durationText: "0min",
      note: "",
    };
  }
  const start = toTimeInput(entry.startedAt);
  const end = toTimeInput(entry.endedAt);
  return {
    date: toDateInput(entry.startedAt),
    start,
    end,
    durationText: minutesToDurationLabel(Math.round((entry.durationSeconds ?? 0) / 60)),
    note: entry.note ?? "",
  };
}

function recomputeDuration(draft: EntryDraft): EntryDraft {
  const startedAt = combine(draft.date, draft.start);
  const endedAt = combine(draft.date, draft.end);
  const secs = Math.max(0, Math.round((Date.parse(endedAt) - Date.parse(startedAt)) / 1000));
  return { ...draft, durationText: minutesToDurationLabel(Math.round(secs / 60)) };
}

type PopoverView = "main" | "manual";

function ManualEntryForm({
  taskId,
  taskOrigin,
  entry,
  isForeignEdit,
  onBack,
  onSaved,
}: {
  taskId: string;
  taskOrigin: TaskOrigin;
  entry?: TimeEntry;
  isForeignEdit: boolean;
  onBack: () => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<EntryDraft>(() => draftFromEntry(entry));
  const correctFn = useServerFn(correctTimeEntry);
  const [saving, setSaving] = useState(false);

  const setField = (patch: Partial<EntryDraft>) =>
    setDraft((d) => recomputeDuration({ ...d, ...patch }));

  const onDurationBlur = () => {
    const minutes = parseDurationToMinutes(draft.durationText);
    if (minutes == null) {
      setDraft((d) => recomputeDuration(d));
      return;
    }
    setDraft((d) => ({ ...d, end: addMinutesToTime(d.start, minutes) }));
  };

  const save = async () => {
    if (!draft.date || !draft.start || !draft.end) return;
    const startedAt = combine(draft.date, draft.start);
    const endedAt = combine(draft.date, draft.end);
    if (Date.parse(endedAt) < Date.parse(startedAt)) {
      toast.error("O horário de fim não pode ser antes do início.");
      return;
    }
    setSaving(true);
    const note = draft.note.trim() || undefined;
    const result = entry
      ? isForeignEdit
        ? await correctFn({ data: { id: entry.id, startedAt, endedAt, note } }).then(
            () => ({ error: null as string | null }),
            (e: unknown) => ({
              error: e instanceof Error ? e.message : "Erro ao corrigir entrada.",
            }),
          )
        : await editOwnEntry(entry.id, { startedAt, endedAt, note })
      : await createManualEntry({ taskId, taskOrigin, startedAt, endedAt, note });
    setSaving(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    onSaved();
  };

  return (
    <div className="w-72 space-y-3 p-3">
      <p className="text-sm font-medium">Registrar tempo</p>
      <div>
        <label className="text-[11px] font-medium text-muted-foreground">Data</label>
        <div className="mt-1">
          <DateField value={draft.date} onChange={(v) => setField({ date: v ?? draft.date })} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[11px] font-medium text-muted-foreground">Início</label>
          <div className="mt-1">
            <TimeField
              value={draft.start}
              onChange={(v) => setField({ start: v })}
              ariaLabel="Início"
            />
          </div>
        </div>
        <div>
          <label className="text-[11px] font-medium text-muted-foreground">Fim</label>
          <div className="mt-1">
            <TimeField
              value={draft.end}
              onChange={(v) => setField({ end: v })}
              min={draft.start}
              ariaLabel="Fim"
            />
          </div>
        </div>
      </div>
      <div>
        <label className="text-[11px] font-medium text-muted-foreground">Duração</label>
        <input
          type="text"
          value={draft.durationText}
          onChange={(e) => setDraft((d) => ({ ...d, durationText: e.target.value }))}
          onBlur={onDurationBlur}
          onKeyDown={(e) => e.key === "Enter" && onDurationBlur()}
          placeholder="1h30, 2h, 45m..."
          className="mt-1 w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm tabular-nums outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      </div>
      <div>
        <label className="text-[11px] font-medium text-muted-foreground">
          Observação (opcional)
        </label>
        <input
          type="text"
          value={draft.note}
          onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
          placeholder="O que foi feito"
          className="mt-1 w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      </div>
      <div className="flex items-center justify-between pt-1">
        <button
          type="button"
          onClick={onBack}
          className="cursor-pointer rounded-md px-2 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted"
        >
          Voltar
        </button>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="cursor-pointer rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
        >
          {saving ? "Registrando..." : entry ? "Salvar" : "Registrar"}
        </button>
      </div>
    </div>
  );
}

function RecentRow({
  entry,
  member,
  canEdit,
  onEdit,
  onDelete,
}: {
  entry: TimeEntry;
  member?: TimeTrackingMember;
  canEdit: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="group flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted/40">
      <span
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-medium ${member?.color ?? "bg-muted text-foreground"}`}
      >
        {member?.initials ?? "?"}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-foreground">{member?.name ?? "Alguém"}</p>
        <p className="truncate text-[11px] text-muted-foreground">
          {entry.endedAt
            ? `${toTimeInput(entry.startedAt)} → ${toTimeInput(entry.endedAt)}`
            : "em andamento"}
        </p>
      </div>
      <span className="shrink-0 tabular-nums text-muted-foreground">
        {formatDuration(entry.endedAt ? (entry.durationSeconds ?? 0) : liveSeconds(entry))}
      </span>
      {canEdit && entry.endedAt && (
        <span className="ml-1 hidden shrink-0 items-center gap-1 group-hover:flex">
          <button
            type="button"
            onClick={onEdit}
            className="cursor-pointer text-muted-foreground hover:text-foreground"
          >
            <Pencil className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="cursor-pointer text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </span>
      )}
    </div>
  );
}

function AllEntriesDialog({
  open,
  onOpenChange,
  entries,
  memberFor,
  meId,
  canManageOthers,
  onEdit,
  onDelete,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  entries: TimeEntry[];
  memberFor: (id: string) => TimeTrackingMember | undefined;
  meId: string;
  canManageOthers: boolean;
  onEdit: (entry: TimeEntry) => void;
  onDelete: (id: string) => void;
}) {
  const total = entries.reduce(
    (s, e) => s + (e.durationSeconds ?? 0) + (e.endedAt ? 0 : liveSeconds(e)),
    0,
  );
  const own = entries
    .filter((e) => e.userId === meId)
    .reduce((s, e) => s + (e.durationSeconds ?? 0) + (e.endedAt ? 0 : liveSeconds(e)), 0);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Todos os registros de tempo</DialogTitle>
          <DialogDescription>
            Tempo total {formatDuration(total)} · Seu tempo {formatDuration(own)}
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="py-1.5 pr-2 font-medium">Pessoa</th>
                <th className="py-1.5 pr-2 font-medium">Data</th>
                <th className="py-1.5 pr-2 font-medium">Início</th>
                <th className="py-1.5 pr-2 font-medium">Fim</th>
                <th className="py-1.5 pr-2 font-medium">Duração</th>
                <th className="py-1.5 pr-2 font-medium">Origem</th>
                <th className="py-1.5 font-medium" />
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => {
                const member = memberFor(entry.userId);
                const canEdit = entry.userId === meId || canManageOthers;
                return (
                  <tr key={entry.id} className="border-b border-border/60">
                    <td className="py-1.5 pr-2">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-medium ${member?.color ?? "bg-muted"}`}
                        >
                          {member?.initials ?? "?"}
                        </span>
                        {member?.name ?? "Alguém"}
                      </div>
                    </td>
                    <td className="py-1.5 pr-2 text-muted-foreground">
                      {toDateInput(entry.startedAt)}
                    </td>
                    <td className="py-1.5 pr-2 tabular-nums text-muted-foreground">
                      {toTimeInput(entry.startedAt)}
                    </td>
                    <td className="py-1.5 pr-2 tabular-nums text-muted-foreground">
                      {entry.endedAt ? toTimeInput(entry.endedAt) : "—"}
                    </td>
                    <td className="py-1.5 pr-2 tabular-nums">
                      {formatDuration(
                        entry.endedAt ? (entry.durationSeconds ?? 0) : liveSeconds(entry),
                      )}
                    </td>
                    <td className="py-1.5 pr-2 text-muted-foreground">
                      {entry.source === "cronometro" ? "Cronômetro" : "Manual"}
                      {entry.editedAt && " · corrigido"}
                    </td>
                    <td className="py-1.5 text-right">
                      {canEdit && entry.endedAt && (
                        <span className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => onEdit(entry)}
                            className="cursor-pointer text-muted-foreground hover:text-foreground"
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDelete(entry.id)}
                            className="cursor-pointer text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  );
}

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
  const [view, setView] = useState<PopoverView>("main");
  const [editingEntry, setEditingEntry] = useState<TimeEntry | undefined>(undefined);
  const [conflict, setConflict] = useState<TimeEntry | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [allOpen, setAllOpen] = useState(false);
  const [starting, setStarting] = useState(false);
  const [, forceTick] = useState(0);

  const runningHere =
    running.entry && running.entry.taskId === taskId && running.entry.taskOrigin === taskOrigin
      ? running.entry
      : null;

  useEffect(() => {
    if (!runningHere) return;
    const iv = window.setInterval(() => forceTick((n) => n + 1), 1000);
    return () => window.clearInterval(iv);
  }, [runningHere]);

  const refreshAll = () => {
    refetch();
    running.refetch();
  };

  const totalSeconds =
    entries.reduce((s, e) => s + (e.durationSeconds ?? 0), 0) +
    (runningHere ? liveSeconds(runningHere) : 0);
  const ownSeconds =
    entries.filter((e) => e.userId === me.id).reduce((s, e) => s + (e.durationSeconds ?? 0), 0) +
    (runningHere && runningHere.userId === me.id ? liveSeconds(runningHere) : 0);

  const memberFor = (userId: string) => members.find((m) => m.id === userId);

  // Nunca mostra o cronômetro "ativo" antes do backend confirmar — o
  // botão fica em loading curto, e só quando `startTimer` resolve com
  // sucesso é que `runningHere` (derivado de `running.entry`, já
  // atualizado por `refreshAll`) passa a refletir "rodando".
  const handleStart = async () => {
    if (running.entry && !runningHere) {
      setConflict(running.entry);
      return;
    }
    setStarting(true);
    const { conflict: conflictEntry, error } = await startTimer(taskId, taskOrigin);
    setStarting(false);
    if (error) {
      toast.error("Não foi possível iniciar o cronômetro. Tente novamente.");
      return;
    }
    if (conflictEntry) {
      setConflict(conflictEntry);
      return;
    }
    refreshAll();
  };

  const handleStop = async () => {
    if (!runningHere) return;
    const { error } = await stopTimer(runningHere.id, runningHere.startedAt);
    if (error) toast.error(error);
    refreshAll();
  };

  const resolveConflict = async () => {
    if (!conflict) return;
    const { error } = await stopTimer(conflict.id, conflict.startedAt);
    if (error) {
      toast.error(error);
      return;
    }
    setConflict(null);
    setStarting(true);
    const { error: startError } = await startTimer(taskId, taskOrigin);
    setStarting(false);
    if (startError) toast.error("Não foi possível iniciar o cronômetro. Tente novamente.");
    refreshAll();
  };

  const handleDelete = async (id: string) => {
    const { error } = await deleteEntry(id);
    if (error) toast.error(error);
    setConfirmDeleteId(null);
    refreshAll();
  };

  const recent = useMemo(() => entries.slice(0, 3), [entries]);

  const triggerLabel = runningHere
    ? formatClock(liveSeconds(runningHere))
    : totalSeconds > 0
      ? formatDuration(totalSeconds)
      : "Iniciar";

  return (
    <>
      <Popover
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) {
            setView("main");
            setEditingEntry(undefined);
          }
        }}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium tabular-nums transition-colors hover:bg-muted ${
              runningHere ? "text-sky-700 dark:text-sky-400" : "text-foreground/80"
            }`}
          >
            {runningHere ? (
              <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-sky-500" />
            ) : (
              <Play className="h-3.5 w-3.5 shrink-0" />
            )}
            {triggerLabel}
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 p-0">
          {view === "manual" ? (
            <ManualEntryForm
              taskId={taskId}
              taskOrigin={taskOrigin}
              entry={editingEntry}
              isForeignEdit={!!editingEntry && editingEntry.userId !== me.id}
              onBack={() => {
                setView("main");
                setEditingEntry(undefined);
              }}
              onSaved={() => {
                setView("main");
                setEditingEntry(undefined);
                refreshAll();
              }}
            />
          ) : (
            <div className="p-3">
              <div className="flex items-baseline justify-between">
                <span className="text-xs font-medium text-muted-foreground">Tempo registrado</span>
                <span className="text-sm font-semibold tabular-nums">
                  {formatDuration(totalSeconds)}
                </span>
              </div>
              <div className="mt-1 flex items-baseline justify-between">
                <span className="text-xs text-muted-foreground">Seu tempo</span>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {formatDuration(ownSeconds)}
                </span>
              </div>

              <div className="mt-3">
                {runningHere ? (
                  <button
                    type="button"
                    onClick={handleStop}
                    className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-md bg-sky-500/15 px-3 py-2 text-sm font-semibold tabular-nums text-sky-700 hover:bg-sky-500/25 dark:text-sky-400"
                  >
                    <Square className="h-3.5 w-3.5 fill-current" />
                    Parar · {formatClock(liveSeconds(runningHere))}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleStart}
                    disabled={starting}
                    className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
                  >
                    {starting ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Play className="h-3.5 w-3.5" />
                    )}
                    {starting ? "Iniciando..." : "Iniciar cronômetro"}
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => setView("manual")}
                className="mt-3 w-full cursor-pointer rounded-md border-t border-border pt-2.5 text-left text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                + Registrar tempo manualmente
              </button>

              {!loading && recent.length > 0 && (
                <div className="-mx-3 mt-3 border-t border-border pt-2">
                  <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Registros recentes
                  </p>
                  <div className="space-y-0.5">
                    {recent.map((entry) => (
                      <RecentRow
                        key={entry.id}
                        entry={entry}
                        member={memberFor(entry.userId)}
                        canEdit={entry.userId === me.id || canManageOthers}
                        onEdit={() => {
                          setEditingEntry(entry);
                          setView("manual");
                        }}
                        onDelete={() => setConfirmDeleteId(entry.id)}
                      />
                    ))}
                  </div>
                  {entries.length > 3 && (
                    <button
                      type="button"
                      onClick={() => {
                        setOpen(false);
                        setAllOpen(true);
                      }}
                      className="mt-1 w-full cursor-pointer px-3 py-1.5 text-left text-xs font-medium text-muted-foreground hover:text-foreground"
                    >
                      Ver todos os registros
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </PopoverContent>
      </Popover>

      <AllEntriesDialog
        open={allOpen}
        onOpenChange={setAllOpen}
        entries={entries}
        memberFor={memberFor}
        meId={me.id}
        canManageOthers={canManageOthers}
        onEdit={(entry) => {
          setAllOpen(false);
          setEditingEntry(entry);
          setView("manual");
          setOpen(true);
        }}
        onDelete={(id) => setConfirmDeleteId(id)}
      />

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
                onClick={resolveConflict}
                className="cursor-pointer rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                Parar o outro e iniciar este
              </button>
            </div>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!confirmDeleteId} onOpenChange={(o) => !o && setConfirmDeleteId(null)}>
        <AlertDialogContent>
          <div className="space-y-3">
            <p className="text-sm">Excluir este registro de tempo?</p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteId(null)}
                className="cursor-pointer rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => confirmDeleteId && handleDelete(confirmDeleteId)}
                className="cursor-pointer rounded-md bg-destructive px-3 py-1.5 text-sm font-medium text-destructive-foreground hover:opacity-90"
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
