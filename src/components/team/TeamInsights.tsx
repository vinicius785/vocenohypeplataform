import { Sparkles } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { Insight } from "@/lib/insights-engine";
import type { Member } from "@/components/TimeSection";
import { avatarAccent, initialsOf } from "./member-ui";
import { InsightRow } from "./InsightRow";

/** "Insights do Time" — item 22 do pedido: seção INDEPENDENTE de
 * "Entregas da Semana", nunca dentro do mesmo card. Responde "o que está
 * acontecendo operacionalmente com as pessoas", não repete números já
 * visíveis em outro bloco — cada frase já vem pronta de
 * `generateInsights` (`@/lib/insights-engine`), motor determinístico,
 * sem IA generativa. */
export function TeamInsights({
  insights,
  membersById,
  onOpenMember,
}: {
  insights: Insight[];
  membersById: Map<string, Member>;
  onOpenMember: (m: Member) => void;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        <Sparkles className="h-3.5 w-3.5 text-foreground/70" /> Insights do Time
      </h3>

      {insights.length === 0 ? (
        <p className="flex h-16 items-center justify-center text-center text-sm text-muted-foreground">
          Nenhum insight relevante neste período.
        </p>
      ) : (
        <div className="mt-1 divide-y divide-border">
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
                onOpenMember={m ? () => onOpenMember(m) : undefined}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
