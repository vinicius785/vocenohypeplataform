"use client";

import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Play, Pause, Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
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

/** Pequena duplicação intencional do `formatDuration` de TaskBoard.tsx —
 * importar de lá criaria um ciclo (TaskBoard.tsx importa este painel).
 * Função pura de 6 linhas, mesmo espírito de tolerância a duplicação já
 * usado em `projetos.ts` pro tipo `Task`. */
function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}min`;
  if (m > 0) return `${m}min`;
  return `${sec}s`;
}

function liveSeconds(entry: TimeEntry): number {
  return (Date.now() - Date.parse(entry.startedAt)) / 1000;
}

function toDateInput(iso: string): string {
  return iso.slice(0, 10);
}
function toTimeInput(iso: string): string {
  return iso.slice(11, 16);
}
function combine(date: string, time: string): string {
  return new Date(`${date}T${time}:00`).toISOString();
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
  note: string;
};

function draftFromEntry(entry?: TimeEntry): EntryDraft {
  if (!entry || !entry.endedAt) {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    return {
      date: toDateInput(now.toISOString()),
      start: `${hh}:${mm}`,
      end: `${hh}:${mm}`,
      note: "",
    };
  }
  return {
    date: toDateInput(entry.startedAt),
    start: toTimeInput(entry.startedAt),
    end: toTimeInput(entry.endedAt),
    note: entry.note ?? "",
  };
}

function ManualEntryDialog({
  open,
  onOpenChange,
  initial,
  isForeignEdit,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial: { taskId: string; taskOrigin: TaskOrigin; entry?: TimeEntry };
  isForeignEdit: boolean;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<EntryDraft>(() => draftFromEntry(initial.entry));
  const correctFn = useServerFn(correctTimeEntry);
  useEffect(() => {
    if (open) setDraft(draftFromEntry(initial.entry));
  }, [open, initial.entry]);

  const durationLabel = (() => {
    if (!draft.date || !draft.start || !draft.end) return null;
    const startedAt = combine(draft.date, draft.start);
    const endedAt = combine(draft.date, draft.end);
    const secs = Math.max(0, Math.round((Date.parse(endedAt) - Date.parse(startedAt)) / 1000));
    return formatDuration(secs);
  })();

  const save = async () => {
    if (!draft.date || !draft.start || !draft.end) return;
    const startedAt = combine(draft.date, draft.start);
    const endedAt = combine(draft.date, draft.end);
    if (Date.parse(endedAt) < Date.parse(startedAt)) {
      toast.error("O horário de fim não pode ser antes do início.");
      return;
    }
    const note = draft.note.trim() || undefined;
    if (initial.entry) {
      const result = isForeignEdit
        ? await correctFn({ data: { id: initial.entry.id, startedAt, endedAt, note } }).then(
            () => ({ error: null as string | null }),
            (e: unknown) => ({
              error: e instanceof Error ? e.message : "Erro ao corrigir entrada.",
            }),
          )
        : await editOwnEntry(initial.entry.id, { startedAt, endedAt, note });
      if (result.error) {
        toast.error(result.error);
        return;
      }
    } else {
      const { error } = await createManualEntry({
        taskId: initial.taskId,
        taskOrigin: initial.taskOrigin,
        startedAt,
        endedAt,
        note,
      });
      if (error) {
        toast.error(error);
        return;
      }
    }
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {initial.entry ? "Editar registro" : "Registrar tempo manualmente"}
          </DialogTitle>
          <DialogDescription>Informe a data e o intervalo trabalhado.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Data</label>
            <div className="mt-1">
              <DateField
                value={draft.date}
                onChange={(v) => setDraft((d) => ({ ...d, date: v ?? d.date }))}
                variant="input"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Início</label>
              <div className="mt-1">
                <TimeField
                  value={draft.start}
                  onChange={(v) => setDraft((d) => ({ ...d, start: v }))}
                  ariaLabel="Início"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Fim</label>
              <div className="mt-1">
                <TimeField
                  value={draft.end}
                  onChange={(v) => setDraft((d) => ({ ...d, end: v }))}
                  min={draft.start}
                  ariaLabel="Fim"
                />
              </div>
            </div>
          </div>
          {durationLabel && (
            <p className="text-xs text-muted-foreground">Duração: {durationLabel}</p>
          )}
          <div>
            <label className="text-xs font-medium text-muted-foreground">Nota (opcional)</label>
            <input
              type="text"
              value={draft.note}
              onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
              placeholder="O que foi feito"
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
        </div>
        <DialogFooter>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="cursor-pointer rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={save}
            className="cursor-pointer rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Salvar
          </button>
        </DialogFooter>
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
  const [popover, setPopover] = useState<{
    taskId: string;
    taskOrigin: TaskOrigin;
    entry?: TimeEntry;
  } | null>(null);
  const [conflict, setConflict] = useState<TimeEntry | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
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

  const handleStartStop = async () => {
    if (runningHere) {
      const { error } = await stopTimer(runningHere.id, runningHere.startedAt);
      if (error) toast.error(error);
      refreshAll();
      return;
    }
    if (running.entry) {
      // Já tem outro cronômetro rodando (em outra tarefa) — o próprio
      // banco teria rejeitado o insert; mostramos o diálogo direto sem
      // precisar da viagem de rede.
      setConflict(running.entry);
      return;
    }
    const { conflict: conflictEntry, error } = await startTimer(taskId, taskOrigin);
    if (error) {
      toast.error(error);
      return;
    }
    if (conflictEntry) {
      setConflict(conflictEntry);
      return;
    }
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
    const { error: startError } = await startTimer(taskId, taskOrigin);
    if (startError) toast.error(startError);
    refreshAll();
  };

  const totalSeconds =
    entries.reduce((s, e) => s + (e.durationSeconds ?? 0), 0) +
    (runningHere ? liveSeconds(runningHere) : 0);
  const ownSeconds =
    entries.filter((e) => e.userId === me.id).reduce((s, e) => s + (e.durationSeconds ?? 0), 0) +
    (runningHere && runningHere.userId === me.id ? liveSeconds(runningHere) : 0);

  const memberFor = (userId: string) => members.find((m) => m.id === userId);

  const handleDelete = async (id: string) => {
    const { error } = await deleteEntry(id);
    if (error) toast.error(error);
    setConfirmDeleteId(null);
    refreshAll();
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={handleStartStop}
          className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium tabular-nums ${
            runningHere
              ? "bg-sky-500/10 text-sky-700 dark:text-sky-400"
              : "text-foreground/70 hover:bg-muted"
          }`}
        >
          {runningHere ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          {totalSeconds > 0 ? formatDuration(totalSeconds) : "Iniciar"}
        </button>
        <button
          type="button"
          onClick={() => setPopover({ taskId, taskOrigin })}
          className="inline-flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
        >
          <Plus className="h-3.5 w-3.5" />
          Manual
        </button>
      </div>

      {totalSeconds > 0 && (
        <p className="text-xs text-muted-foreground">
          Total: {formatDuration(totalSeconds)} · Seu tempo: {formatDuration(ownSeconds)}
        </p>
      )}

      {!loading && entries.length > 0 && (
        <div className="space-y-1">
          {entries.map((entry) => {
            const member = memberFor(entry.userId);
            const isOwn = entry.userId === me.id;
            const canEdit = isOwn || canManageOthers;
            return (
              <div
                key={entry.id}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-muted/50"
              >
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-medium ${member?.color ?? "bg-muted text-foreground"}`}
                >
                  {member?.initials ?? "?"}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  {member?.name ?? "Alguém"} ·{" "}
                  {entry.endedAt
                    ? `${toTimeInput(entry.startedAt)}–${toTimeInput(entry.endedAt)}`
                    : "em andamento"}
                </span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {formatDuration(
                    entry.endedAt ? (entry.durationSeconds ?? 0) : liveSeconds(entry),
                  )}
                </span>
                <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  {entry.source === "cronometro" ? "Cronômetro" : "Manual"}
                </span>
                {entry.editedAt && (
                  <span className="shrink-0 text-[10px] text-muted-foreground">
                    corrigido por {memberFor(entry.editedBy ?? "")?.name ?? "admin"}
                  </span>
                )}
                {canEdit && entry.endedAt && (
                  <>
                    <button
                      type="button"
                      onClick={() => setPopover({ taskId, taskOrigin, entry })}
                      className="shrink-0 cursor-pointer text-muted-foreground hover:text-foreground"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(entry.id)}
                      className="shrink-0 cursor-pointer text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {popover && (
        <ManualEntryDialog
          open
          onOpenChange={(o) => !o && setPopover(null)}
          initial={popover}
          isForeignEdit={!!popover.entry && popover.entry.userId !== me.id}
          onSaved={refreshAll}
        />
      )}

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
    </div>
  );
}
