import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Check,
  Copy,
  Eye,
  EyeOff,
  Plus,
  RefreshCw,
  Search,
  Send,
  Trash2,
  Webhook,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/shared/EmptyState";
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
import { timeAgo } from "@/components/metas/metas-ui-utils";
import {
  startGoogleOAuth,
  getGoogleConnectionStatus,
  disconnectGoogleCalendar,
  runGoogleCalendarSync,
} from "@/lib/google-calendar.functions";
import { SettingsSectionHeader } from "./settings-shared";
import {
  INTEGRATIONS,
  filterIntegrations,
  integrationCardState,
  integrationCategories,
  type CardState,
  type IntegrationCategory,
  type IntegrationDef,
  type IntegrationId,
} from "./integracoes-catalog";

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

type GoogleCardStatus =
  | { state: "loading" }
  | { state: "disconnected" }
  | {
      state: "connected" | "attention";
      email?: string | null;
      lastSyncedAt?: string | null;
      lastError?: string | null;
    };

/** Estado da conexão Google, buscado UMA vez e usado pelo card do catálogo e pelo detalhe. */
function useGoogleStatus() {
  const statusFn = useServerFn(getGoogleConnectionStatus);
  const [status, setStatus] = useState<GoogleCardStatus>({ state: "loading" });
  const refresh = useCallback(() => {
    statusFn()
      .then((r) => {
        if (!r.connected) {
          setStatus({ state: "disconnected" });
          return;
        }
        setStatus({
          // refresh_token inválido (revogado/expirado) vira "Atenção necessária" na hora.
          state: r.needsReconnect ? "attention" : "connected",
          email: r.email,
          lastSyncedAt: r.lastSyncedAt,
          lastError: r.lastError,
        });
      })
      .catch(() => setStatus({ state: "disconnected" }));
  }, [statusFn]);
  return { status, setStatus, refresh };
}

const TONE_DOT: Record<CardState["tone"], string> = {
  ok: "bg-emerald-500",
  warn: "bg-warning",
  off: "bg-muted-foreground/40",
  muted: "bg-muted-foreground/30",
};

function IntegrationIcon({ id, className }: { id: IntegrationId; className?: string }) {
  if (id === "google-agenda") return <GoogleCalendarIcon className={className} />;
  if (id === "webhooks-saida") return <Send className={className} aria-hidden="true" />;
  return <Webhook className={className} aria-hidden="true" />;
}

/** Card do CATÁLOGO: identifica (ícone, nome, uma linha) e mostra o estado. Nada de campos. */
function CatalogCard({
  def,
  state,
  onOpen,
}: {
  def: IntegrationDef;
  state: CardState | undefined;
  onOpen: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Abrir ${def.name}${state ? `, ${state.label}` : ""}`}
        className="group flex h-full min-h-[10.5rem] w-full cursor-pointer flex-col rounded-xl border border-border/60 bg-card p-4 text-left transition-colors hover:border-foreground/25 hover:bg-muted/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-muted text-foreground ring-1 ring-border/60">
          <IntegrationIcon id={def.id} className="h-5 w-5" />
        </span>
        <span className="mt-auto block min-w-0 space-y-0.5 pt-4">
          <span className="line-clamp-2 block text-sm font-semibold text-foreground">
            {def.name}
          </span>
          <span className="line-clamp-2 block text-xs text-text-secondary">{def.summary}</span>
          <span className="flex h-4 items-center gap-1.5 pt-1 text-[11px] font-medium text-text-secondary">
            {state && (
              <>
                <span
                  className={`h-1.5 w-1.5 rounded-full ${TONE_DOT[state.tone]}`}
                  aria-hidden="true"
                />
                {state.label}
              </>
            )}
          </span>
        </span>
      </button>
    </li>
  );
}

/** Detalhe de UMA integração (abre ao selecionar): cabeçalho + estado + configuração. */
function IntegrationDetail({
  def,
  state,
  onClose,
  children,
}: {
  def: IntegrationDef;
  state: CardState | undefined;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent mobileFullScreen className="max-w-xl content-start gap-5">
        <DialogHeader className="flex-row items-start gap-3 space-y-0 text-left">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-muted ring-1 ring-border/60">
            <IntegrationIcon id={def.id} className="h-6 w-6" />
          </span>
          <div className="min-w-0 space-y-1 pr-6">
            <DialogTitle className="text-lg">{def.name}</DialogTitle>
            {state && (
              <p className="flex items-center gap-1.5 text-xs font-medium text-text-secondary">
                <span
                  className={`h-1.5 w-1.5 rounded-full ${TONE_DOT[state.tone]}`}
                  aria-hidden="true"
                />
                {state.label}
              </p>
            )}
            <DialogDescription>{def.description}</DialogDescription>
          </div>
        </DialogHeader>
        <div className="border-t border-border/60 pt-5">{children}</div>
      </DialogContent>
    </Dialog>
  );
}

function AdminOnlyNotice() {
  return (
    <p className="text-sm text-text-secondary">
      Apenas administradores podem ver e gerenciar esta integração.
    </p>
  );
}

export function IntegracoesSection() {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<IntegrationCategory | "todas">("todas");
  const [openId, setOpenId] = useState<IntegrationId | null>(null);
  const google = useGoogleStatus();
  const listFn = useServerFn(listOutgoingWebhooks);
  const [outgoingActive, setOutgoingActive] = useState<number | null>(null);

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

  // Contagem de webhooks de saída só para o estado do card (e só para admin).
  const refreshOutgoing = useCallback(() => {
    void listFn()
      .then((rows) =>
        setOutgoingActive((rows as { active: boolean }[]).filter((r) => r.active).length),
      )
      .catch(() => setOutgoingActive(0));
  }, [listFn]);
  useEffect(() => {
    if (isAdmin) refreshOutgoing();
  }, [isAdmin, refreshOutgoing]);

  // Volta do OAuth do Google (?google=connected|error): atualiza o estado e abre o detalhe.
  const [callbackNotice, setCallbackNotice] = useState<"connected" | "error" | null>(null);
  useEffect(() => {
    google.refresh();
    const params = new URLSearchParams(window.location.search);
    const g = params.get("google");
    if (g === "connected" || g === "error") {
      setCallbackNotice(g);
      setOpenId("google-agenda");
      params.delete("google");
      const qs = params.toString();
      window.history.replaceState(null, "", window.location.pathname + (qs ? `?${qs}` : ""));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só no mount
  }, []);

  const stateOf = (id: IntegrationId) =>
    integrationCardState(id, {
      isAdmin,
      google: google.status.state,
      outgoingActive,
    });

  const categories = integrationCategories(INTEGRATIONS);
  const filtered = useMemo(
    () => filterIntegrations(INTEGRATIONS, query, category),
    [query, category],
  );
  const openDef = INTEGRATIONS.find((i) => i.id === openId) ?? null;

  return (
    <div className="space-y-6">
      <SettingsSectionHeader
        icon={<Webhook className="h-4 w-4" />}
        title="Integrações"
        description="Conecte a plataforma às ferramentas que sua equipe já utiliza."
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[14rem] flex-1 sm:max-w-sm">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar integração..."
            aria-label="Buscar integração"
            className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand"
          />
        </div>
        <div className="flex flex-wrap gap-1" role="group" aria-label="Categorias">
          {(["todas", ...categories] as const).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              aria-pressed={category === c}
              className={`h-8 cursor-pointer rounded-md px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                category === c
                  ? "bg-brand-subtle text-text-brand"
                  : "text-text-secondary hover:bg-muted hover:text-foreground"
              }`}
            >
              {c === "todas" ? "Todas" : c}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          compact
          icon={<Search className="h-5 w-5" />}
          title="Nenhuma integração encontrada."
          secondaryAction={{
            label: "Limpar busca",
            onClick: () => {
              setQuery("");
              setCategory("todas");
            },
          }}
        />
      ) : (
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
          {filtered.map((def) => (
            <CatalogCard
              key={def.id}
              def={def}
              state={stateOf(def.id)}
              onOpen={() => setOpenId(def.id)}
            />
          ))}
        </ul>
      )}

      {openDef && (
        <IntegrationDetail
          def={openDef}
          state={stateOf(openDef.id)}
          onClose={() => {
            setOpenId(null);
            setCallbackNotice(null);
          }}
        >
          {openDef.id === "google-agenda" && (
            <GoogleCalendarPanel google={google} callbackNotice={callbackNotice} />
          )}
          {openDef.id === "webhook-leads" &&
            (isAdmin === false ? (
              <AdminOnlyNotice />
            ) : (
              <LeadsWebhookPanel enabled={isAdmin === true} />
            ))}
          {openDef.id === "webhooks-saida" &&
            (isAdmin === false ? (
              <AdminOnlyNotice />
            ) : (
              <OutgoingWebhooksPanel enabled={isAdmin === true} onChanged={refreshOutgoing} />
            ))}
        </IntegrationDetail>
      )}
    </div>
  );
}

function GoogleCalendarPanel({
  google,
  callbackNotice,
}: {
  google: ReturnType<typeof useGoogleStatus>;
  callbackNotice: "connected" | "error" | null;
}) {
  const startFn = useServerFn(startGoogleOAuth);
  const disconnectFn = useServerFn(disconnectGoogleCalendar);
  const syncNowFn = useServerFn(runGoogleCalendarSync);
  const { confirm, confirmDialog } = useConfirm();
  const { status, setStatus, refresh } = google;
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);

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

  const syncNow = async () => {
    setSyncing(true);
    try {
      await syncNowFn();
    } catch {
      /* erro real já fica registrado em last_error — refresh() abaixo mostra */
    } finally {
      refresh();
      setSyncing(false);
    }
  };

  return (
    <div className="space-y-4">
      {confirmDialog}
      {callbackNotice === "error" && (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
        >
          Não foi possível conectar sua conta Google. Tente novamente.
        </p>
      )}
      {callbackNotice === "connected" && status.state === "connected" && (
        <p role="status" className="text-xs text-text-secondary">
          Conta conectada com sucesso.
        </p>
      )}
      {status.state === "loading" && <p className="text-sm text-text-secondary">Carregando...</p>}
      {status.state === "disconnected" && (
        <Button type="button" onClick={() => void connect()} disabled={connecting}>
          {connecting ? "Redirecionando..." : "Conectar Google Agenda"}
        </Button>
      )}
      {status.state === "attention" && (
        <div className="space-y-3">
          <p className="rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-xs text-warning-soft-foreground">
            {status.lastError ??
              "O acesso à sua conta Google parece ter sido revogado ou expirado. Reconecte pra voltar a sincronizar."}
          </p>
          <p className="text-sm text-text-secondary">
            {status.email ? `Conta: ${status.email}` : "Conta conectada anteriormente"}
          </p>
          <div className="flex items-center gap-2">
            <Button type="button" onClick={() => void connect()} disabled={connecting}>
              {connecting ? "Redirecionando..." : "Reconectar"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void disconnect()}
              disabled={disconnecting}
            >
              {disconnecting ? "Desconectando..." : "Desconectar"}
            </Button>
          </div>
        </div>
      )}
      {status.state === "connected" && (
        <div className="space-y-3">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-text-secondary">
              Conta
            </p>
            <p className="mt-0.5 text-sm text-foreground">{status.email ?? "Conta conectada"}</p>
            {status.lastSyncedAt && (
              <p className="mt-0.5 text-xs text-text-secondary">
                Última sincronização: {timeAgo(status.lastSyncedAt)}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => void syncNow()}
              disabled={syncing}
            >
              {syncing ? "Sincronizando..." : "Sincronizar agora"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => void disconnect()}
              disabled={disconnecting}
              className="text-destructive hover:text-destructive"
            >
              {disconnecting ? "Desconectando..." : "Desconectar"}
            </Button>
          </div>
        </div>
      )}
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-[11px] font-medium uppercase tracking-wide text-text-secondary">{label}</p>
      {children}
    </div>
  );
}

function LeadsWebhookPanel({ enabled }: { enabled: boolean }) {
  const getConfigFn = useServerFn(getLeadsWebhookConfig);
  const regenFn = useServerFn(regenerateLeadsWebhookSecret);
  const [secret, setSecret] = useState<string | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "forbidden">("loading");
  const [confirmingRegen, setConfirmingRegen] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    getConfigFn()
      .then((r) => {
        setSecret(r.secret);
        setStatus("ready");
      })
      .catch(() => setStatus("forbidden"));
  }, [getConfigFn, enabled]);

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

  if (status === "forbidden") return <AdminOnlyNotice />;
  if (status === "loading") return <p className="text-sm text-text-secondary">Carregando...</p>;
  if (!secret) return null;

  return (
    <div className="space-y-4">
      <Field label="Endpoint">
        <CopyField value={url} />
      </Field>
      <Field label="Chave secreta (header X-Webhook-Secret)">
        <CopyField value={secret} masked />
      </Field>

      {confirmingRegen ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2">
          <p className="min-w-0 flex-1 text-xs text-destructive">
            Gerar uma nova chave invalida a atual — atualize os formulários que já usam esse
            webhook.
          </p>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => void regenerate()}
            disabled={regenerating}
          >
            {regenerating ? "Gerando..." : "Confirmar"}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setConfirmingRegen(false)}>
            Cancelar
          </Button>
        </div>
      ) : (
        <Button type="button" variant="outline" size="sm" onClick={() => setConfirmingRegen(true)}>
          <RefreshCw className="h-3.5 w-3.5" />
          Gerar nova chave
        </Button>
      )}

      <details className="rounded-md border border-border/60 bg-muted/20 px-3 py-2">
        <summary className="cursor-pointer text-sm font-medium text-foreground">
          Ver exemplo de requisição
        </summary>
        <pre className="mt-2 overflow-x-auto text-[11px] text-muted-foreground">
          {`curl -X POST ${url} \\
  -H "Content-Type: application/json" \\
  -H "X-Webhook-Secret: ${secret}" \\
  -d '{"name":"Nome do lead","email":"lead@exemplo.com","company":"Empresa"}'`}
        </pre>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Campo obrigatório: <code>name</code>. Opcionais: <code>email</code>, <code>phone</code>,{" "}
          <code>company</code>, <code>role</code>, <code>industry</code>,{" "}
          <code>monthly_budget</code>, <code>urgency</code>, <code>notes</code>.
        </p>
      </details>
    </div>
  );
}

function OutgoingWebhooksPanel({
  enabled,
  onChanged,
}: {
  enabled: boolean;
  onChanged: () => void;
}) {
  type Hook = { id: string; url: string; events: string[]; active: boolean };
  const listFn = useServerFn(listOutgoingWebhooks);
  const createFn = useServerFn(createOutgoingWebhook);
  const toggleFn = useServerFn(toggleOutgoingWebhook);
  const deleteFn = useServerFn(deleteOutgoingWebhook);
  const { confirm, confirmDialog } = useConfirm();

  const [hooks, setHooks] = useState<Hook[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [adding, setAdding] = useState(false);
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(() => {
    void listFn()
      .then((rows) => setHooks(rows as Hook[]))
      .catch(() => undefined)
      .finally(() => setLoaded(true));
    onChanged();
  }, [listFn, onChanged]);

  useEffect(() => {
    if (enabled) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- carrega ao abrir
  }, [enabled]);

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
      setAdding(false);
      refresh();
    } catch {
      setError("Não foi possível salvar. Confira se a URL é válida.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (h: Hook) => {
    const ok = await confirm(`O webhook para ${h.url} deixará de receber eventos.`, {
      title: "Excluir webhook?",
      confirmLabel: "Excluir",
      destructive: true,
    });
    if (!ok) return;
    await deleteFn({ data: { id: h.id } });
    refresh();
  };

  return (
    <div className="space-y-4">
      {confirmDialog}
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-foreground">
          Webhooks{loaded ? ` (${hooks.length})` : ""}
        </p>
        {!adding && (
          <Button type="button" variant="outline" size="sm" onClick={() => setAdding(true)}>
            <Plus className="h-3.5 w-3.5" /> Adicionar webhook
          </Button>
        )}
      </div>

      {loaded && hooks.length === 0 && !adding && (
        <p className="text-sm text-text-secondary">Nenhum webhook configurado.</p>
      )}

      {loaded && hooks.length > 0 && (
        <ul className="divide-y divide-border/60">
          {hooks.map((h) => (
            <li key={h.id} className="flex items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground" title={h.url}>
                  {h.url}
                </p>
                <p className="mt-0.5 truncate text-xs text-text-secondary">
                  {h.events
                    .map((e) => OUTGOING_WEBHOOK_EVENTS.find((x) => x.key === e)?.label ?? e)
                    .join(" · ")}
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  void toggleFn({ data: { id: h.id, active: !h.active } }).then(refresh)
                }
                aria-pressed={h.active}
                className={`shrink-0 cursor-pointer rounded-md px-2 py-1 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                  h.active
                    ? "text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-400"
                    : "text-text-secondary hover:bg-muted"
                }`}
              >
                {h.active ? "Ativo" : "Pausado"}
              </button>
              <button
                type="button"
                onClick={() => void remove(h)}
                aria-label={`Excluir webhook ${h.url}`}
                className="shrink-0 cursor-pointer rounded-md p-1.5 text-text-secondary hover:bg-muted hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {adding && (
        <div className="space-y-3 border-t border-border/60 pt-4">
          <Field label="URL de destino">
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://hooks.zapier.com/..."
              aria-label="URL do webhook"
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand"
            />
          </Field>
          <Field label="Eventos">
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
          </Field>
          {error && (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          )}
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => void submit()}
              disabled={saving || !url.trim() || events.size === 0}
            >
              {saving ? "Adicionando..." : "Adicionar webhook"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setAdding(false);
                setUrl("");
                setEvents(new Set());
                setError("");
              }}
            >
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
