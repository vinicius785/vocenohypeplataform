import { Bell, Plus } from "lucide-react";
import { Card, CardHeader } from "@/components/InicioDashboard";
import { EmptyState } from "@/components/shared/EmptyState";
import { IconButton } from "@/components/ui/icon-button";
import { BRASILIA_TZ } from "@/lib/timezone";
import { reminderBucket, type Reminder } from "@/lib/reminders";

const CARD_LIMIT = 5;

function fmtDue(iso: string): string {
  const bucket = reminderBucket({ dueAt: iso });
  const time = new Date(iso).toLocaleTimeString("pt-BR", {
    timeZone: BRASILIA_TZ,
    hour: "2-digit",
    minute: "2-digit",
  });
  const hasTime = new Date(iso).getUTCHours() !== 0 || new Date(iso).getUTCMinutes() !== 0;
  const dateLabel = new Date(iso).toLocaleDateString("pt-BR", {
    timeZone: BRASILIA_TZ,
    day: "2-digit",
    month: "2-digit",
  });
  const label =
    bucket === "hoje" ? "Hoje" : bucket === "atrasado" ? `Venceu ${dateLabel}` : dateLabel;
  return hasTime ? `${label} · ${time}` : label;
}

/**
 * "Lembretes" (antes "Lista pessoal") — card compacto: no máximo 5
 * pendentes (vencidos primeiro, depois hoje, depois próximos, por último
 * sem data — já vem ordenado de `pendingReminders`), concluir direto no
 * card, "Ver todos" quando houver mais. Criação SEMPRE em popover/modal
 * (`ReminderFormDialog`) — o campo de texto permanente da versão antiga
 * foi removido de propósito, pra manter o card limpo.
 */
export function RemindersCard({
  reminders,
  onCreate,
  onComplete,
  onViewAll,
}: {
  /** Já filtrados/ordenados (pendentes, vencidos → hoje → próximos → sem data). */
  reminders: Reminder[];
  onCreate: () => void;
  onComplete: (id: string) => void;
  onViewAll: () => void;
}) {
  const visible = reminders.slice(0, CARD_LIMIT);
  const hasMore = reminders.length > CARD_LIMIT;

  return (
    <Card>
      <CardHeader
        icon={<Bell className="h-4 w-4" />}
        title="Lembretes"
        action={
          <div className="flex items-center gap-2">
            {reminders.length > 0 && (
              <span className="text-[11px] text-muted-foreground">{reminders.length}</span>
            )}
            <IconButton label="Criar lembrete" tone="brand" onClick={onCreate}>
              <Plus className="h-3.5 w-3.5" />
            </IconButton>
          </div>
        }
      />
      <div className="space-y-1 p-3 md:p-4">
        {visible.length === 0 ? (
          <EmptyState
            compact
            icon={<Bell className="h-4 w-4" aria-hidden="true" />}
            title="Nenhum lembrete pendente."
            primaryAction={{ label: "Criar lembrete", onClick: onCreate }}
          />
        ) : (
          visible.map((r) => {
            const bucket = reminderBucket(r);
            return (
              <div
                key={r.id}
                className="group flex items-start gap-2 rounded-lg px-2 py-1.5 text-xs hover:bg-muted/40"
              >
                <input
                  type="checkbox"
                  checked={false}
                  onChange={() => onComplete(r.id)}
                  aria-label={`Concluir lembrete: ${r.title}`}
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-border accent-brand"
                />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 truncate text-foreground" title={r.title}>
                    {r.priority === "importante" && (
                      <span
                        className="h-1.5 w-1.5 shrink-0 rounded-full bg-danger"
                        aria-label="Importante"
                        title="Importante"
                      />
                    )}
                    <span className="truncate">{r.title}</span>
                  </p>
                  {r.dueAt && (
                    <p
                      className={`mt-0.5 text-[11px] ${
                        bucket === "atrasado" ? "text-danger" : "text-muted-foreground"
                      }`}
                    >
                      {fmtDue(r.dueAt)}
                    </p>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
      {hasMore && (
        <button
          type="button"
          onClick={onViewAll}
          className="flex w-full items-center justify-center gap-1 border-t border-border/70 px-4 py-2.5 text-xs font-medium text-brand hover:underline"
        >
          Ver todos ({reminders.length})
        </button>
      )}
    </Card>
  );
}
