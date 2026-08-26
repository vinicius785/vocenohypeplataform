import { useMemo } from "react";
import type { getCampaignDetail, listCampaignSends } from "@/lib/email-campaigns.functions";
import { fmtDateTime } from "./email-ui-utils";

type Detail = Awaited<ReturnType<typeof getCampaignDetail>>;
type Activity = Detail["activity"][number];
type Send = Awaited<ReturnType<typeof listCampaignSends>>[number];

/** Feed cronológico da campanha — combina os eventos administrativos
 * (email_campaign_activity: criada, ativada, pausada, contatos
 * adicionados...) com os envios de verdade (email_sends), pra dar o
 * "o que já aconteceu" numa lista só. */
export function HistoricoPanel({ activity, sends }: { activity: Activity[]; sends: Send[] }) {
  const events = useMemo(() => {
    const fromActivity = activity.map((a) => ({ at: a.created_at, text: a.message }));
    const fromSends = sends.map((s) => ({
      at: s.sent_at ?? s.created_at,
      text:
        s.status === "failed"
          ? `Falha ao enviar "${s.subject}" para ${s.to_email}: ${s.error ?? "erro desconhecido"}`
          : s.status === "bounced"
            ? `"${s.subject}" retornou (bounce) para ${s.to_email}`
            : `"${s.subject}" enviado para ${s.to_email}`,
    }));
    return [...fromActivity, ...fromSends].sort(
      (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
    );
  }, [activity, sends]);

  if (events.length === 0)
    return <p className="text-xs text-muted-foreground">Nenhuma atividade ainda.</p>;

  return (
    <div className="space-y-1">
      {events.map((e, i) => (
        <div
          key={i}
          className="flex items-baseline gap-3 border-b border-border/60 py-2 text-xs last:border-0"
        >
          <span className="shrink-0 text-muted-foreground">{fmtDateTime(e.at)}</span>
          <span className="text-foreground">{e.text}</span>
        </div>
      ))}
    </div>
  );
}
