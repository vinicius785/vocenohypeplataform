import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import {
  getEmailProviderSettings,
  saveEmailProviderSettings,
} from "@/lib/email-campaigns.functions";

export function ConfigTab() {
  const getFn = useServerFn(getEmailProviderSettings);
  const saveFn = useServerFn(saveEmailProviderSettings);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [hasWebhookSecret, setHasWebhookSecret] = useState(false);
  const [fromEmail, setFromEmail] = useState("");
  const [fromName, setFromName] = useState("");
  const [replyTo, setReplyTo] = useState("");
  const [sendingDomain, setSendingDomain] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getFn()
      .then((r) => {
        setHasApiKey(r.hasApiKey);
        setHasWebhookSecret(r.hasWebhookSecret);
        setFromEmail(r.fromEmail);
        setFromName(r.fromName);
        setReplyTo(r.replyTo);
        setSendingDomain(r.sendingDomain);
      })
      .finally(() => setLoading(false));
  }, [getFn]);

  const save = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await saveFn({
        data: {
          fromEmail,
          fromName,
          replyTo,
          sendingDomain,
          apiKey: apiKey || undefined,
          webhookSecret: webhookSecret || undefined,
        },
      });
      if (apiKey) setHasApiKey(true);
      if (webhookSecret) setHasWebhookSecret(true);
      setApiKey("");
      setWebhookSecret("");
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="h-40 animate-pulse rounded-lg bg-muted/30" />;

  const webhookUrl =
    typeof window !== "undefined" ? `${window.location.origin}/api/webhooks/resend` : "";

  return (
    <div className="max-w-xl space-y-6">
      <div className="space-y-2.5 rounded-lg border border-border bg-background p-5">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Provedor de e-mail (Resend)</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Chave de API e remetente usados pra enviar os e-mails das campanhas.
          </p>
        </div>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-foreground">Chave de API da Resend</span>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={hasApiKey ? "•••••••••••••••• (já configurada)" : "re_xxxxxxxxxxxxxxxx"}
            className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs outline-none focus:ring-1 focus:ring-ring"
          />
        </label>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <label className="block space-y-1">
            <span className="text-xs font-medium text-foreground">E-mail de envio</span>
            <input
              type="email"
              value={fromEmail}
              onChange={(e) => setFromEmail(e.target.value)}
              placeholder="contato@seudominio.com.br"
              className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs outline-none focus:ring-1 focus:ring-ring"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-foreground">Nome do remetente</span>
            <input
              value={fromName}
              onChange={(e) => setFromName(e.target.value)}
              placeholder="Você no Hype"
              className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs outline-none focus:ring-1 focus:ring-ring"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-foreground">Responder para (opcional)</span>
            <input
              type="email"
              value={replyTo}
              onChange={(e) => setReplyTo(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs outline-none focus:ring-1 focus:ring-ring"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-foreground">Domínio de envio</span>
            <input
              value={sendingDomain}
              onChange={(e) => setSendingDomain(e.target.value)}
              placeholder="seudominio.com.br"
              className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs outline-none focus:ring-1 focus:ring-ring"
            />
          </label>
        </div>
        <p className="text-[11px] text-muted-foreground">
          O domínio precisa estar verificado na Resend (registros DNS SPF/DKIM) antes de enviar de
          verdade.
        </p>
      </div>

      <div className="space-y-2.5 rounded-lg border border-border bg-background p-5">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Webhook de resultados</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Pra "Resultados" mostrar entregas/aberturas/cliques de verdade, crie um webhook no
            dashboard da Resend apontando pra URL abaixo e cole aqui o segredo de assinatura que
            eles geram.
          </p>
        </div>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-foreground">URL do webhook</span>
          <input
            readOnly
            value={webhookUrl}
            onFocus={(e) => e.target.select()}
            className="w-full rounded-md border border-border bg-muted/30 px-2.5 py-1.5 font-mono text-xs outline-none"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-foreground">
            Segredo de assinatura (whsec_...)
          </span>
          <input
            type="password"
            value={webhookSecret}
            onChange={(e) => setWebhookSecret(e.target.value)}
            placeholder={hasWebhookSecret ? "•••••••••••••••• (já configurado)" : "whsec_..."}
            className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs outline-none focus:ring-1 focus:ring-ring"
          />
        </label>
      </div>

      <button
        type="button"
        onClick={() => void save()}
        disabled={saving || !fromEmail}
        className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
        {saved ? "Salvo!" : saving ? "Salvando..." : "Salvar"}
      </button>
    </div>
  );
}
