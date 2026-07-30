import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  User,
  Mic,
  KeyRound,
  Plus,
  X,
  Eye,
  EyeOff,
  Copy,
  Pencil,
  Camera,
  Trash2,
  Building2,
  Upload,
  ImageIcon,
  Lock,
  Download,
  Bell,
  Clock,
  Send,
  ShieldCheck,
  Webhook,
  RefreshCw,
  Check,
} from "lucide-react";
import { SectionHeader } from "./SectionHeader";
import {
  loadWorkspace,
  saveWorkspace,
  fetchWorkspace,
  canEditWorkspace,
  type Workspace,
} from "@/lib/workspace-store";
import { supabase } from "@/integrations/supabase/client";
import { saveMe } from "@/lib/chat-store";
import { useStorageSync } from "@/lib/use-storage-sync";
import {
  isVaultUnlocked,
  lockVault,
  unlockVaultAsAdmin,
  vaultEncrypt,
  vaultDecrypt,
  getVaultExpiry,
  onVaultLocked,
} from "@/lib/vault-crypto";
import { getVaultKey } from "@/lib/vault.functions";
import { useVerifyVaultAccessCode } from "@/lib/vault-access";
import { getVaultTotpStatus, enrollVaultTotp } from "@/lib/vault-totp.functions";
import {
  getLeadsWebhookConfig,
  regenerateLeadsWebhookSecret,
  listOutgoingWebhooks,
  createOutgoingWebhook,
  toggleOutgoingWebhook,
  deleteOutgoingWebhook,
} from "@/lib/integrations.functions";
import { OUTGOING_WEBHOOK_EVENTS } from "@/lib/outgoing-webhooks";
import { useConfirm } from "@/hooks/use-confirm";
import { type NotifPrefs, loadNotifPrefs, saveNotifPrefs } from "@/lib/notif-prefs";
import { useMyAccess, hasPermission } from "@/lib/permissions";
import { LockedSection } from "./LockedSection";

type TabKey = "perfil" | "workspace" | "av" | "senhas" | "preferencias" | "integracoes" | "dados";

type Perfil = {
  nome: string;
  email: string;
  telefone: string;
  aniversario: string;
  foto?: string;
};
export const APP_VERSION = "1.13.0";

const PERFIL_KEY = "config:perfil";
const loadPerfil = (): Perfil => {
  try {
    const raw = localStorage.getItem(PERFIL_KEY);
    return raw ? JSON.parse(raw) : { nome: "", email: "", telefone: "", aniversario: "", foto: "" };
  } catch {
    return { nome: "", email: "", telefone: "", aniversario: "", foto: "" };
  }
};

type AVPrefs = { audioIn?: string; audioOut?: string; videoIn?: string };
const AV_KEY = "config:av";
const loadAV = (): AVPrefs => {
  try {
    const raw = localStorage.getItem(AV_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

export type StatusKey = "online" | "ausente" | "offline";
export type UserStatus = {
  status: StatusKey;
  ausenteAte?: string;
  ausenteMotivo?: string;
};
const STATUS_KEY = "config:status";
const loadStatus = (): UserStatus => {
  try {
    const raw = localStorage.getItem(STATUS_KEY);
    return raw ? JSON.parse(raw) : { status: "online" };
  } catch {
    return { status: "online" };
  }
};
const STATUS_META: Record<StatusKey, { label: string; dot: string }> = {
  online: { label: "Online", dot: "bg-emerald-500" },
  ausente: { label: "Ausente", dot: "bg-amber-500" },
  offline: { label: "Offline", dot: "bg-muted-foreground" },
};

type Senha = {
  id: string;
  nome: string;
  categoria: string;
  usuario: string;
  senha: string;
  /** Whether `senha` is AES-GCM ciphertext (see `@/lib/vault-crypto`) rather
   * than plain text. Entries created before the vault got encryption stay
   * plain until the next time they're edited/re-saved. */
  encrypted?: boolean;
  url?: string;
  notas?: string;
};
const SENHAS_KEY = "config:senhas";
const loadSenhas = (): Senha[] => {
  try {
    const raw = localStorage.getItem(SENHAS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

/** Abas administrativas do workspace — exigem a permissão "configuracoes"
 * (ou ser admin). "perfil", "preferencias" e "av" são autoatendimento e
 * ficam sempre acessíveis pra qualquer membro. */
const RESTRICTED_TABS: TabKey[] = ["workspace", "senhas", "integracoes"];

export function ConfiguracoesSection() {
  const [tab, setTab] = useState<TabKey>("perfil");
  const [perfil, setPerfil] = useState<Perfil>(() => loadPerfil());
  const [status, setStatus] = useState<UserStatus>(() => loadStatus());
  const access = useMyAccess();
  const canConfig = hasPermission(access, "configuracoes");

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === PERFIL_KEY) setPerfil(loadPerfil());
      if (e.key === STATUS_KEY) setStatus(loadStatus());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const updateStatus = (next: UserStatus) => {
    setStatus(next);
    localStorage.setItem(STATUS_KEY, JSON.stringify(next));
  };

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <SectionHeader title="Configurações" subtitle="Preferências do workspace." />

      <div className="flex flex-wrap gap-x-8 gap-y-3 border-b border-border pb-3">
        <TabGroup
          label="Minha conta"
          tab={tab}
          setTab={setTab}
          tabs={[
            { k: "perfil", label: "Meu Perfil", icon: User },
            { k: "preferencias", label: "Preferências", icon: Bell },
            { k: "av", label: "Áudio e Vídeo", icon: Mic },
          ]}
        />
        <TabGroup
          label="Workspace"
          tab={tab}
          setTab={setTab}
          locked={canConfig ? [] : RESTRICTED_TABS}
          tabs={[
            { k: "workspace", label: "Identidade", icon: Building2 },
            { k: "senhas", label: "Senhas", icon: KeyRound },
            { k: "integracoes", label: "Integrações", icon: Webhook },
            { k: "dados", label: "Dados", icon: Download },
          ]}
        />
      </div>

      {tab === "perfil" && <PerfilTab perfil={perfil} setPerfil={setPerfil} />}
      {tab === "workspace" &&
        (canConfig ? <WorkspaceTab /> : <LockedSection title="Identidade do workspace" />)}
      {tab === "av" && <AVTab />}
      {tab === "senhas" && (canConfig ? <SenhasTab /> : <LockedSection title="Senhas" />)}
      {tab === "preferencias" && <PreferenciasTab />}
      {tab === "integracoes" &&
        (canConfig ? <IntegracoesTab /> : <LockedSection title="Integrações" />)}
      {tab === "dados" && <DadosTab />}

      <p className="pt-2 text-center text-xs text-muted-foreground">Versão {APP_VERSION}</p>
    </div>
  );
}

function TabGroup({
  label,
  tabs,
  tab,
  setTab,
  locked = [],
}: {
  label: string;
  tabs: { k: TabKey; label: string; icon: typeof User }[];
  tab: TabKey;
  setTab: (k: TabKey) => void;
  locked?: TabKey[];
}) {
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <div className="flex gap-1">
        {tabs.map(({ k, label: tabLabel, icon: Icon }) => {
          const isLocked = locked.includes(k);
          return (
            <button
              key={k}
              onClick={() => setTab(k)}
              title={isLocked ? "Sem permissão — apenas visualização bloqueada" : undefined}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors ${
                isLocked
                  ? "text-muted-foreground/40 hover:bg-muted/40"
                  : tab === k
                    ? "bg-foreground font-medium text-background"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              {isLocked ? <Lock className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
              {tabLabel}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PreferenciasTab() {
  const [prefs, setPrefs] = useState<NotifPrefs>(() => loadNotifPrefs());
  const [isAdmin, setIsAdmin] = useState(false);

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

  const toggle = (key: keyof NotifPrefs) => {
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    saveNotifPrefs(next);
  };

  const ITEMS: { key: keyof NotifPrefs; label: string; hint: string; adminOnly?: boolean }[] = [
    {
      key: "mensagens",
      label: "Novas mensagens",
      hint: "Avisar sobre mensagens não lidas em canais e DMs.",
    },
    { key: "mencoes", label: "Menções no chat", hint: "Avisar quando alguém mencionar você." },
    {
      key: "tarefas",
      label: "Tarefas atribuídas",
      hint: "Avisar sobre novas tarefas designadas a você.",
    },
    {
      key: "tarefaAtividade",
      label: "Mudanças em tarefas suas",
      hint: "Avisar quando o status ou responsável de uma tarefa sua mudar.",
    },
    {
      key: "reunioes",
      label: "Solicitações de reunião",
      hint: "Avisar quando você for convidado para uma reunião pendente.",
    },
  ];

  const visibleItems = ITEMS.filter((i) => !i.adminOnly || isAdmin);

  return (
    <div className="max-w-lg space-y-3 rounded-lg border border-border bg-background p-4">
      <div>
        <h3 className="text-sm font-semibold">Notificações</h3>
        <p className="text-xs text-muted-foreground">
          Controla o que aparece no sino de notificações, neste navegador.
        </p>
      </div>
      <div className="divide-y divide-border">
        {visibleItems.map((item) => (
          <label
            key={item.key}
            className="flex cursor-pointer items-center justify-between gap-3 py-3"
          >
            <div>
              <div className="text-sm font-medium">{item.label}</div>
              <div className="text-xs text-muted-foreground">{item.hint}</div>
            </div>
            <input
              type="checkbox"
              checked={prefs[item.key]}
              onChange={() => toggle(item.key)}
              className="h-4 w-4 accent-foreground"
            />
          </label>
        ))}
      </div>
    </div>
  );
}

function DadosTab() {
  const [exporting, setExporting] = useState(false);

  const handleExport = () => {
    setExporting(true);
    try {
      const data: Record<string, unknown> = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key) continue;
        try {
          data[key] = JSON.parse(localStorage.getItem(key) ?? "null");
        } catch {
          data[key] = localStorage.getItem(key);
        }
      }
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `vnh-dados-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="max-w-lg space-y-4 rounded-lg border border-border bg-background p-4">
      <div>
        <h3 className="text-sm font-semibold">Exportação de dados</h3>
        <p className="text-xs text-muted-foreground">
          Baixa um arquivo JSON com os dados deste workspace armazenados neste navegador (clientes,
          projetos, comercial, financeiro, senhas criptografadas, etc.) — útil como backup manual,
          já que parte da plataforma depende de localStorage sincronizado.
        </p>
      </div>
      <button
        type="button"
        onClick={handleExport}
        disabled={exporting}
        className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90 disabled:opacity-50"
      >
        <Download className="h-3.5 w-3.5" />
        {exporting ? "Gerando..." : "Exportar dados (.json)"}
      </button>
    </div>
  );
}

/* ============================================================
 * Integrações — webhook de entrada para leads, webhooks de saída
 * (estilo Zapier/Make) e integrações externas (Google Agenda).
 * ============================================================ */

function IntegracoesTab() {
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

  if (isAdmin === false) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-background p-6 text-center">
        <p className="text-sm text-muted-foreground">
          Apenas administradores podem ver e gerenciar integrações.
        </p>
      </div>
    );
  }

  if (isAdmin === null) return null;

  return (
    <div className="max-w-2xl space-y-6">
      <LeadsWebhookCard />
      <OutgoingWebhooksCard />
    </div>
  );
}

function IntegrationCard({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-4 rounded-lg border border-border bg-background p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-foreground">
          {icon}
        </div>
        <div>
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
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
              <button
                type="button"
                onClick={() => void regenerate()}
                disabled={regenerating}
                className="shrink-0 rounded-md bg-destructive px-2.5 py-1 text-[11px] font-medium text-destructive-foreground hover:opacity-90 disabled:opacity-50"
              >
                Confirmar
              </button>
              <button
                type="button"
                onClick={() => setConfirmingRegen(false)}
                className="shrink-0 rounded-md border border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted"
              >
                Cancelar
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingRegen(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Gerar nova chave
            </button>
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
        <button
          type="button"
          onClick={() => void submit()}
          disabled={saving || !url.trim() || events.size === 0}
          className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" />
          {saving ? "Adicionando..." : "Adicionar webhook"}
        </button>
      </div>
    </IntegrationCard>
  );
}

function WorkspaceTab() {
  const [ws, setWs] = useState<Workspace>(() => loadWorkspace());
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [admin, setAdmin] = useState<boolean | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void fetchWorkspace().then((w) => setWs(w));
    void canEditWorkspace().then(setAdmin);
  }, []);

  const handleFile = (file: File) => {
    if (!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => setWs((p) => ({ ...p, logo: String(reader.result || "") }));
    reader.readAsDataURL(file);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    const res = await saveWorkspace({ ...ws, nome: ws.nome.trim() || "Workspace" });
    if (res.error) {
      setErr(res.error);
      return;
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  if (admin === false) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-background p-6 text-center">
        <p className="text-sm text-muted-foreground">
          Você não tem permissão para alterar o nome e a foto do workspace.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={save} className="space-y-5 rounded-lg border border-border bg-background p-5">
      <div>
        <h3 className="text-sm font-semibold text-foreground">Identidade do workspace</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Aparece no menu lateral e nas telas compartilhadas com o time.
        </p>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl border border-border bg-muted">
          {ws.logo ? (
            <img src={ws.logo} alt="Logo" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <ImageIcon className="h-6 w-6 text-muted-foreground" />
            </div>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
          >
            <Upload className="h-3.5 w-3.5" />
            {ws.logo ? "Trocar logo" : "Anexar logo"}
          </button>
          {ws.logo && (
            <button
              type="button"
              onClick={() => setWs({ ...ws, logo: "" })}
              className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Remover
            </button>
          )}
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Nome do workspace
        </label>
        <input
          value={ws.nome}
          onChange={(e) => setWs({ ...ws, nome: e.target.value })}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          placeholder="Ex.: Você no Hype"
        />
      </div>

      <div className="flex items-center justify-end gap-3">
        {err && <span className="text-xs text-destructive">{err}</span>}
        {saved && <span className="text-xs text-emerald-600">Salvo</span>}
        <button
          type="submit"
          className="rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90"
        >
          Salvar alterações
        </button>
      </div>
    </form>
  );
}

function ProfileHeader({
  perfil,
  status,
  onChangeStatus,
}: {
  perfil: Perfil;
  status: UserStatus;
  onChangeStatus: (s: UserStatus) => void;
}) {
  const [open, setOpen] = useState(false);
  const initials =
    (perfil.nome || "")
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase())
      .join("") || "?";
  const meta = STATUS_META[status.status];
  const ausenteInfo =
    status.status === "ausente" && status.ausenteAte
      ? `até ${new Date(status.ausenteAte).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}`
      : null;

  return (
    <div className="flex items-center gap-4 rounded-lg border border-border bg-background p-4">
      <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-full border border-border bg-muted">
        {perfil.foto ? (
          <img src={perfil.foto} alt="Foto de perfil" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-sm font-semibold text-muted-foreground">
            {initials}
          </div>
        )}
        <span
          className={`absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-background ${meta.dot}`}
          aria-label={meta.label}
        />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{perfil.nome || "Sem nome"}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <span className={`inline-block h-2 w-2 rounded-full ${meta.dot}`} />
          <span>{meta.label}</span>
          {ausenteInfo && <span>• {ausenteInfo}</span>}
          {status.status === "ausente" && status.ausenteMotivo && (
            <span className="truncate">• {status.ausenteMotivo}</span>
          )}
        </div>
      </div>
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
        >
          Alterar status
        </button>
        {open && (
          <StatusPopover
            status={status}
            onClose={() => setOpen(false)}
            onSave={(s) => {
              onChangeStatus(s);
              setOpen(false);
            }}
          />
        )}
      </div>
    </div>
  );
}

function StatusPopover({
  status,
  onClose,
  onSave,
}: {
  status: UserStatus;
  onClose: () => void;
  onSave: (s: UserStatus) => void;
}) {
  const [sel, setSel] = useState<StatusKey>(status.status);
  const [ate, setAte] = useState(status.ausenteAte ?? "");
  const [motivo, setMotivo] = useState(status.ausenteMotivo ?? "");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (sel === "ausente") {
      onSave({
        status: "ausente",
        ausenteAte: ate || undefined,
        ausenteMotivo: motivo.trim() || undefined,
      });
    } else {
      onSave({ status: sel });
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <form
        onSubmit={submit}
        className={`absolute right-0 bottom-full z-50 mb-1 rounded-lg border border-border bg-background p-1 shadow-lg ${
          sel === "ausente" ? "w-60 space-y-2 p-2" : "w-40"
        }`}
      >
        <div className="space-y-0.5">
          {(Object.keys(STATUS_META) as StatusKey[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => {
                setSel(k);
                if (k !== "ausente") onSave({ status: k });
              }}
              className={`flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-xs hover:bg-muted ${
                sel === k ? "bg-muted" : ""
              }`}
            >
              <span className={`inline-block h-2 w-2 rounded-full ${STATUS_META[k].dot}`} />
              <span>{STATUS_META[k].label}</span>
            </button>
          ))}
        </div>
        {sel === "ausente" && (
          <>
            <div className="space-y-2 border-t border-border pt-2">
              <label className="block space-y-1">
                <span className="text-xs font-medium">Ausente até</span>
                <input
                  type="datetime-local"
                  value={ate}
                  onChange={(e) => setAte(e.target.value)}
                  className={inputCls}
                  required
                />
              </label>
              <label className="block space-y-1">
                <span className="text-xs font-medium">Motivo</span>
                <input
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  className={inputCls}
                  placeholder="Reunião, folga, viagem..."
                />
              </label>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-md border border-border px-3 py-1 text-xs hover:bg-muted"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="rounded-md bg-foreground px-3 py-1 text-xs font-medium text-background hover:opacity-90"
              >
                Salvar
              </button>
            </div>
          </>
        )}
      </form>
    </>
  );
}

const inputCls =
  "h-9 w-full rounded-md border border-border bg-background px-2.5 text-sm outline-none focus:ring-2 focus:ring-ring";

function PerfilTab({ perfil, setPerfil }: { perfil: Perfil; setPerfil: (p: Perfil) => void }) {
  const [p, setP] = useState<Perfil>(perfil);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData.user) throw authError ?? new Error("Sessão inválida.");
      let photoUrl = p.foto || null;
      if (photoFile) {
        const ext = photoFile.name.split(".").pop() ?? "jpg";
        const path = `${authData.user.id}/avatar.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from("avatars")
          .upload(path, photoFile, { upsert: true, contentType: photoFile.type });
        if (uploadError) throw uploadError;
        const { data: signed, error: signedError } = await supabase.storage
          .from("avatars")
          .createSignedUrl(path, 60 * 60 * 24 * 365);
        if (signedError) throw signedError;
        photoUrl = signed.signedUrl;
      }
      const next = { ...p, foto: photoUrl ?? "", email: authData.user.email ?? p.email };
      const { error: profileError } = await supabase
        .from("profiles")
        .update({
          full_name: next.nome.trim(),
          phone: next.telefone.trim(),
          birthday: next.aniversario || null,
          photo_url: photoUrl,
        })
        .eq("id", authData.user.id);
      if (profileError) throw profileError;
      localStorage.setItem(PERFIL_KEY, JSON.stringify(next));
      saveMe({
        id: authData.user.id,
        name: next.nome.trim(),
        photo: next.foto || undefined,
        email: next.email,
      });
      window.dispatchEvent(new StorageEvent("storage", { key: PERFIL_KEY }));
      window.dispatchEvent(new Event("time:membros:changed"));
      setP(next);
      setPerfil(next);
      setPhotoFile(null);
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar o perfil.");
    } finally {
      setSaving(false);
    }
  };

  const onPickFile = (file?: File | null) => {
    setError("");
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Selecione um arquivo de imagem.");
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      setError("A imagem deve ter até 3MB.");
      return;
    }
    setPhotoFile(file);
    const reader = new FileReader();
    reader.onload = () => setP((prev) => ({ ...prev, foto: String(reader.result || "") }));
    reader.readAsDataURL(file);
  };

  const initials =
    (p.nome || "")
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase())
      .join("") || "?";

  return (
    <form
      onSubmit={save}
      className="grid grid-cols-1 gap-4 rounded-lg border border-border bg-background p-5 sm:grid-cols-2"
    >
      <div className="flex items-center gap-4 sm:col-span-2">
        <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-full border border-border bg-muted">
          {p.foto ? (
            <img src={p.foto} alt="Foto de perfil" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-lg font-semibold text-muted-foreground">
              {initials}
            </div>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => onPickFile(e.target.files?.[0])}
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
            >
              <Camera className="h-3.5 w-3.5" />
              {p.foto ? "Trocar foto" : "Anexar foto"}
            </button>
            {p.foto && (
              <button
                type="button"
                onClick={() => setP({ ...p, foto: "" })}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-destructive hover:bg-muted"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Remover
              </button>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">PNG ou JPG, até 3MB.</p>
          {error && <p className="text-[11px] text-destructive">{error}</p>}
        </div>
      </div>
      <label className="space-y-1 sm:col-span-2">
        <span className="text-xs font-medium">Nome completo</span>
        <input
          value={p.nome}
          onChange={(e) => setP({ ...p, nome: e.target.value })}
          className={inputCls}
          required
        />
      </label>
      <label className="space-y-1">
        <span className="text-xs font-medium">E-mail</span>
        <input
          type="email"
          value={p.email}
          onChange={(e) => setP({ ...p, email: e.target.value })}
          className={inputCls}
          required
        />
      </label>
      <label className="space-y-1">
        <span className="text-xs font-medium">Telefone</span>
        <input
          value={p.telefone}
          onChange={(e) => setP({ ...p, telefone: e.target.value })}
          className={inputCls}
          placeholder="(00) 00000-0000"
        />
      </label>
      <label className="space-y-1">
        <span className="text-xs font-medium">Data de aniversário</span>
        <input
          type="date"
          value={p.aniversario}
          onChange={(e) => setP({ ...p, aniversario: e.target.value })}
          className={inputCls}
        />
      </label>
      <div className="flex items-center gap-3 sm:col-span-2">
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90 disabled:opacity-60"
        >
          {saving ? "Salvando..." : "Salvar"}
        </button>
        {saved && <span className="text-xs text-emerald-600 dark:text-emerald-400">Salvo</span>}
      </div>
    </form>
  );
}

function AVTab() {
  const [prefs, setPrefs] = useState<AVPrefs>(() => loadAV());
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [error, setError] = useState<string>("");

  const load = async () => {
    try {
      if (!navigator.mediaDevices?.enumerateDevices) {
        setError("Este navegador não suporta seleção de dispositivos.");
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
        stream.getTracks().forEach((t) => t.stop());
      } catch {
        /* permission optional; labels may be empty */
      }
      const list = await navigator.mediaDevices.enumerateDevices();
      setDevices(list);
      setError("");
    } catch (e) {
      setError("Não foi possível listar os dispositivos.");
    }
  };

  useEffect(() => {
    load();
  }, []);

  const audioIn = devices.filter((d) => d.kind === "audioinput");
  const audioOut = devices.filter((d) => d.kind === "audiooutput");
  const videoIn = devices.filter((d) => d.kind === "videoinput");

  const update = (patch: Partial<AVPrefs>) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    localStorage.setItem(AV_KEY, JSON.stringify(next));
  };

  const Select = ({
    label,
    value,
    onChange,
    options,
    fallback,
  }: {
    label: string;
    value?: string;
    onChange: (v: string) => void;
    options: MediaDeviceInfo[];
    fallback: string;
  }) => (
    <label className="space-y-1">
      <span className="text-xs font-medium">{label}</span>
      <select value={value ?? ""} onChange={(e) => onChange(e.target.value)} className={inputCls}>
        <option value="">Padrão do sistema</option>
        {options.map((d, i) => (
          <option key={d.deviceId || i} value={d.deviceId}>
            {d.label || `${fallback} ${i + 1}`}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="space-y-4 rounded-lg border border-border bg-background p-5">
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Select
          label="Microfone (entrada de áudio)"
          value={prefs.audioIn}
          onChange={(v) => update({ audioIn: v })}
          options={audioIn}
          fallback="Microfone"
        />
        <Select
          label="Alto-falante (saída de áudio)"
          value={prefs.audioOut}
          onChange={(v) => update({ audioOut: v })}
          options={audioOut}
          fallback="Saída"
        />
        <Select
          label="Câmera (entrada de vídeo)"
          value={prefs.videoIn}
          onChange={(v) => update({ videoIn: v })}
          options={videoIn}
          fallback="Câmera"
        />
      </div>
      <button
        type="button"
        onClick={load}
        className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
      >
        Atualizar lista de dispositivos
      </button>
      <p className="text-[11px] text-muted-foreground">
        Permita acesso ao microfone e à câmera para ver os nomes completos dos dispositivos.
      </p>
    </div>
  );
}

function SenhasTab() {
  const [items, setItems] = useState<Senha[]>(() => loadSenhas());
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Senha | null>(null);
  const [unlocked, setUnlocked] = useState(() => isVaultUnlocked());
  const [decrypted, setDecrypted] = useState<Record<string, string>>({});
  const [userId, setUserId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  useStorageSync(SENHAS_KEY, () => setItems(loadSenhas()));

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user || cancelled) return;
      setUserId(u.user.id);
      const { data: ok } = await supabase.rpc("is_admin", { _user_id: u.user.id });
      if (!cancelled) setIsAdmin(Boolean(ok));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // The vault auto-locks itself when a temporary grant's 10 minutes are up
  // (see vault-crypto.ts) — reflect that back into this component's state.
  useEffect(() => onVaultLocked(() => setUnlocked(false)), []);

  // Decrypt every encrypted entry whenever the vault unlocks or the list
  // changes. Legacy plain-text entries (created before encryption existed)
  // just pass through unchanged until they're next edited and re-saved.
  useEffect(() => {
    if (!unlocked) return;
    let cancelled = false;
    (async () => {
      const next: Record<string, string> = {};
      for (const s of items) {
        if (!s.encrypted) {
          next[s.id] = s.senha;
          continue;
        }
        try {
          next[s.id] = await vaultDecrypt(s.senha);
        } catch {
          next[s.id] = "⚠️ não foi possível descriptografar";
        }
      }
      if (!cancelled) setDecrypted(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [unlocked, items]);

  const persist = (next: Senha[]) => {
    setItems(next);
    localStorage.setItem(SENHAS_KEY, JSON.stringify(next));
  };

  const filtered = useMemo(
    () =>
      items.filter(
        (s) =>
          s.nome.toLowerCase().includes(query.toLowerCase()) ||
          s.categoria.toLowerCase().includes(query.toLowerCase()) ||
          s.usuario.toLowerCase().includes(query.toLowerCase()),
      ),
    [items, query],
  );

  const save = async (s: Senha, plainSenha: string) => {
    const encryptedSenha = await vaultEncrypt(plainSenha);
    const next = { ...s, senha: encryptedSenha, encrypted: true };
    persist(
      items.some((x) => x.id === s.id)
        ? items.map((x) => (x.id === s.id ? next : x))
        : [...items, next],
    );
    setOpen(false);
    setEditing(null);
  };

  const remove = (id: string) => persist(items.filter((x) => x.id !== id));

  if (!unlocked) {
    return <VaultUnlockCard onUnlock={() => setUnlocked(true)} userId={userId} isAdmin={isAdmin} />;
  }

  return (
    <div className="space-y-4">
      {isAdmin && <VaultTotpEnroll />}
      {getVaultExpiry() !== null && <VaultExpiryBanner expiresAt={getVaultExpiry()!} />}
      <div className="flex items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar ferramenta ou rede social"
          className="h-9 flex-1 rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        <button
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
          className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90"
        >
          <Plus className="h-3.5 w-3.5" />
          Nova senha
        </button>
        <button
          type="button"
          onClick={() => {
            lockVault();
            setUnlocked(false);
          }}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted"
          title="Bloquear cofre"
        >
          <Lock className="h-3.5 w-3.5" />
        </button>
      </div>

      <p className="text-[11px] text-muted-foreground">
        Só admins têm acesso permanente. Cada senha fica criptografada com a chave do cofre — sem
        ela, ninguém lê o conteúdo, nem quem tem acesso direto ao banco de dados. Quem não é admin
        pode pedir acesso temporário de 10 minutos.
      </p>

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-background p-10 text-center">
          <p className="text-sm text-muted-foreground">
            {items.length === 0 ? "Nenhuma senha cadastrada." : "Nenhum resultado."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {filtered.map((s) => (
            <SenhaCard
              key={s.id}
              s={s}
              plainSenha={decrypted[s.id] ?? (s.encrypted ? "…" : s.senha)}
              onEdit={() => {
                setEditing(s);
                setOpen(true);
              }}
              onDelete={() => remove(s.id)}
            />
          ))}
        </div>
      )}

      {open && (
        <SenhaDialog
          initial={editing}
          initialPlainSenha={editing ? (decrypted[editing.id] ?? editing.senha) : ""}
          onClose={() => {
            setOpen(false);
            setEditing(null);
          }}
          onSave={save}
        />
      )}
    </div>
  );
}

/**
 * Admins never type anything here — they're trusted by role, so this fetches
 * the vault key from the server the moment the tab is admin-confirmed and
 * unlocks automatically. Everyone else only ever gets a 10-minute grant from
 * an admin (see VaultRequestAccess below).
 */
function VaultUnlockCard({
  onUnlock,
  userId,
  isAdmin,
}: {
  onUnlock: () => void;
  userId: string | null;
  isAdmin: boolean;
}) {
  const getVaultKeyFn = useServerFn(getVaultKey);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const unlock = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const { keyB64 } = await getVaultKeyFn();
      await unlockVaultAsAdmin(keyB64);
      onUnlock();
    } catch {
      setError("Não foi possível carregar o cofre.");
    } finally {
      setBusy(false);
    }
  }, [getVaultKeyFn, onUnlock]);

  useEffect(() => {
    if (isAdmin) void unlock();
  }, [isAdmin, unlock]);

  if (isAdmin) {
    return (
      <div className="mx-auto max-w-sm space-y-4 rounded-lg border border-dashed border-border bg-background p-8 text-center">
        <Lock className="mx-auto h-6 w-6 text-muted-foreground" />
        <h3 className="mt-3 text-sm font-semibold text-foreground">Cofre</h3>
        {error ? (
          <div className="space-y-2">
            <p className="text-xs text-destructive">{error}</p>
            <button
              type="button"
              onClick={() => void unlock()}
              disabled={busy}
              className="h-9 w-full rounded-md bg-foreground text-xs font-medium text-background hover:opacity-90 disabled:opacity-50"
            >
              Tentar novamente
            </button>
          </div>
        ) : (
          <p className="mt-1.5 text-xs text-muted-foreground">Carregando acesso de admin...</p>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-sm">
      <VaultRequestAccess onGranted={onUnlock} />
    </div>
  );
}

function VaultRequestAccess({ onGranted }: { onGranted: () => void }) {
  const verifyCode = useVerifyVaultAccessCode();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await verifyCode(code);
      onGranted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível verificar o código.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border border-dashed border-border bg-background p-8 text-center">
      <Lock className="mx-auto h-6 w-6 text-muted-foreground" />
      <h3 className="mt-3 text-sm font-semibold text-foreground">Cofre restrito a admins</h3>
      <p className="mt-1.5 text-xs text-muted-foreground">
        Digite o código de 6 dígitos do Google Authenticator de um admin para ter acesso temporário
        (10 minutos).
      </p>
      <form onSubmit={submit} className="mt-3 space-y-2">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="000000"
          className="h-9 w-full rounded-md border border-border bg-background px-3 text-center font-mono text-sm tracking-[0.3em] outline-none focus:ring-2 focus:ring-ring"
        />
        {error && <p className="text-xs text-destructive">{error}</p>}
        <button
          type="submit"
          disabled={busy || code.length !== 6}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ShieldCheck className="h-3.5 w-3.5" />
          {busy ? "Verificando..." : "Desbloquear"}
        </button>
      </form>
    </div>
  );
}

function VaultTotpEnroll() {
  const statusFn = useServerFn(getVaultTotpStatus);
  const enrollFn = useServerFn(enrollVaultTotp);
  const [status, setStatus] = useState<{ enrolled: boolean; createdAt: string | null } | null>(
    null,
  );
  const [secret, setSecret] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const { confirm, confirmDialog } = useConfirm();

  const refresh = useCallback(() => {
    void statusFn()
      .then(setStatus)
      .catch(() => setError("Não foi possível carregar o status do autenticador."));
  }, [statusFn]);

  useEffect(() => refresh(), [refresh]);

  const enroll = async () => {
    setBusy(true);
    setError("");
    try {
      const { secret: newSecret } = await enrollFn();
      setSecret(newSecret);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível gerar a chave.");
    } finally {
      setBusy(false);
    }
  };

  // Regenerar invalida o código que já está no app de qualquer admin — não
  // é um passo do dia a dia (o fluxo normal é só ler o código do app já
  // configurado), então fica atrás de uma confirmação explícita em vez de
  // um botão de destaque igual ao de configurar pela primeira vez.
  const regenerate = async () => {
    const ok = await confirm(
      "Gerar uma nova chave invalida o código que já está configurado no Google Authenticator de qualquer admin — todos vão precisar re-adicionar a chave nos apps deles. Continuar?",
    );
    if (ok) void enroll();
  };

  const copy = () => {
    if (!secret) return;
    navigator.clipboard?.writeText(secret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!status) return null;

  if (status.enrolled && !secret) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-background px-3 py-2">
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
          Autenticador configurado — para dar acesso a alguém, só peça o código de 6 dígitos que já
          está no seu Google Authenticator.
        </p>
        <button
          type="button"
          disabled={busy}
          onClick={() => void regenerate()}
          className="shrink-0 text-[11px] text-muted-foreground underline underline-offset-2 hover:text-foreground disabled:opacity-50"
        >
          {busy ? "Gerando..." : "Perdeu acesso? Gerar nova chave"}
        </button>
        {error && <p className="text-xs text-destructive">{error}</p>}
        {confirmDialog}
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border border-border bg-background p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        Autenticador (Google Authenticator)
      </p>
      <p className="text-xs text-muted-foreground">
        Ainda não configurado. Sem isso, ninguém sem a chave de admin consegue pedir acesso
        temporário.
      </p>
      {secret && (
        <div className="space-y-1.5 rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
          <p className="text-[11px] text-amber-700 dark:text-amber-400">
            Adicione manualmente no Google Authenticator (tipo "baseado em tempo") — essa chave não
            aparece de novo depois que você sair desta tela. Depois de configurado, você só precisa
            ler o código do app quando alguém pedir acesso — não é preciso configurar de novo.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate rounded bg-background px-2 py-1 font-mono text-xs">
              {secret}
            </code>
            <button
              type="button"
              onClick={copy}
              className="rounded-md border border-border px-2 py-1 text-[11px] font-medium hover:bg-muted"
            >
              {copied ? "Copiado!" : "Copiar"}
            </button>
          </div>
        </div>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
      {!secret && (
        <button
          type="button"
          disabled={busy}
          onClick={() => void enroll()}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
        >
          <ShieldCheck className="h-3.5 w-3.5" />
          {busy ? "Gerando..." : "Configurar autenticador"}
        </button>
      )}
      {confirmDialog}
    </div>
  );
}

function VaultExpiryBanner({ expiresAt }: { expiresAt: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(id);
  }, []);
  const remaining = Math.max(0, Math.floor((expiresAt - now) / 1000));
  const mm = String(Math.floor(remaining / 60)).padStart(2, "0");
  const ss = String(remaining % 60).padStart(2, "0");
  return (
    <div className="flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
      <Clock className="h-3.5 w-3.5" />
      Acesso temporário — expira em {mm}:{ss}
    </div>
  );
}

function SenhaCard({
  s,
  plainSenha,
  onEdit,
  onDelete,
}: {
  s: Senha;
  plainSenha: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [show, setShow] = useState(false);
  const copy = (v: string) => navigator.clipboard?.writeText(v);
  return (
    <div className="group rounded-lg border border-border bg-background p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{s.nome}</p>
          {s.categoria && (
            <p className="truncate text-[11px] text-muted-foreground">{s.categoria}</p>
          )}
        </div>
        <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <button onClick={onEdit} aria-label="Editar" className="rounded p-1 hover:bg-muted">
            <Pencil className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
          </button>
          <button onClick={onDelete} aria-label="Remover" className="rounded p-1 hover:bg-muted">
            <X className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
          </button>
        </div>
      </div>
      <dl className="mt-3 space-y-1.5 text-xs">
        {s.usuario && (
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-muted-foreground">{s.usuario}</span>
            <button
              onClick={() => copy(s.usuario)}
              className="rounded p-1 hover:bg-muted"
              aria-label="Copiar usuário"
            >
              <Copy className="h-3 w-3 text-muted-foreground" />
            </button>
          </div>
        )}
        <div className="flex items-center justify-between gap-2">
          <span className="truncate font-mono text-muted-foreground">
            {show ? plainSenha : "•".repeat(Math.min(12, plainSenha.length || 8))}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShow((v) => !v)}
              className="rounded p-1 hover:bg-muted"
              aria-label="Mostrar senha"
            >
              {show ? (
                <EyeOff className="h-3 w-3 text-muted-foreground" />
              ) : (
                <Eye className="h-3 w-3 text-muted-foreground" />
              )}
            </button>
            <button
              onClick={() => copy(plainSenha)}
              className="rounded p-1 hover:bg-muted"
              aria-label="Copiar senha"
            >
              <Copy className="h-3 w-3 text-muted-foreground" />
            </button>
          </div>
        </div>
        {s.url && (
          <a
            href={s.url}
            target="_blank"
            rel="noreferrer"
            className="block truncate text-[11px] text-sky-600 hover:underline dark:text-sky-400"
          >
            {s.url}
          </a>
        )}
      </dl>
    </div>
  );
}

function SenhaDialog({
  initial,
  initialPlainSenha,
  onClose,
  onSave,
}: {
  initial: Senha | null;
  initialPlainSenha: string;
  onClose: () => void;
  onSave: (s: Senha, plainSenha: string) => void | Promise<void>;
}) {
  const [nome, setNome] = useState(initial?.nome ?? "");
  const [categoria, setCategoria] = useState(initial?.categoria ?? "");
  const [usuario, setUsuario] = useState(initial?.usuario ?? "");
  const [senha, setSenha] = useState(initialPlainSenha);
  const [url, setUrl] = useState(initial?.url ?? "");
  const [notas, setNotas] = useState(initial?.notas ?? "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim() || !senha.trim()) {
      setError("Nome e senha são obrigatórios.");
      return;
    }
    setSaving(true);
    try {
      await onSave(
        {
          id: initial?.id ?? crypto.randomUUID(),
          nome: nome.trim(),
          categoria: categoria.trim(),
          usuario: usuario.trim(),
          senha: "",
          url: url.trim() || undefined,
          notas: notas.trim() || undefined,
        },
        senha,
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border border-border bg-background shadow-lg"
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="text-sm font-semibold">{initial ? "Editar senha" : "Nova senha"}</h2>
          <button type="button" onClick={onClose} aria-label="Fechar">
            <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
          </button>
        </div>
        <div className="space-y-3 px-5 py-4">
          <label className="block space-y-1">
            <span className="text-xs font-medium">Nome</span>
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              className={inputCls}
              placeholder="Instagram, Meta Ads..."
              required
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium">Categoria</span>
            <select
              value={categoria}
              onChange={(e) => setCategoria(e.target.value)}
              className={inputCls}
            >
              <option value="">Selecione uma categoria</option>
              <option value="Rede social">Rede social</option>
              <option value="Ferramenta">Ferramenta</option>
              <option value="E-mail">E-mail</option>
              <option value="Hospedagem">Hospedagem</option>
              <option value="Domínio">Domínio</option>
              <option value="Analytics">Analytics</option>
              <option value="Anúncios">Anúncios</option>
              <option value="Design">Design</option>
              <option value="Outros">Outros</option>
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium">Usuário / e-mail</span>
            <input
              value={usuario}
              onChange={(e) => setUsuario(e.target.value)}
              className={inputCls}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium">Senha</span>
            <input
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              className={inputCls}
              required
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium">URL</span>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className={inputCls}
              placeholder="https://"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium">Notas</span>
            <textarea
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              className={`${inputCls} h-20 py-2`}
            />
          </label>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </form>
    </div>
  );
}

export function SidebarProfile() {
  const [perfil, setPerfil] = useState<Perfil>(() => loadPerfil());
  const [status, setStatus] = useState<UserStatus>(() => loadStatus());
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const sync = () => {
      setPerfil(loadPerfil());
      setStatus(loadStatus());
    };
    window.addEventListener("storage", sync);
    window.addEventListener("focus", sync);
    const t = setInterval(sync, 2000);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("focus", sync);
      clearInterval(t);
    };
  }, []);

  const updateStatus = (next: UserStatus) => {
    setStatus(next);
    localStorage.setItem(STATUS_KEY, JSON.stringify(next));
  };

  const initials =
    (perfil.nome || "")
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase())
      .join("") || "?";
  const meta = STATUS_META[status.status];
  const ausenteInfo =
    status.status === "ausente" && status.ausenteAte
      ? `até ${new Date(status.ausenteAte).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}`
      : null;

  const handleSignOut = async () => {
    const { supabase } = await import("@/integrations/supabase/client");
    await supabase.auth.signOut();
    window.location.href = "/";
  };

  return (
    <div className="relative border-t border-border p-3">
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex flex-1 items-center gap-2.5 rounded-md p-1.5 text-left transition-colors hover:bg-muted/60"
        >
          <div className="relative h-8 w-8 shrink-0">
            <div className="h-full w-full overflow-hidden rounded-full border border-border bg-muted">
              {perfil.foto ? (
                <img src={perfil.foto} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-[11px] font-semibold text-muted-foreground">
                  {initials}
                </div>
              )}
            </div>
            <span
              className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-background ${meta.dot}`}
            />
          </div>

          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium">{perfil.nome || "Sem nome"}</p>
            <p className="truncate text-[10px] text-muted-foreground">
              {meta.label}
              {ausenteInfo ? ` · ${ausenteInfo}` : ""}
            </p>
          </div>
        </button>
        <button
          type="button"
          onClick={handleSignOut}
          title="Sair"
          className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Sair"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
        </button>
      </div>
      {open && (
        <StatusPopover
          status={status}
          onClose={() => setOpen(false)}
          onSave={(s) => {
            updateStatus(s);
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}
