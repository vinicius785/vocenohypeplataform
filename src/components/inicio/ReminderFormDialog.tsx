import { useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { Reminder } from "@/lib/reminders";
import type { ReminderPriority } from "@/lib/reminders.functions";

const inputCls =
  "h-9 w-full rounded-md border border-border bg-background px-2.5 text-sm outline-none focus:ring-2 focus:ring-ring";
const labelCls = "block space-y-1 text-xs font-medium text-text-secondary";

export type ReminderFormInput = {
  title: string;
  notes?: string;
  dueAt?: string;
  priority: ReminderPriority;
};

function isoToDateInput(iso?: string): string {
  if (!iso) return "";
  return new Date(iso).toISOString().slice(0, 10);
}
function isoToTimeInput(iso?: string): string {
  if (!iso) return "";
  return new Date(iso).toISOString().slice(11, 16);
}

/**
 * Formulário compacto de "Criar lembrete" (ou editar, quando `initial` é
 * passado) — sempre em modal/popover, nunca um campo permanente dentro do
 * card (pedido explícito). Data e hora são campos separados e opcionais;
 * combinados em um único ISO só na hora de enviar.
 */
export function ReminderFormDialog({
  open,
  onOpenChange,
  initial,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial?: Reminder;
  onSubmit: (input: ReminderFormInput) => Promise<void>;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [date, setDate] = useState(isoToDateInput(initial?.dueAt));
  const [time, setTime] = useState(isoToTimeInput(initial?.dueAt));
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [priority, setPriority] = useState<ReminderPriority>(initial?.priority ?? "normal");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const canSave = title.trim().length > 0 && !saving;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    setError("");
    try {
      let dueAt: string | undefined;
      if (date) {
        dueAt = new Date(`${date}T${time || "00:00"}:00`).toISOString();
      }
      await onSubmit({ title: title.trim(), notes: notes.trim() || undefined, dueAt, priority });
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar o lembrete.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent mobileFullScreen className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{initial ? "Editar lembrete" : "Criar lembrete"}</DialogTitle>
          <DialogDescription>Um lembrete pessoal — só você vê.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          <label className={labelCls}>
            <span>Título *</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="O que você precisa lembrar?"
              className={inputCls}
              maxLength={200}
              autoFocus
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className={labelCls}>
              <span>Data</span>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className={inputCls}
              />
            </label>
            <label className={labelCls}>
              <span>Horário</span>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                disabled={!date}
                className={`${inputCls} disabled:opacity-50`}
              />
            </label>
          </div>
          <label className={labelCls}>
            <span>Observação</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className={`${inputCls} h-16 resize-none py-2`}
              maxLength={2000}
            />
          </label>
          <label className={labelCls}>
            <span>Prioridade</span>
            <div className="flex gap-1">
              {(["normal", "importante"] as ReminderPriority[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPriority(p)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
                    priority === p
                      ? "border-foreground bg-foreground text-background"
                      : "border-border text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {p === "normal" ? "Normal" : "Importante"}
                </button>
              ))}
            </div>
          </label>
          {error && <p className="text-xs text-danger">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={() => void handleSave()} disabled={!canSave}>
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {initial ? "Salvar alterações" : "Criar lembrete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
