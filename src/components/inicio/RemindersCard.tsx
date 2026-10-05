import { useEffect, useRef, useState } from "react";
import { Bell, Plus } from "lucide-react";
import { Card, CardHeader } from "@/components/shared/SectionCard";
import { EmptyState } from "@/components/shared/EmptyState";
import { IconButton } from "@/components/ui/icon-button";
import { Checkbox } from "@/components/ui/checkbox";
import { fmtDue, fmtOverdue, reminderBucket, type Reminder } from "@/lib/reminders";

const CARD_LIMIT = 4;

/**
 * "Lembretes" — lista pessoal compacta e acionável: até 4 pendentes (atrasados → hoje → próximos
 * → sem data, já ordenados por `pendingReminders`), concluir pelo checkbox na hora (sem
 * confirmação), clicar na linha abre a edição, "+" cria. "Importante" é o único destaque de
 * prioridade (o normal não ganha rótulo); atrasado aparece só como texto de alerta, nunca
 * pintando a linha.
 */
export function RemindersCard({
  reminders,
  onCreate,
  onComplete,
  onEdit,
  onViewAll,
}: {
  /** Já filtrados/ordenados (pendentes, vencidos → hoje → próximos → sem data). */
  reminders: Reminder[];
  onCreate: () => void;
  onComplete: (id: string) => void;
  onEdit: (r: Reminder) => void;
  onViewAll: () => void;
}) {
  // Feedback imediato ao concluir: a linha risca e esmaece enquanto a mutação grava.
  const [done, setDone] = useState<Set<string>>(new Set());
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);
  const complete = (id: string) => {
    setDone((prev) => new Set(prev).add(id));
    timers.current.push(
      window.setTimeout(() => {
        onComplete(id);
        setDone((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }, 350),
    );
  };

  const visible = reminders.slice(0, CARD_LIMIT);

  return (
    <Card>
      <CardHeader
        icon={<Bell className="h-4 w-4" />}
        title="Lembretes"
        action={
          <IconButton label="Criar lembrete" tone="brand" onClick={onCreate}>
            <Plus className="h-3.5 w-3.5" />
          </IconButton>
        }
      />
      {visible.length === 0 ? (
        <div className="px-3 pb-3 md:px-4 md:pb-4">
          <EmptyState
            compact
            icon={<Bell className="h-4 w-4" aria-hidden="true" />}
            title="Nenhum lembrete pendente."
            description="Crie um lembrete para algo que não pode esquecer."
            primaryAction={{ label: "Criar lembrete", onClick: onCreate }}
          />
        </div>
      ) : (
        <>
          <ul className="px-1.5 pb-1 md:px-2">
            {visible.map((r) => {
              const overdue = reminderBucket(r) === "atrasado";
              const finishing = done.has(r.id);
              return (
                <li
                  key={r.id}
                  className={`group flex items-start gap-3 rounded-lg px-2 py-2 transition-opacity hover:bg-muted/40 ${
                    finishing ? "opacity-50" : ""
                  }`}
                >
                  <Checkbox
                    checked={finishing}
                    onCheckedChange={() => !finishing && complete(r.id)}
                    aria-label={`Concluir lembrete: ${r.title}`}
                    className="mt-0.5"
                  />
                  <button
                    type="button"
                    onClick={() => onEdit(r)}
                    className="min-w-0 flex-1 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  >
                    <span
                      className={`block truncate text-sm text-foreground ${finishing ? "line-through" : ""}`}
                      title={r.title}
                    >
                      {r.title}
                    </span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs">
                      {r.dueAt &&
                        (overdue ? (
                          <span className="font-medium text-danger-soft-foreground">
                            {fmtOverdue(r.dueAt)}
                          </span>
                        ) : (
                          <span className="text-text-secondary">{fmtDue(r.dueAt)}</span>
                        ))}
                      {r.priority === "importante" && (
                        <span className="inline-flex items-center gap-1 text-text-secondary">
                          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-danger" />
                          Importante
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <button
            type="button"
            onClick={onViewAll}
            className="flex w-full items-center justify-start gap-1 border-t border-border/70 px-4 py-2.5 text-xs font-medium text-text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            Ver todos os lembretes →
          </button>
        </>
      )}
    </Card>
  );
}
