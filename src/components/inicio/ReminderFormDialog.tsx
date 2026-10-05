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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SegmentedControl } from "@/components/ui/segmented-control";
import type { Reminder } from "@/lib/reminders";
import type { ReminderPriority } from "@/lib/reminders.functions";

const labelCls = "block space-y-1 text-xs font-medium text-text-secondary";

export type ReminderFormInput = {
  title: string;
  notes?: string;
  dueAt?: string;
  priority: ReminderPriority;
};

const pad = (n: number) => String(n).padStart(2, "0");
// Data/hora locais — o ISO é gravado a partir da hora local digitada, então a edição precisa
// ler de volta em hora local (em UTC a hora mostrada deslocava ao reabrir).
function isoToDateInput(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function isoToTimeInput(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  const t = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return t === "00:00" ? "" : t;
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
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="O que você precisa lembrar?"
              maxLength={200}
              autoFocus
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className={labelCls}>
              <span>Data</span>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
            <label className={labelCls}>
              <span>Horário</span>
              <Input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                disabled={!date}
              />
            </label>
          </div>
          <label className={labelCls}>
            <span>Observação</span>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="h-16 resize-none"
              maxLength={2000}
            />
          </label>
          <div className="space-y-1">
            <span className="block text-xs font-medium text-text-secondary">Prioridade</span>
            <SegmentedControl
              aria-label="Prioridade do lembrete"
              size="sm"
              value={priority}
              onChange={setPriority}
              options={[
                { value: "normal" as ReminderPriority, label: "Normal" },
                { value: "importante" as ReminderPriority, label: "Importante" },
              ]}
            />
          </div>
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
