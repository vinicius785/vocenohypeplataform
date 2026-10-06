import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { Insight } from "@/lib/insights-engine";
import type { Member } from "@/components/TimeSection";
import type { ViewId } from "@/components/time-v2/MemberViews";
import { insightTargetView } from "@/components/time-v2/team-v2";
import { avatarAccent, initialsOf } from "./member-ui";
import { InsightRow } from "./InsightRow";

/** "Insights": um feed curto (já filtrado por `curateInsights`: poucos, 1 por pessoa, só o que
 * ajuda a decidir). Clicar abre o detalhe do membro no contexto do insight. Sem insight relevante,
 * uma linha — nunca um bloco vazio. */
export function TeamInsights({
  insights,
  membersById,
  onOpenMember,
}: {
  insights: Insight[];
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
            const m = membersById.get(insight.memberId);
            return (
              <InsightRow
                key={`${insight.ruleId}:${insight.memberId}`}
                insight={insight}
                avatar={
                  <Avatar className="h-8 w-8 shrink-0">
                    {m?.photo && <AvatarImage src={m.photo} alt={insight.memberName} />}
                    <AvatarFallback
                      className={`text-xs font-semibold ${avatarAccent(insight.memberId)}`}
                    >
                      {initialsOf(insight.memberName, insight.memberName)}
                    </AvatarFallback>
                  </Avatar>
                }
                onOpenMember={
                  m ? () => onOpenMember(m, insightTargetView(insight.ruleId)) : undefined
                }
              />
            );
          })}
        </div>
      )}
    </section>
  );
}
