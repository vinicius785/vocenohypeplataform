import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, XCircle, Clock, Mail } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  markRecipientResponded,
  type getCampaignDetail,
  type listCampaignSends,
} from "@/lib/email-campaigns.functions";
import {
  RECIPIENT_SOURCE_LABEL,
  RECIPIENT_STATUS_LABEL,
  type RecipientSource,
} from "@/lib/email-campaigns-constants";
import { fmtDateTime } from "./email-ui-utils";

type Detail = Awaited<ReturnType<typeof getCampaignDetail>>;
type Recipient = Detail["recipients"][number];
type Send = Awaited<ReturnType<typeof listCampaignSends>>[number];

/** Painel lateral com a linha do tempo de um contato — "o que já foi
 * enviado pra essa pessoa, o que aconteceu com cada envio". */
export function ContatoDetalhe({
  open,
  onOpenChange,
  recipient,
  sends,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recipient: Recipient | null;
  sends: Send[];
  onChanged: () => void;
}) {
  const respondedFn = useServerFn(markRecipientResponded);
  const recipientSends = recipient
    ? sends
        .filter((s) => s.recipient_id === recipient.id)
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    : [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        {recipient && (
          <>
            <SheetHeader>
              <SheetTitle>{recipient.name || recipient.email}</SheetTitle>
            </SheetHeader>
            <div className="mt-3 space-y-4 pb-8">
              <div className="space-y-1 text-xs text-muted-foreground">
                <p>{recipient.email}</p>
                <p>
                  {RECIPIENT_SOURCE_LABEL[recipient.source as RecipientSource]} · adicionado em{" "}
                  {fmtDateTime(recipient.added_at)}
                </p>
                <p>Status: {RECIPIENT_STATUS_LABEL[recipient.status] ?? recipient.status}</p>
              </div>

              {recipient.status === "active" && (
                <button
                  type="button"
                  onClick={() => void respondedFn({ data: { id: recipient.id } }).then(onChanged)}
                  className="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
                >
                  Marcar como respondido
                </button>
              )}

              <div className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Histórico de envios
                </h4>
                {recipientSends.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Nenhum e-mail enviado ainda.</p>
                ) : (
                  <div className="space-y-2">
                    {recipientSends.map((s) => (
                      <div key={s.id} className="rounded-md border border-border p-2.5 text-xs">
                        <div className="flex items-center gap-1.5 font-medium text-foreground">
                          <Mail className="h-3.5 w-3.5 shrink-0" /> {s.subject}
                        </div>
                        <div className="mt-1 space-y-0.5 text-muted-foreground">
                          <SendEvent icon={CheckCircle2} label="Enviado" at={s.sent_at} />
                          <SendEvent icon={CheckCircle2} label="Entregue" at={s.delivered_at} />
                          <SendEvent icon={CheckCircle2} label="Aberto" at={s.opened_at} />
                          <SendEvent icon={CheckCircle2} label="Clicou" at={s.clicked_at} />
                          {s.status === "failed" && (
                            <p className="flex items-center gap-1 text-destructive">
                              <XCircle className="h-3 w-3" /> Falhou:{" "}
                              {s.error ?? "erro desconhecido"}
                            </p>
                          )}
                          {s.status === "bounced" && (
                            <p className="flex items-center gap-1 text-destructive">
                              <XCircle className="h-3 w-3" /> Retornou (bounce)
                            </p>
                          )}
                          {s.status === "queued" && (
                            <p className="flex items-center gap-1">
                              <Clock className="h-3 w-3" /> Na fila
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function SendEvent({
  icon: Icon,
  label,
  at,
}: {
  icon: typeof CheckCircle2;
  label: string;
  at: string | null;
}) {
  if (!at) return null;
  return (
    <p className="flex items-center gap-1">
      <Icon className="h-3 w-3 text-emerald-600 dark:text-emerald-400" /> {label} ·{" "}
      {fmtDateTime(at)}
    </p>
  );
}
