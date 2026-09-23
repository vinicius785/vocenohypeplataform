import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  CalendarDays,
  Zap,
  Webhook,
  Send,
  RefreshCw,
  Check,
  Copy,
  Eye,
  EyeOff,
  Plus,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useConfirm } from "@/hooks/use-confirm";
import {
  getLeadsWebhookConfig,
  regenerateLeadsWebhookSecret,
  listOutgoingWebhooks,
  createOutgoingWebhook,
  toggleOutgoingWebhook,
  deleteOutgoingWebhook,
} from "@/lib/integrations.functions";
import { OUTGOING_WEBHOOK_EVENTS } from "@/lib/outgoing-webhooks";
import {
  startGoogleOAuth,
  getGoogleConnectionStatus,
  disconnectGoogleCalendar,
} from "@/lib/google-calendar.functions";
import { SettingsSectionHeader } from "./settings-shared";

function IntegracoesCategoria({
  icon,
  title,
  description,
  badge,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  badge?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-foreground/5 text-foreground">
          {icon}
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-foreground">{title}</h2>
            {badge && (
              <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
                {badge}
              </Badge>
            )}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

export function IntegracoesSection() {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user || cancelled) return;
      const { data: ok } = await supabase.rpc("is_admin", { _user_id: u.user.id });
      if (!cancelled) setIsAdmin(Boolean(ok));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-8">
      <SettingsSectionHeader
        icon={<Webhook className="h-4 w-4" />}
        title="Integrações"
        description="Conecte a plataforma a ferramentas externas."
      />

      <IntegracoesCategoria
        icon={<CalendarDays className="h-5 w-5" />}
        title="Calendário"
        description="Sincronização das reuniões da plataforma com o Google Agenda — cada pessoa conecta a própria conta; as reuniões que ela cria sincronizam com ela."
      >
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <GoogleCalendarCard />
        </div>
      </IntegracoesCategoria>

      <IntegracoesCategoria
        icon={<Zap className="h-5 w-5" />}
        title="Automações e webhooks"
        description="Troca de dados com ferramentas externas (Make, Zapier, Typeform, Slack...)."
        badge="Administradores"
      >
        {isAdmin === false ? (
          <AdminOnlyNotice />
        ) : isAdmin === null ? (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <IntegrationCardSkeleton />
            <IntegrationCardSkeleton />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <LeadsWebhookCard />
            <OutgoingWebhooksCard />
          </div>
        )}
      </IntegracoesCategoria>
    </div>
  );
}

function AdminOnlyNotice() {
  return (
    <div className="rounded-lg border border-dashed border-border bg-background p-4 text-center">
      <p className="text-xs text-muted-foreground">
        Apenas administradores podem ver e gerenciar esta integração.
      </p>
    </div>
  );
}

function IntegrationCardSkeleton() {
  return <div className="h-24 animate-pulse rounded-lg border border-border bg-muted/30" />;
}

function GoogleCalendarIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <path fill="#4285F4" d="M42 22H26V6h11a5 5 0 0 1 5 5z" />
      <path fill="#EA4335" d="M26 6H11a5 5 0 0 0-5 5v11h20z" />
      <path fill="#FBBC05" d="M6 26v11a5 5 0 0 0 5 5h11V26z" />
      <path fill="#34A853" d="M26 26v16h11a5 5 0 0 0 5-5V26z" />
      <rect x="14" y="14" width="20" height="20" fill="#fff" />
      <text
        x="24"
        y="29"
        textAnchor="middle"
        fontSize="14"
        fontWeight="700"
        fill="#4285F4"
        fontFamily="Arial, sans-serif"
      >
        31
      </text>
    </svg>
  );
}

function GoogleCalendarCard() {
  const startFn = useServerFn(startGoogleOAuth);
  const statusFn = useServerFn(getGoogleConnectionStatus);
  const disconnectFn = useServerFn(disconnectGoogleCalendar);
  const { confirm, confirmDialog } = useConfirm();

  const [status, setStatus] = useState<
    { state: "loading" } | { state: "disconnected" } | { state: "connected"; email?: string | null }
  >({ state: "loading" });
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [callbackNotice, setCallbackNotice] = useState<"connected" | "error" | null>(null);

  const refresh = useCallback(() => {
    statusFn()
      .then((r) =>
        setStatus(r.connected ? { state: "connected", email: r.email } : { state: "disconnected" }),
      )
      .catch(() => setStatus({ state: "disconnected" }));
  }, [statusFn]);

  useEffect(() => {
    refresh();
    const params = new URLSearchParams(window.location.search);
    const google = params.get("google");
    if (google === "connected" || google === "error") {
      setCallbackNotice(google);
      params.delete("google");
      const qs = params.toString();
      window.history.replaceState(null, "", window.location.pathname + (qs ? `?${qs}` : ""));
    }
  }, [refresh]);

  const connect = async () => {
    setConnecting(true);
    try {
      const { url } = await startFn();
      window.location.href = url;
    } catch {
      setConnecting(false);
    }
  };

  const disconnect = async () => {
    const ok = await confirm(
      "Desconectar sua conta do Google Agenda? As reuniões param de sincronizar.",
    );
    if (!ok) return;
    setDisconnecting(true);
    try {
      await disconnectFn();
      setStatus({ state: "disconnected" });
    } finally {
      setDisconnecting(false);
    }
  };

  return (
    <IntegrationCard
      icon={<GoogleCalendarIcon className="h-5 w-5" />}
      title="Google Agenda"
      description="Conecte sua conta: reuniões que você cria na plataforma aparecem no seu Google Agenda, e eventos criados direto no Google aparecem aqui — nos dois sentidos, em poucos minutos."
      status={
        status.state === "connected"
          ? "connected"
          : status.state === "disconnected"
            ? "disconnected"
            : undefined
      }
    >
      {confirmDialog}
      {callbackNotice === "error" && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          Não foi possível conectar sua conta Google. Tente novamente.
        </p>
      )}
      {status.state === "loading" && <p className="text-xs text-muted-foreground">Carregando...</p>}
      {status.state === "disconnected" && (
        <Button type="button" size="sm" onClick={() => void connect()} disabled={connecting}>
          {connecting ? "Redirecionando..." : "Conectar Google Agenda"}
        </Button>
      )}
      {status.state === "connected" && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            Conectado{status.email ? ` como ${status.email}` : ""}.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void disconnect()}
            disabled={disconnecting}
          >
            {disconnecting ? "Desconectando..." : "Desconectar"}
          </Button>
        </div>
      )}
    </IntegrationCard>
  );
}

const INTEGRATION_STATUS_META: Record<
  "connected" | "disconnected" | "error",
  { dot: string; label: string }
> = {
  connected: { dot: "bg-emerald-500", label: "Conectado" },
  disconnected: { dot: "bg-muted-foreground/40", label: "Não conectado" },
  error: { dot: "bg-destructive", label: "Erro" },
};

function IntegrationCard({
  icon,
  title,
  description,
  status,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  status?: "connected" | "disconnected" | "error";
  children: React.ReactNode;
}) {
  const statusMeta = status ? INTEGRATION_STATUS_META[status] : null;
  return (
    <div className="space-y-4 rounded-lg border border-border bg-background p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-foreground">
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground">{title}</h3>
            {statusMeta && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
                <span className={`h-1.5 w-1.5 rounded-full ${statusMeta.dot}`} />
                {statusMeta.label}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

function CopyField({ value, masked }: { value: string; masked?: boolean }) {
  const [copied, setCopied] = useState(false);
  const [reveal, setReveal] = useState(false);
  const copy = () => {
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  const shown = masked && !reveal ? "•".repeat(Math.min(28, value.length)) : value;
  return (
    <div className="flex items-center gap-1.5 rounded-md border border-border bg-muted/30 px-2.5 py-1.5">
      <code className="min-w-0 flex-1 truncate text-xs text-foreground">{shown}</code>
      {masked && (
        <button
          type="button"
          onClick={() => setReveal((v) => !v)}
          className="shrink-0 text-muted-foreground hover:text-foreground"
          aria-label={reveal ? "Ocultar" : "Mostrar"}
        >
          {reveal ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        </button>
      )}
      <button
        type="button"
        onClick={copy}
        className="shrink-0 text-muted-foreground hover:text-foreground"
        aria-label="Copiar"
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

function LeadsWebhookCard() {
  const getConfigFn = useServerFn(getLeadsWebhookConfig);
  const regenFn = useServerFn(regenerateLeadsWebhookSecret);
  const [secret, setSecret] = useState<string | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "forbidden">("loading");
  const [confirmingRegen, setConfirmingRegen] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  useEffect(() => {
    getConfigFn()
      .then((r) => {
        setSecret(r.secret);
        setStatus("ready");
      })
      .catch(() => setStatus("forbidden"));
  }, [getConfigFn]);

  const url =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/public/leads`
      : "/api/public/leads";

  const regenerate = async () => {
    setRegenerating(true);
    try {
      const r = await regenFn();
      setSecret(r.secret);
      setConfirmingRegen(false);
    } finally {
      setRegenerating(false);
    }
  };

  return (
    <IntegrationCard
      icon={<Webhook className="h-4 w-4" />}
      title="Webhook de leads"
      description='Cole esta URL em formulários externos (Typeform, Make, Zapier, site institucional) para criar leads automaticamente na aba Comercial, na coluna "Lead".'
    >
      {status === "forbidden" && (
        <p className="text-xs text-muted-foreground">
          Apenas administradores podem ver e gerenciar esta integração.
        </p>
      )}
      {status === "loading" && <p className="text-xs text-muted-foreground">Carregando...</p>}
      {status === "ready" && secret && (
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              URL
            </label>
            <CopyField value={url} />
          </div>
          <div className="space-y-1">
            <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Chave (header X-Webhook-Secret)
            </label>
            <CopyField value={secret} masked />
          </div>

          {confirmingRegen ? (
            <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2">
              <p className="flex-1 text-[11px] text-destructive">
                Gerar uma nova chave invalida a atual — atualize os formulários que já usam esse
                webhook.
              </p>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => void regenerate()}
                disabled={regenerating}
                className="shrink-0"
              >
                Confirmar
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfirmingRegen(false)}
                className="shrink-0"
              >
                Cancelar
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setConfirmingRegen(true)}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Gerar nova chave
            </Button>
          )}

          <details className="rounded-md border border-border/60 bg-muted/20 px-3 py-2">
            <summary className="cursor-pointer text-xs font-medium text-foreground">
              Exemplo de requisição
            </summary>
            <pre className="mt-2 overflow-x-auto text-[11px] text-muted-foreground">
              {`curl -X POST ${url} \\
  -H "Content-Type: application/json" \\
  -H "X-Webhook-Secret: ${secret}" \\
  -d '{"name":"Nome do lead","email":"lead@exemplo.com","company":"Empresa"}'`}
            </pre>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Campo obrigatório: <code>name</code>. Opcionais: <code>email</code>,{" "}
              <code>phone</code>, <code>company</code>, <code>role</code>, <code>industry</code>,{" "}
              <code>monthly_budget</code>, <code>urgency</code>, <code>notes</code>.
            </p>
          </details>
        </div>
      )}
    </IntegrationCard>
  );
}

function OutgoingWebhooksCard() {
  type Hook = { id: string; url: string; events: string[]; active: boolean };
  const listFn = useServerFn(listOutgoingWebhooks);
  const createFn = useServerFn(createOutgoingWebhook);
  const toggleFn = useServerFn(toggleOutgoingWebhook);
  const deleteFn = useServerFn(deleteOutgoingWebhook);

  const [hooks, setHooks] = useState<Hook[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(() => {
    void listFn()
      .then((rows) => setHooks(rows as Hook[]))
      .catch(() => undefined)
      .finally(() => setLoaded(true));
  }, [listFn]);

  useEffect(refresh, [refresh]);

  const toggleEvent = (key: string) =>
    setEvents((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const submit = async () => {
    if (!url.trim() || events.size === 0) return;
    setSaving(true);
    setError("");
    try {
      await createFn({ data: { url: url.trim(), events: Array.from(events) } });
      setUrl("");
      setEvents(new Set());
      refresh();
    } catch {
      setError("Não foi possível salvar. Confira se a URL é válida.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <IntegrationCard
      icon={<Send className="h-4 w-4" />}
      title="Webhooks de saída"
      description="Envie um POST para uma URL externa (Zapier, Make, n8n...) sempre que um evento acontecer aqui dentro."
    >
      {loaded && hooks.length > 0 && (
        <ul className="space-y-2">
          {hooks.map((h) => (
            <li
              key={h.id}
              className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/20 px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-foreground">{h.url}</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {h.events.map((e) => (
                    <span
                      key={e}
                      className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                    >
                      {OUTGOING_WEBHOOK_EVENTS.find((x) => x.key === e)?.label ?? e}
                    </span>
                  ))}
                </div>
              </div>
              <button
                type="button"
                onClick={() =>
                  void toggleFn({ data: { id: h.id, active: !h.active } }).then(refresh)
                }
                className={`shrink-0 rounded-md border px-2 py-1 text-[10px] font-medium ${
                  h.active
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                    : "border-border text-muted-foreground"
                }`}
              >
                {h.active ? "Ativo" : "Pausado"}
              </button>
              <button
                type="button"
                onClick={() => void deleteFn({ data: { id: h.id } }).then(refresh)}
                aria-label="Remover"
                className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-2 border-t border-border/60 pt-3">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://hooks.zapier.com/..."
          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
        />
        <div className="flex flex-wrap gap-2">
          {OUTGOING_WEBHOOK_EVENTS.map((e) => (
            <label
              key={e.key}
              className="flex cursor-pointer items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs"
            >
              <input
                type="checkbox"
                checked={events.has(e.key)}
                onChange={() => toggleEvent(e.key)}
                className="h-3.5 w-3.5 rounded border-input"
              />
              {e.label}
            </label>
          ))}
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
        <Button
          type="button"
          size="sm"
          onClick={() => void submit()}
          disabled={saving || !url.trim() || events.size === 0}
        >
          <Plus className="h-3.5 w-3.5" />
          {saving ? "Adicionando..." : "Adicionar webhook"}
        </Button>
      </div>
    </IntegrationCard>
  );
}
