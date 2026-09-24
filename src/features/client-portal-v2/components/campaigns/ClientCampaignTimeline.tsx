import { CalendarDays } from "lucide-react";
import { EmptyState } from "@/components/shared/EmptyState";
import { CampaignSection } from "./CampaignSection";
import type { PublicCronogramaItem } from "@/lib/portal-types";

/** Cronograma — timeline vertical de marcos já cadastrados, sem criar
 * tarefas internas nem expor informação privada da equipe. */
export function ClientCampaignTimeline({ items }: { items: PublicCronogramaItem[] }) {
  const now = Date.now();
  const sorted = [...items].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <CampaignSection icon={<CalendarDays className="h-4 w-4" />} title="Cronograma">
      {sorted.length === 0 ? (
        <EmptyState
          compact
          icon={<CalendarDays className="h-4 w-4" aria-hidden="true" />}
          title="Nenhum marco cadastrado ainda"
        />
      ) : (
        <ol className="space-y-2 rounded-2xl bg-card p-2 dark:shadow-none">
          {sorted.map((item) => {
            const isPast = new Date(item.date).getTime() < now;
            return (
              <li key={item.id} className="flex items-start gap-3 rounded-xl px-3 py-2.5">
                <span
                  className={`mt-1 h-2 w-2 shrink-0 rounded-full ${isPast ? "bg-success" : "bg-brand"}`}
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium text-foreground">{item.title}</p>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        isPast
                          ? "bg-success-soft text-success-soft-foreground"
                          : "bg-brand-subtle text-brand"
                      }`}
                    >
                      {isPast ? "Concluído" : "Planejado"}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-text-secondary">
                    {new Date(item.date).toLocaleDateString("pt-BR")}
                    {item.description ? ` · ${item.description}` : ""}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </CampaignSection>
  );
}
