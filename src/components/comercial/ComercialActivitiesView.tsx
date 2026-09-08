import { useState } from "react";
import { AlertTriangle, CalendarClock, Clock, Info } from "lucide-react";
import { formatBRL, type Lead } from "@/lib/comercial";
import { deriveOpportunityNextStep } from "@/lib/comercial-engine";
import { bucketActivities, type ActivityBucketKey } from "@/lib/comercial-metrics";
import type { TeamMemberLite } from "@/lib/projetos";

const BUCKET_LABEL: Record<ActivityBucketKey, string> = {
  atrasadas: "Atrasadas",
  hoje: "Hoje",
  proximas: "Próximas",
  concluidas: "Concluídas recentemente",
};
const BUCKET_ICON: Record<ActivityBucketKey, typeof Clock> = {
  atrasadas: AlertTriangle,
  hoje: Clock,
  proximas: CalendarClock,
  concluidas: CalendarClock,
};

/**
 * Aba Atividades — visão operacional a partir da "próxima ação" já
 * existente (motor) + `nextMeeting`, já que não existe uma entidade de
 * atividade própria (ligação/e-mail/WhatsApp/tarefa) com prazo hoje. A
 * limitação é dita explicitamente, não escondida atrás de dados que não
 * existem.
 */
export function ComercialActivitiesView({
  leads,
  team,
}: {
  leads: Lead[];
  team: TeamMemberLite[];
}) {
  const [responsibleFilter, setResponsibleFilter] = useState("");
  const filtered = responsibleFilter
    ? leads.filter((l) => l.responsible === responsibleFilter)
    : leads;
  const buckets = bucketActivities(filtered);

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Ainda não existe uma entidade própria de atividade (ligação/e-mail/WhatsApp/reunião/
        follow-up) com prazo em todos os casos — esta visão reaproveita a próxima ação sugerida pelo
        motor de pipeline e a data de reunião agendada, quando existir.
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">Responsável</span>
        <select
          value={responsibleFilter}
          onChange={(e) => setResponsibleFilter(e.target.value)}
          className="h-8 rounded-md border border-border bg-background px-2 text-xs outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">Todos</option>
          {team.map((m) => (
            <option key={m.id} value={m.name}>
              {m.name}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {(Object.keys(BUCKET_LABEL) as ActivityBucketKey[]).map((key) => {
          const Icon = BUCKET_ICON[key];
          const items = buckets[key];
          return (
            <div key={key} className="rounded-2xl border border-border bg-card p-3">
              <h3 className="mb-2 flex items-center justify-between gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Icon className="h-3.5 w-3.5" /> {BUCKET_LABEL[key]}
                </span>
                <span className="tabular-nums">{items.length}</span>
              </h3>
              {items.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">Nada aqui.</p>
              ) : (
                <ul className="space-y-1.5">
                  {items.map((l) => {
                    const step = deriveOpportunityNextStep(l);
                    return (
                      <li key={l.id} className="rounded-md border border-border/60 p-2 text-xs">
                        <p className="truncate font-medium text-foreground">
                          {l.company || l.name}
                        </p>
                        <p className="truncate text-muted-foreground">
                          {step.actionLabel ?? "—"} · {formatBRL(l.value || 0)}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
