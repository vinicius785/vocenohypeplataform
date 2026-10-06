import { Activity } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { Member } from "@/components/TimeSection";
import type { ViewId } from "@/components/time-v2/MemberViews";
import type { TeamInsightV2 } from "@/components/time-v2/team-insights-v2";
import { avatarAccent, initialsOf } from "./member-ui";
import { InsightRow } from "./InsightRow";

/** Até 12 insights em 2 colunas de até 6 (a 1ª coluna enche primeiro; no celular vira 1 coluna,
 * na mesma ordem). */
export const COLUMN_SIZE = 6;
export function splitColumns<T>(items: T[]): T[][] {
  const cols = [items.slice(0, COLUMN_SIZE), items.slice(COLUMN_SIZE, COLUMN_SIZE * 2)];
  return cols.filter((c) => c.length > 0);
}

/** "Insights": radar operacional — até 6 leituras já priorizadas (P0→P3, 1 por pessoa), cada uma
 * com fato, leitura gerencial e uma ação real. Sem insight relevante, uma linha — nunca um bloco
 * vazio. */
export function TeamInsights({
  insights,
  membersById,
  onOpenMember,
}: {
  insights: TeamInsightV2[];
  membersById: Map<string, Member>;
  onOpenMember: (m: Member, view: ViewId) => void;
}) {
  return (
    <section aria-label="Insights" className="space-y-2">
      <div>
        <h3 className="text-[15px] font-semibold text-foreground">Insights</h3>
        <p className="text-xs text-text-secondary">
          O que está acontecendo com o time neste período.
        </p>
      </div>
      {insights.length === 0 ? (
        <p className="py-2 text-sm text-text-secondary">Nenhum insight relevante neste período.</p>
      ) : (
        <div className="grid gap-x-10 md:grid-cols-2">
          {splitColumns(insights).map((col, c) => (
            <div key={c} className="min-w-0 divide-y divide-border/60">
              {col.map((insight) => {
                const m = insight.memberId ? membersById.get(insight.memberId) : undefined;
                return (
                  <InsightRow
                    key={insight.id}
                    insight={insight}
                    avatar={
                      insight.memberName ? (
                        <Avatar className="h-7 w-7 shrink-0">
                          {m?.photo && <AvatarImage src={m.photo} alt={insight.memberName} />}
                          <AvatarFallback
                            className={`text-[11px] font-semibold ${avatarAccent(insight.memberId ?? "")}`}
                          >
                            {initialsOf(insight.memberName, insight.memberName)}
                          </AvatarFallback>
                        </Avatar>
                      ) : (
                        <span
                          aria-hidden
                          className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-muted text-text-secondary"
                        >
                          <Activity className="h-3.5 w-3.5" />
                        </span>
                      )
                    }
                    onOpen={m && insight.view ? () => onOpenMember(m, insight.view!) : undefined}
                  />
                );
              })}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
