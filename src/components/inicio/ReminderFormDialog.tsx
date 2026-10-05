import { useRef, useState, type FormEvent } from "react";
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
import { DateField } from "@/components/ui/date-field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { todayIsoInBrasilia } from "@/lib/timezone";
import type { Reminder } from "@/lib/reminders";
import type { ReminderPriority } from "@/lib/reminders.functions";

const labelCls = "block text-sm font-medium text-foreground";

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
/** Amanhã a partir de um dia `YYYY-MM-DD` (sem passar por UTC). */
function addOneDay(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  const next = new Date(y, m - 1, d + 1);
  return `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}`;
}

/** Atalho de data: um chip que preenche o MESMO campo de data (clicar de novo limpa). */
function DateChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`h-9 rounded-md border px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
        active
          ? "border-foreground bg-foreground text-background"
          : "border-border text-text-secondary hover:bg-muted hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

/**
 * "Criar lembrete" (ou editar, com `initial`) — criação rápida: o quê → quando → contexto →
 * prioridade. Sempre em modal (nunca um campo permanente no card). Data e hora são opcionais e
 * combinadas em um único ISO só na hora de enviar. Enter envia, Esc fecha, o foco começa no título.
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
  const [titleError, setTitleError] = useState("");
  const titleRef = useRef<HTMLInputElement>(null);

  const today = todayIsoInBrasilia();
  const tomorrow = addOneDay(today);

  const handleSave = async (e?: FormEvent) => {
    e?.preventDefault();
    if (saving) return;
    if (!title.trim()) {
      setTitleError("Digite o que você precisa lembrar.");
      titleRef.current?.focus();
      return;
    }
    setSaving(true);
    setError("");
    try {
      let dueAt: string | undefined;
      if (date) {
        dueAt = new Date(`${date}T${time || "00:00"}:00`).toISOString();
      }
      await onSubmit({ title: title.trim(), notes: notes.trim() || undefined, dueAt, priority });
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar o lembrete.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent mobileFullScreen className="max-w-md">
        <form onSubmit={(e) => void handleSave(e)} className="space-y-6">
          <DialogHeader>
            <DialogTitle>{initial ? "Editar lembrete" : "Criar lembrete"}</DialogTitle>
            <DialogDescription>Um lembrete pessoal — só você vê.</DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            <div className="space-y-1.5">
              <label htmlFor="lembrete-titulo" className={labelCls}>
                O que você precisa lembrar?
              </label>
              <Input
                id="lembrete-titulo"
                ref={titleRef}
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  if (titleError) setTitleError("");
                }}
                placeholder="Ex.: enviar a proposta para o cliente"
                maxLength={200}
                autoFocus
                aria-invalid={!!titleError}
                aria-describedby={titleError ? "lembrete-titulo-erro" : undefined}
                className={`h-10 ${titleError ? "border-destructive focus-visible:ring-destructive" : ""}`}
              />
              {titleError && (
                <p id="lembrete-titulo-erro" role="alert" className="text-xs text-danger">
                  {titleError}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <span className={labelCls}>Quando?</span>
              <div className="flex flex-wrap items-center gap-2">
                <DateChip
                  active={date === today}
                  onClick={() => setDate(date === today ? "" : today)}
                >
                  Hoje
                </DateChip>
                <DateChip
                  active={date === tomorrow}
                  onClick={() => setDate(date === tomorrow ? "" : tomorrow)}
                >
                  Amanhã
                </DateChip>
                <div className="min-w-[10rem] flex-1 sm:flex-none">
                  <DateField
                    value={date || undefined}
                    onChange={(v) => setDate(v ?? "")}
                    placeholder="Escolher data"
                    ariaLabel="Escolher data"
                    contentClassName="z-[70]"
                    className="h-9 py-0"
                  />
                </div>
              </div>
              {date && (
                <div className="flex items-center gap-2 pt-1">
                  <label htmlFor="lembrete-hora" className="text-sm text-text-secondary">
                    Horário <span className="text-text-secondary/70">(opcional)</span>
                  </label>
                  <Input
                    id="lembrete-hora"
                    type="time"
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                    className="h-9 w-32"
                  />
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="lembrete-obs" className={labelCls}>
                Observação
              </label>
              <Textarea
                id="lembrete-obs"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                onInput={(e) => {
                  const el = e.currentTarget;
                  el.style.height = "auto";
                  el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
                }}
                rows={2}
                placeholder="Algum contexto que você queira lembrar junto."
                className="min-h-[3.5rem] resize-none"
                maxLength={2000}
              />
            </div>

            <div className="space-y-1.5">
              <span className={labelCls}>Prioridade</span>
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

            {error && (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button type="submit" variant="primary" disabled={saving}>
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {saving
                ? initial
                  ? "Salvando..."
                  : "Criando..."
                : initial
                  ? "Salvar alterações"
                  : "Criar lembrete"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
