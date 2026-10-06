import { Activity } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { Member } from "@/components/TimeSection";
import type { ViewId } from "@/components/time-v2/MemberViews";
import type { TeamInsightV2 } from "@/components/time-v2/team-insights-v2";
import { avatarAccent, initialsOf } from "./member-ui";
import { InsightRow } from "./InsightRow";

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
    <section aria-label="Insights" className="space-y-1">
      <h3 className="text-[15px] font-semibold text-foreground">Insights</h3>
      {insights.length === 0 ? (
        <p className="py-2 text-sm text-text-secondary">Nenhum insight relevante neste período.</p>
      ) : (
        <div className="divide-y divide-border/60">
          {insights.map((insight) => {
            const m = insight.memberId ? membersById.get(insight.memberId) : undefined;
            return (
              <InsightRow
                key={insight.id}
                insight={insight}
                avatar={
                  insight.memberName ? (
                    <Avatar className="h-8 w-8 shrink-0">
                      {m?.photo && <AvatarImage src={m.photo} alt={insight.memberName} />}
                      <AvatarFallback
                        className={`text-xs font-semibold ${avatarAccent(insight.memberId ?? "")}`}
                      >
                        {initialsOf(insight.memberName, insight.memberName)}
                      </AvatarFallback>
                    </Avatar>
                  ) : (
                    <span
                      aria-hidden
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-muted text-text-secondary"
                    >
                      <Activity className="h-4 w-4" />
                    </span>
                  )
                }
                onOpen={m && insight.view ? () => onOpenMember(m, insight.view!) : undefined}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}
