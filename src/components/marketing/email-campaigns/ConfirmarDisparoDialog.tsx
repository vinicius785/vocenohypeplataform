import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Check, X, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  activateCampaign,
  getCampaignReadiness,
  getEmailProviderSettings,
} from "@/lib/email-campaigns.functions";
import type { getCampaignDetail } from "@/lib/email-campaigns.functions";
import { fmtDateTime } from "./email-ui-utils";

type Detail = Awaited<ReturnType<typeof getCampaignDetail>>;

/** Tela de confirmação antes de ativar a campanha — mostra o checklist
 * de prontidão (se ainda faltar algo) ou o resumo do que vai acontecer
 * (se estiver tudo pronto), nunca ativa direto sem essa revisão. */
export function ConfirmarDisparoDialog({
  open,
  onOpenChange,
  campaignId,
  recipients,
  steps,
  onActivated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaignId: string;
  recipients: Detail["recipients"];
  steps: Detail["steps"];
  onActivated: () => void;
}) {
  const readinessFn = useServerFn(getCampaignReadiness);
  const activateFn = useServerFn(activateCampaign);
  const providerFn = useServerFn(getEmailProviderSettings);

  const [missing, setMissing] = useState<string[] | null>(null);
  const [fromEmail, setFromEmail] = useState("");
  const [activating, setActivating] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMissing(null);
    void readinessFn({ data: { campaignId } }).then((r) => setMissing(r.missing));
    void providerFn().then((p) => setFromEmail(p.fromEmail));
  }, [open, campaignId, readinessFn, providerFn]);

  const firstEmailStep = [...steps]
    .sort((a, b) => a.position - b.position)
    .find((s) => s.kind === "email");
  const activeRecipients = recipients.filter((r) => r.status === "active").length;

  const activate = async () => {
    setActivating(true);
    try {
      const result = await activateFn({ data: { campaignId } });
      if (result.ok) onActivated();
      else setMissing(result.missing);
    } finally {
      setActivating(false);
    }
  };

  const ready = missing?.length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Confirmar disparo</DialogTitle>
        </DialogHeader>

        {missing === null ? (
          <div className="h-24 animate-pulse rounded-md bg-muted/30" />
        ) : ready ? (
          <div className="space-y-2 text-sm">
            <Row label="Destinatários" value={`${activeRecipients} contato(s)`} />
            <Row label="Remetente" value={fromEmail || "não configurado"} />
            <Row
              label="Primeira mensagem"
              value={firstEmailStep?.internal_name || firstEmailStep?.subject || "—"}
            />
            <Row
              label="Quando"
              value={
                firstEmailStep?.send_mode === "agendado" && firstEmailStep.scheduled_at
                  ? fmtDateTime(firstEmailStep.scheduled_at)
                  : "Assim que a campanha for ativada"
              }
            />
            {!fromEmail && (
              <p className="rounded-md bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-700 dark:text-amber-400">
                O remetente não está configurado na aba Configuração — o envio vai falhar até isso
                ser preenchido.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground">Ainda falta configurar antes de ativar:</p>
            {missing.map((m) => (
              <div key={m} className="flex items-center gap-2 text-sm text-foreground">
                <X className="h-3.5 w-3.5 shrink-0 text-destructive" /> {m}
              </div>
            ))}
          </div>
        )}

        <DialogFooter>
          {ready && (
            <button
              type="button"
              onClick={() => void activate()}
              disabled={activating}
              className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {activating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Check className="h-3.5 w-3.5" />
              )}
              {activating ? "Ativando..." : "Ativar campanha"}
            </button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/60 py-1.5 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="truncate font-medium text-foreground">{value}</span>
    </div>
  );
}
