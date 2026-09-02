import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { DateField } from "@/components/ui/date-field";
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
  CalendarDays,
  Zap,
  DollarSign,
  Bug,
  Sliders,
  Users,
  History,
} from "lucide-react";
import { SectionHeader } from "./SectionHeader";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  listBugReports,
  deleteBugReport,
  getBugScreenshotUrl,
  type BugReport,
} from "@/lib/bug-reports";
import { usePerformanceSettings, savePerformanceSettings } from "@/lib/performance-events-store";
import type { PerformanceSettings } from "@/lib/performance-engine";
import {
  loadWorkspace,
  saveWorkspace,
  fetchWorkspace,
  canEditWorkspace,
  type Workspace,
} from "@/lib/workspace-store";
import { supabase } from "@/integrations/supabase/client";
import { saveMe, getMe, setStatus as setPresenceStatus, type MemberStatus } from "@/lib/chat-store";
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
import {
  startGoogleOAuth,
  getGoogleConnectionStatus,
  disconnectGoogleCalendar,
} from "@/lib/google-calendar.functions";
import { useConfirm } from "@/hooks/use-confirm";
import { type NotifPrefs, loadNotifPrefs, saveNotifPrefs } from "@/lib/notif-prefs";
import { savePushSubscription, deletePushSubscription } from "@/lib/push.functions";
import {
  isPushSupported,
  getExistingPushSubscription,
  subscribeBrowserToPush,
  pushSubscriptionToKeys,
} from "@/lib/push-notifications";
import { useMyAccess, hasPermission } from "@/lib/permissions";
import { LockedSection } from "./LockedSection";
import { loadPricing, fetchPricing, savePricing, type PricingSettings } from "@/lib/pricing-store";
import { TIERS, FORMATOS, type TierId, type FormatoId } from "@/lib/pricing";
import { TimePermissoesTab } from "@/components/configuracoes/TimePermissoesTab";
import { logSettingsAudit } from "@/lib/settings-audit";

type TabKey =
  | "perfil"
  | "preferencias"
  | "workspace"
  | "integracoes"
  | "precificacao"
  | "time_permissoes"
  | "seguranca"
  | "dados_backup"
  | "score_operacional";

type Perfil = {
  nome: string;
  email: string;
  telefone: string;
  aniversario: string;
  foto?: string;
};
export const APP_VERSION = "1.211.0";

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
// Aplica a escolha de status na presença real (tabela chat_status), além do
// espelho local em localStorage — sem isso o toggle aqui era só cosmético e
// não refletia no ponto de presença exibido pro resto do time.
const toPresenceStatus = (s: StatusKey): MemberStatus => (s === "ausente" ? "away" : s);
function applyPresenceStatus(next: UserStatus) {
  void setPresenceStatus(getMe().id, toPresenceStatus(next.status));
}

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

/** Abas que exigem a permissão "configuracoes" (ou ser admin). "perfil" e
 * "preferencias" são autoatendimento e ficam sempre acessíveis. "integracoes"
 * fica de fora: webhooks continuam admin-only (checado dentro da própria
 * aba), mas o Google Agenda é self-service — todo membro do time precisa
 * conseguir abrir a aba pra conectar a própria conta. "time_permissoes"
 * também fica de fora do gate padrão — além de "configuracoes", a permissão
 * decorativa "membros" já libera a navegação até ela (ver `permissions.ts`). */
const RESTRICTED_TABS: TabKey[] = ["workspace", "precificacao", "seguranca"];
/** Só admin de verdade — nada aqui é liberável por permissão granular. */
const ADMIN_TABS: TabKey[] = ["dados_backup", "score_operacional"];

/** 3 grupos fixos (item 1 do pedido de reorganização): Minha conta,
 * Workspace, Administração. Navegação vertical (não pílulas horizontais
 * infinitas) — reaproveita as mesmas classes `pill-nav-item`/
 * `pill-nav-item-active` já usadas na sidebar principal do app
 * (`AppShell.tsx`), então não é um padrão visual novo. */
const SETTINGS_GROUPS: {
  label: string;
  tabs: { k: TabKey; label: string; icon: typeof User }[];
}[] = [
  {
    label: "Minha conta",
    tabs: [
      { k: "perfil", label: "Meu Perfil", icon: User },
      { k: "preferencias", label: "Preferências", icon: Bell },
    ],
  },
  {
    label: "Workspace",
    tabs: [
      { k: "workspace", label: "Geral", icon: Building2 },
      { k: "integracoes", label: "Integrações", icon: Webhook },
      { k: "precificacao", label: "Custos e precificação", icon: DollarSign },
      { k: "time_permissoes", label: "Time e permissões", icon: Users },
      { k: "seguranca", label: "Segurança", icon: Lock },
      { k: "dados_backup", label: "Dados e backup", icon: Download },
    ],
  },
  {
    label: "Administração",
    tabs: [{ k: "score_operacional", label: "Score Operacional", icon: Sliders }],
  },
];

export function ConfiguracoesSection() {
  const [tab, setTab] = useState<TabKey>("perfil");
  const [perfil, setPerfil] = useState<Perfil>(() => loadPerfil());
  const [status, setStatus] = useState<UserStatus>(() => loadStatus());
  const access = useMyAccess();
  const canConfig = hasPermission(access, "configuracoes");
  const canSeeTimePermissoes = canConfig || hasPermission(access, "membros");

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
    applyPresenceStatus(next);
  };

  const locked = new Set<TabKey>();
  if (!canConfig) for (const k of RESTRICTED_TABS) locked.add(k);
  if (!access?.isAdmin) for (const k of ADMIN_TABS) locked.add(k);
  if (!canSeeTimePermissoes) locked.add("time_permissoes");

  return (
    <div className="mx-auto w-full max-w-5xl">
      <SectionHeader title="Configurações" subtitle="Preferências do workspace." />

      <div className="mt-6 flex flex-col gap-8 sm:flex-row">
        <SettingsNav tab={tab} setTab={setTab} locked={locked} />

        <div className="min-w-0 flex-1 space-y-6">
          {tab === "perfil" && <PerfilTab perfil={perfil} setPerfil={setPerfil} />}
          {tab === "workspace" && (canConfig ? <WorkspaceTab /> : <LockedSection title="Geral" />)}
          {tab === "preferencias" && <PreferenciasTab />}
          {tab === "integracoes" && <IntegracoesTab />}
          {tab === "precificacao" &&
            (canConfig ? <PrecificacaoTab /> : <LockedSection title="Custos e precificação" />)}
          {tab === "time_permissoes" &&
            (canSeeTimePermissoes ? (
              <TimePermissoesTab />
            ) : (
              <LockedSection title="Time e permissões" />
            ))}
          {tab === "seguranca" &&
            (canConfig ? (
              <SegurancaTab isAdmin={!!access?.isAdmin} />
            ) : (
              <LockedSection title="Segurança" />
            ))}
          {tab === "dados_backup" &&
            (access?.isAdmin ? <DadosTab /> : <LockedSection title="Dados e backup" />)}
          {tab === "score_operacional" &&
            (access?.isAdmin ? (
              <ScoreOperacionalTab />
            ) : (
              <LockedSection title="Configuração do Score Operacional" />
            ))}

          <p className="pt-2 text-center text-xs text-muted-foreground">Versão {APP_VERSION}</p>
        </div>
      </div>
    </div>
  );
}

function SettingsNav({
  tab,
  setTab,
  locked,
}: {
  tab: TabKey;
  setTab: (k: TabKey) => void;
  locked: Set<TabKey>;
}) {
  return (
    <nav className="w-full shrink-0 space-y-5 sm:w-52">
      {SETTINGS_GROUPS.map((group) => (
        <div key={group.label}>
          <p className="mb-1.5 px-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {group.label}
          </p>
          <div className="flex flex-row gap-1 overflow-x-auto sm:flex-col sm:overflow-visible">
            {group.tabs.map(({ k, label: tabLabel, icon: Icon }) => {
              const isLocked = locked.has(k);
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setTab(k)}
                  title={isLocked ? "Sem permissão — apenas visualização bloqueada" : undefined}
                  className={`flex w-full shrink-0 items-center gap-2 rounded-full px-2.5 py-1.5 text-left text-sm transition-colors sm:shrink ${
                    isLocked
                      ? "text-muted-foreground/40 hover:bg-muted/40"
                      : tab === k
                        ? "pill-nav-item pill-nav-item-active font-medium"
                        : "pill-nav-item text-muted-foreground"
                  }`}
                >
                  {isLocked ? <Lock className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
                  {tabLabel}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

/** "Senhas" (cofre) + "Senhas esquecidas" (pedidos de reset) como 2 blocos
 * dentro de uma única aba "Segurança" (item 8 do pedido) — o cofre exige só
 * "configuracoes"/canConfig (já checado por quem chama este componente),
 * mas "Senhas esquecidas" é mais sensível (aparece o e-mail de quem pediu) e
 * continua exigindo admin de verdade, então só esse segundo bloco tem gate
 * próprio. */
function SegurancaTab({ isAdmin }: { isAdmin: boolean }) {
  return (
    <div className="space-y-6">
      <SenhasTab />
      <div>
        {isAdmin ? (
          <SenhasEsquecidasTab />
        ) : (
          <div className="max-w-lg rounded-lg border border-dashed border-border bg-background p-4 text-center">
            <p className="text-xs text-muted-foreground">
              Apenas administradores podem ver pedidos de "esqueci minha senha".
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

type PasswordResetRequest = {
  id: string;
  email: string;
  created_at: string;
  resolved: boolean;
};

/** Pedidos de "esqueci minha senha" feitos na tela de login (sem
 * sessão, então não têm como cair direto no perfil de ninguém) — o
 * admin vê o e-mail, reseta manualmente pela linha do membro em Time →
 * Performance do Time (ícone de chave) e marca aqui como resolvido.
 * Movido de `TeamAdminSection.tsx` (a página Time não é mais o lugar de
 * administração da plataforma). */
function SenhasEsquecidasTab() {
  const [requests, setRequests] = useState<PasswordResetRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    const { data, error: err } = await supabase
      .from("password_reset_requests")
      .select("id, email, created_at, resolved")
      .eq("resolved", false)
      .order("created_at", { ascending: false });
    if (err) setError(err.message);
    else setRequests(data ?? []);
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  const resolve = async (id: string) => {
    setRequests((prev) => prev.filter((r) => r.id !== id));
    const { data: u } = await supabase.auth.getUser();
    const { error: err } = await supabase
      .from("password_reset_requests")
      .update({ resolved: true, resolved_at: new Date().toISOString(), resolved_by: u.user?.id })
      .eq("id", id);
    if (err) setError(err.message);
  };

  return (
    <div className="max-w-lg space-y-4">
      <div className="space-y-3 rounded-lg border border-border bg-background p-4">
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Senhas esquecidas</h3>
          {requests.length > 0 && (
            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
              {requests.length}
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Redefina a senha pela linha do membro em Time → Performance do Time (ícone de chave) e
          marque como resolvido aqui.
        </p>
        <div className="max-h-[420px] space-y-2 overflow-y-auto">
          {error && <p className="text-xs text-destructive">{error}</p>}
          {loading && <p className="text-xs text-muted-foreground">Carregando...</p>}
          {!loading && requests.length === 0 && (
            <p className="text-xs text-muted-foreground">Nenhum pedido pendente.</p>
          )}
          {requests.map((r) => (
            <div
              key={r.id}
              className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{r.email}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(r.created_at).toLocaleString("pt-BR")}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void resolve(r.id)}
                className="shrink-0 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted"
              >
                Marcar resolvido
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Movido de `TeamAdminSection.tsx` — mesmo motivo de `SenhasEsquecidasTab`.
 * NÃO faz parte da navegação de Configurações (item 10 do pedido: área
 * exclusiva de admin/superadmin, fora das configurações normais) —
 * exportado pra `AppShell.tsx` renderizar num botão próprio no rodapé,
 * visível só pra admin. */
export function BugsReportadosTab() {
  const [reports, setReports] = useState<BugReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<{ id: string; url: string } | null>(null);
  const { confirm, confirmDialog } = useConfirm();

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      setReports(await listBugReports("plataforma"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar relatos.");
    }
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  const handleDelete = async (r: BugReport) => {
    const ok = await confirm("Remover este relato de bug?");
    if (!ok) return;
    try {
      await deleteBugReport(r.id, r.screenshotPath);
      setReports((prev) => prev.filter((x) => x.id !== r.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao remover.");
    }
  };

  const handlePreview = async (r: BugReport) => {
    if (!r.screenshotPath) return;
    try {
      const url = await getBugScreenshotUrl(r.screenshotPath);
      setPreview({ id: r.id, url });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar print.");
    }
  };

  return (
    <div className="max-w-lg space-y-4">
      {confirmDialog}
      <div className="space-y-3 rounded-lg border border-border bg-background p-4">
        <div className="flex items-center gap-2">
          <Bug className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Bugs reportados</h3>
          {reports.length > 0 && (
            <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-xs font-medium text-destructive">
              {reports.length}
            </span>
          )}
        </div>
        <div className="max-h-[420px] space-y-2 overflow-y-auto">
          {error && <p className="text-xs text-destructive">{error}</p>}
          {loading && <p className="text-xs text-muted-foreground">Carregando...</p>}
          {!loading && reports.length === 0 && (
            <p className="text-xs text-muted-foreground">Nenhum bug reportado até agora.</p>
          )}
          {reports.map((r) => (
            <div
              key={r.id}
              className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:flex-row sm:items-start sm:justify-between"
            >
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {r.reporterName || r.clientLabel || "Sem nome"}
                  </span>
                  <span>{new Date(r.createdAt).toLocaleString("pt-BR")}</span>
                  {r.pageContext && <span className="truncate">{r.pageContext}</span>}
                </div>
                <p className="whitespace-pre-wrap text-sm text-foreground">{r.description}</p>
                {r.screenshotPath && (
                  <button
                    type="button"
                    onClick={() => handlePreview(r)}
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    <ImageIcon className="h-3.5 w-3.5" />
                    Ver print
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => handleDelete(r)}
                className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>

      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Print anexado</DialogTitle>
          </DialogHeader>
          {preview && (
            <img
              src={preview.url}
              alt="Print do bug"
              className="w-full rounded-md border border-border"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

const NUM_FIELD_CLS =
  "h-8 w-20 rounded-md border border-input bg-background px-2 text-xs outline-none focus:border-ring focus:ring-1 focus:ring-ring";

/** Configuração dos pesos do Score Operacional, das regras de XP e do
 * horário limite do expediente (deadline efetivo) — tudo aqui é
 * configurável por Admin. Singleton `performance_settings`, 1 linha só. Movido de
 * `TeamAdminSection.tsx`; renomeado de "Score e XP" pra "Configuração
 * do Score Operacional" — o XP não tem mais uma tela de ranking própria
 * na página Time, mas os campos continuam gravando `xpDelta` no ledger
 * normalmente, então ficam. */
function ScoreOperacionalTab() {
  const { settings, loading } = usePerformanceSettings();
  const [draft, setDraft] = useState<PerformanceSettings>(settings);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!loading) setDraft(settings);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  const weightSum = draft.weightExecucao + draft.weightPendencias + draft.weightCompromissos;
  const weightSumOk = Math.abs(weightSum - 1) < 0.01;

  const save = async () => {
    if (!weightSumOk) return;
    setSaving(true);
    setError("");
    setSaved(false);
    const { error: err } = await savePerformanceSettings(draft);
    if (err) setError(err);
    else setSaved(true);
    setSaving(false);
  };

  return (
    <div className="max-w-lg space-y-4">
      <div className="space-y-4 rounded-lg border border-border bg-background p-4">
        <div className="flex items-center gap-2">
          <Sliders className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Configuração do Score Operacional</h3>
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
        <div>
          <p className="mb-2 text-xs font-medium text-foreground">
            Pesos do Score Operacional
            <span
              className={`ml-2 font-normal ${weightSumOk ? "text-muted-foreground" : "text-destructive"}`}
            >
              (soma: {Math.round(weightSum * 100)}%)
            </span>
          </p>
          <div className="flex flex-wrap gap-3">
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              Execução
              <input
                type="number"
                min={0}
                max={100}
                value={Math.round(draft.weightExecucao * 100)}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, weightExecucao: Number(e.target.value) / 100 }))
                }
                className={NUM_FIELD_CLS}
              />
              %
            </label>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              Pendências
              <input
                type="number"
                min={0}
                max={100}
                value={Math.round(draft.weightPendencias * 100)}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, weightPendencias: Number(e.target.value) / 100 }))
                }
                className={NUM_FIELD_CLS}
              />
              %
            </label>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              Compromissos
              <input
                type="number"
                min={0}
                max={100}
                value={Math.round(draft.weightCompromissos * 100)}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, weightCompromissos: Number(e.target.value) / 100 }))
                }
                className={NUM_FIELD_CLS}
              />
              %
            </label>
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-medium text-foreground">Pendências e XP</p>
          <div className="flex flex-wrap gap-3">
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              Teto de dias (Pendências)
              <input
                type="number"
                min={1}
                value={draft.pendenciasDiasTeto}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, pendenciasDiasTeto: Number(e.target.value) }))
                }
                className={NUM_FIELD_CLS}
              />
            </label>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              XP tarefa no prazo
              <input
                type="number"
                value={draft.xpTaskOnTime}
                onChange={(e) => setDraft((d) => ({ ...d, xpTaskOnTime: Number(e.target.value) }))}
                className={NUM_FIELD_CLS}
              />
            </label>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              XP bônus antecipada
              <input
                type="number"
                value={draft.xpTaskEarlyBonus}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, xpTaskEarlyBonus: Number(e.target.value) }))
                }
                className={NUM_FIELD_CLS}
              />
            </label>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              XP reunião OK
              <input
                type="number"
                value={draft.xpMeetingAttended}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, xpMeetingAttended: Number(e.target.value) }))
                }
                className={NUM_FIELD_CLS}
              />
            </label>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              XP reunião perdida
              <input
                type="number"
                value={draft.xpMeetingMissed}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, xpMeetingMissed: Number(e.target.value) }))
                }
                className={NUM_FIELD_CLS}
              />
            </label>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              Teto de dias (penalidade XP)
              <input
                type="number"
                min={1}
                value={draft.xpOverdueDiasTeto}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, xpOverdueDiasTeto: Number(e.target.value) }))
                }
                className={NUM_FIELD_CLS}
              />
            </label>
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-medium text-foreground">Regras de prazo</p>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            Horário limite do expediente
            <input
              type="number"
              min={0}
              max={23}
              value={draft.deadlineCutoffHour}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  deadlineCutoffHour: Math.min(23, Math.max(0, Number(e.target.value))),
                }))
              }
              className={NUM_FIELD_CLS}
            />
            h
          </label>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Uma tarefa com prazo hoje só vira "atrasada" depois desse horário — antes disso, ainda
            conta como dentro do prazo mesmo que o dia já tenha virado.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || !weightSumOk}
            className="rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Salvando..." : "Salvar"}
          </button>
          {saved && <span className="text-xs text-emerald-600 dark:text-emerald-400">Salvo!</span>}
        </div>
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
    <div className="max-w-lg space-y-4">
      <PushNotificationsCard />
      <div className="space-y-3 rounded-lg border border-border bg-background p-4">
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
    </div>
  );
}

/** Notificação push de verdade (celular/desktop) — hoje dispara pra mensagem
 * de DM e @menção no chat (ver sendChatPush em push.functions.ts). Só
 * funciona com o app instalado no iPhone (iOS 16.4+); no Android/desktop
 * (Chrome/Edge) funciona mesmo sem instalar. */
function PushNotificationsCard() {
  const saveFn = useServerFn(savePushSubscription);
  const deleteFn = useServerFn(deletePushSubscription);
  const [status, setStatus] = useState<"loading" | "off" | "on" | "unsupported" | "denied">(
    "loading",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isPushSupported()) {
      setStatus("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setStatus("denied");
      return;
    }
    void getExistingPushSubscription().then((sub) => setStatus(sub ? "on" : "off"));
  }, []);

  const enable = async () => {
    setBusy(true);
    setError("");
    try {
      const sub = await subscribeBrowserToPush();
      await saveFn({ data: pushSubscriptionToKeys(sub) });
      setStatus("on");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível ativar.");
      if (Notification.permission === "denied") setStatus("denied");
    } finally {
      setBusy(false);
    }
  };
  const disable = async () => {
    setBusy(true);
    setError("");
    try {
      const sub = await getExistingPushSubscription();
      if (sub) {
        await deleteFn({ data: { endpoint: sub.endpoint } });
        await sub.unsubscribe();
      }
      setStatus("off");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível desativar.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2 rounded-lg border border-border bg-background p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Notificações no celular/desktop</h3>
          <p className="text-xs text-muted-foreground">
            Receba um aviso mesmo com o app fechado (mensagens diretas e menções no chat).
          </p>
        </div>
        {status === "on" ? (
          <button
            type="button"
            onClick={() => void disable()}
            disabled={busy}
            className="shrink-0 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted disabled:opacity-50"
          >
            Desativar
          </button>
        ) : status === "off" ? (
          <button
            type="button"
            onClick={() => void enable()}
            disabled={busy}
            className="shrink-0 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90 disabled:opacity-50"
          >
            Ativar
          </button>
        ) : null}
      </div>
      {status === "unsupported" && (
        <p className="text-xs text-muted-foreground">
          Este navegador não suporta notificações push. No iPhone, funciona a partir do iOS 16.4 — e
          só depois de instalar o app na tela de início (Safari → Compartilhar → "Adicionar à Tela
          de Início").
        </p>
      )}
      {status === "denied" && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          Notificações bloqueadas nas permissões do navegador/sistema — reative manualmente para
          ativar aqui.
        </p>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

/** Só admin — checado por quem chama este componente
 * (`ConfiguracoesSection`, gate `access?.isAdmin`), já que o arquivo
 * gerado contém todo o localStorage sincronizado do workspace (senhas
 * criptografadas incluídas). Toda exportação fica registrada em
 * `settings_audit_log` (quem exportou e quando), pra manter rastro de um
 * dado sensível saindo do navegador. */
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
      logSettingsAudit({ category: "export", action: "Exportou dados do workspace (.json)" });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-4 rounded-lg border border-border bg-background p-4">
      <div className="flex items-center gap-2">
        <Download className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Dados e backup</h3>
      </div>
      <div>
        <p className="mb-1.5 text-xs font-medium text-foreground">O que será exportado</p>
        <p className="text-xs text-muted-foreground">
          Um arquivo JSON com os dados deste workspace armazenados neste navegador: clientes,
          projetos, comercial, financeiro, senhas (criptografadas), entre outros — útil como backup
          manual, já que parte da plataforma depende de localStorage sincronizado. Só
          administradores podem exportar, e cada exportação fica registrada.
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
 * Integrações — Calendário (Google Agenda) é self-service, disponível
 * a qualquer membro; Entrada/Saída (webhooks) exigem admin, checado
 * seção a seção (não trava a aba inteira).
 * ============================================================ */

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
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {badge}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

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

  return (
    <div className="max-w-4xl space-y-10">
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
        title="Automação"
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
      description="Conecte sua conta pra ver suas reuniões da plataforma direto no Google Agenda (sincronização de mão única, a cada poucos minutos)."
      status={
        status.state === "connected"
          ? "connected"
          : status.state === "disconnected"
            ? "disconnected"
            : undefined
      }
    >
      {callbackNotice === "error" && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          Não foi possível conectar sua conta Google. Tente novamente.
        </p>
      )}
      {status.state === "loading" && <p className="text-xs text-muted-foreground">Carregando...</p>}
      {status.state === "disconnected" && (
        <button
          type="button"
          onClick={connect}
          disabled={connecting}
          className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90 disabled:opacity-50"
        >
          {connecting ? "Redirecionando..." : "Conectar Google Agenda"}
        </button>
      )}
      {status.state === "connected" && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            Conectado{status.email ? ` como ${status.email}` : ""}.
          </p>
          <button
            type="button"
            onClick={disconnect}
            disabled={disconnecting}
            className="shrink-0 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
          >
            {disconnecting ? "Desconectando..." : "Desconectar"}
          </button>
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

/** Indicador visual de status (item 4 do pedido: ●Conectado/○Não
 * conectado/⚠Erro) — só passado por integrações com um estado real de
 * conexão (Google Agenda); webhooks (config, não "conectado/desconectado")
 * não usam este prop. */
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
        <h3 className="text-sm font-semibold text-foreground">Geral</h3>
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

/** Configuração dos percentuais fixos da agência + a matriz de custo médio
 * por Tier×Formato usados pelo Simulador de Proposta (Comercial) — mesmos
 * parâmetros da planilha "Calculadora custos op" do Caio, trazidos pra
 * plataforma. Mesmo padrão de carregar/salvar de `WorkspaceTab`. */
const PCT_FIELD_LABEL: Record<keyof PricingSettings["percentuais"], string> = {
  imposto: "Imposto",
  comissao: "Comissão de vendas",
  bonificacao: "Bonificação",
  margem: "Margem de lucro",
};

/** Resumo textual do que mudou entre duas versões de `PricingSettings`,
 * pra gravar em `settings_audit_log.detail` (item 5 do pedido: histórico
 * com valor anterior/novo). Só percentuais entram na descrição — a
 * matriz de custo tem 72 células, então mudanças ali viram só uma
 * contagem, não uma linha por célula. */
function diffPricing(before: PricingSettings, after: PricingSettings): string | null {
  const parts: string[] = [];
  for (const key of Object.keys(PCT_FIELD_LABEL) as (keyof PricingSettings["percentuais"])[]) {
    const from = before.percentuais[key];
    const to = after.percentuais[key];
    if (from !== to) {
      parts.push(
        `${PCT_FIELD_LABEL[key]}: ${(from * 100).toFixed(1)}% → ${(to * 100).toFixed(1)}%`,
      );
    }
  }
  let custosChanged = 0;
  for (const t of TIERS) {
    for (const f of FORMATOS) {
      if ((before.custos[t.id]?.[f.id] ?? null) !== (after.custos[t.id]?.[f.id] ?? null)) {
        custosChanged++;
      }
    }
  }
  if (custosChanged > 0) parts.push(`${custosChanged} custo(s) por tier/formato`);
  return parts.length ? parts.join("; ") : null;
}

function PrecificacaoTab() {
  const [settings, setSettings] = useState<PricingSettings>(() => loadPricing());
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const baselineRef = useRef<PricingSettings | null>(null);

  useEffect(() => {
    void fetchPricing().then((w) => {
      setSettings(w);
      baselineRef.current = w;
    });
  }, []);

  const setPct = (key: keyof PricingSettings["percentuais"], percentValue: string) => {
    const n = Number(percentValue.replace(",", "."));
    setSettings((s) => ({
      ...s,
      percentuais: { ...s.percentuais, [key]: Number.isFinite(n) ? n / 100 : 0 },
    }));
  };

  const setCusto = (tier: TierId, formato: FormatoId, value: string) => {
    const n = Number(value.replace(/[^\d.,]/g, "").replace(",", "."));
    setSettings((s) => ({
      ...s,
      custos: {
        ...s.custos,
        [tier]: { ...s.custos[tier], [formato]: value.trim() ? n || 0 : undefined },
      },
    }));
  };

  const totalPct =
    (settings.percentuais.imposto +
      settings.percentuais.comissao +
      settings.percentuais.bonificacao +
      settings.percentuais.margem) *
    100;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setSaving(true);
    const res = await savePricing(settings);
    setSaving(false);
    if (res.error) {
      setErr(res.error);
      return;
    }
    const detail = baselineRef.current ? diffPricing(baselineRef.current, settings) : null;
    if (detail) logSettingsAudit({ category: "pricing", action: "Atualizou precificação", detail });
    baselineRef.current = settings;
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <form onSubmit={save} className="space-y-5">
      {historyOpen && <PricingHistoryDialog onClose={() => setHistoryOpen(false)} />}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Custos e precificação</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Parâmetros usados pelo Simulador de Proposta (Comercial).
          </p>
        </div>
        <button
          type="button"
          onClick={() => setHistoryOpen(true)}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted"
        >
          <History className="h-3.5 w-3.5" />
          Ver histórico
        </button>
      </div>
      <div className="space-y-4 rounded-lg border border-border bg-background p-5">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Percentuais da agência</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Usados pelo Simulador de Proposta (Comercial) pra calcular o preço final a partir do
            custo dos influenciadores: Preço final = Custo total ÷ (1 − soma dos percentuais).
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(
            [
              ["imposto", "Imposto"],
              ["comissao", "Comissão de vendas"],
              ["bonificacao", "Bonificação"],
              ["margem", "Margem de lucro"],
            ] as [keyof PricingSettings["percentuais"], string][]
          ).map(([key, label]) => (
            <label key={key} className="block space-y-1 text-xs font-medium text-muted-foreground">
              <span>{label} (%)</span>
              <input
                type="number"
                step="0.1"
                min="0"
                max="100"
                value={(settings.percentuais[key] * 100).toFixed(1).replace(/\.0$/, "")}
                onChange={(e) => setPct(key, e.target.value)}
                className="h-9 w-full rounded-md border border-border bg-background px-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </label>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Total: <span className="font-medium text-foreground">{totalPct.toFixed(1)}%</span>
          {totalPct >= 100 && (
            <span className="ml-1.5 text-destructive">
              — não pode chegar a 100%, o preço final ficaria infinito.
            </span>
          )}
        </p>
      </div>

      <div className="space-y-3 rounded-lg border border-border bg-background p-5">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Custo médio por Tier × Formato</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Valores praticados com os influenciadores, em R$. Deixe em branco quando não fizer
            sentido pro tier (ex.: Live geralmente não é orçado à parte).
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-xs">
            <thead>
              <tr>
                <th className="sticky left-0 bg-background px-2 py-1.5 text-left font-medium text-muted-foreground">
                  Tier
                </th>
                {FORMATOS.map((f) => (
                  <th
                    key={f.id}
                    className="px-2 py-1.5 text-left font-medium text-muted-foreground"
                  >
                    {f.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {TIERS.map((t) => (
                <tr key={t.id} className="border-t border-border">
                  <td className="sticky left-0 whitespace-nowrap bg-background px-2 py-1.5 font-medium text-foreground">
                    {t.label}
                  </td>
                  {FORMATOS.map((f) => (
                    <td key={f.id} className="px-2 py-1">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={settings.custos[t.id]?.[f.id] ?? ""}
                        onChange={(e) => setCusto(t.id, f.id, e.target.value)}
                        placeholder="—"
                        className="h-8 w-24 rounded-md border border-border bg-background px-2 text-xs outline-none focus:ring-2 focus:ring-ring"
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex items-center justify-end gap-3">
        {err && <span className="text-xs text-destructive">{err}</span>}
        {saved && <span className="text-xs text-emerald-600">Salvo</span>}
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90 disabled:opacity-50"
        >
          {saving ? "Salvando…" : "Salvar alterações"}
        </button>
      </div>
    </form>
  );
}

type PricingAuditRow = {
  id: string;
  action: string;
  detail: string | null;
  actor_name: string;
  created_at: string;
};

/** Histórico de alterações de precificação (item 5 do pedido) — lê
 * `settings_audit_log` filtrado por `category = 'pricing'`, já gravado por
 * `PrecificacaoTab.save()` a cada mudança de percentual/custo. */
function PricingHistoryDialog({ onClose }: { onClose: () => void }) {
  const [rows, setRows] = useState<PricingAuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void supabase
      .from("settings_audit_log")
      .select("id, action, detail, actor_name, created_at")
      .eq("category", "pricing")
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data, error: err }) => {
        if (cancelled) return;
        if (err) setError(err.message);
        else setRows((data ?? []) as PricingAuditRow[]);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Histórico de alterações — Precificação</DialogTitle>
        </DialogHeader>
        <div className="max-h-[420px] space-y-2 overflow-y-auto">
          {error && <p className="text-xs text-destructive">{error}</p>}
          {loading && <p className="text-xs text-muted-foreground">Carregando...</p>}
          {!loading && rows.length === 0 && (
            <p className="text-xs text-muted-foreground">Nenhuma alteração registrada ainda.</p>
          )}
          {rows.map((r) => (
            <div key={r.id} className="rounded-lg border border-border p-3">
              <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{r.actor_name}</span>
                <span>{new Date(r.created_at).toLocaleString("pt-BR")}</span>
              </div>
              {r.detail && <p className="mt-1 text-xs text-foreground">{r.detail}</p>}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
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

function SettingsSectionHeader({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <div className="mt-0.5 text-muted-foreground">{icon}</div>
      <div>
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

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
    <div className="max-w-2xl space-y-8">
      <section className="space-y-3">
        <SettingsSectionHeader
          icon={<User className="h-4 w-4" />}
          title="Perfil"
          description="Nome, foto e contato exibidos pro resto do time."
        />
        <PerfilForm
          p={p}
          setP={setP}
          error={error}
          save={save}
          saving={saving}
          saved={saved}
          onPickFile={onPickFile}
          initials={initials}
        />
      </section>

      <div className="border-t border-border" />

      <section className="space-y-3">
        <SettingsSectionHeader
          icon={<Mic className="h-4 w-4" />}
          title="Áudio e vídeo"
          description="Microfone, câmera e saída de áudio usados nas chamadas da plataforma."
        />
        <AVTab />
      </section>
    </div>
  );
}

function PerfilForm({
  p,
  setP,
  error,
  save,
  saving,
  saved,
  onPickFile,
  initials,
}: {
  p: Perfil;
  setP: (p: Perfil) => void;
  error: string;
  save: (e: React.FormEvent) => void;
  saving: boolean;
  saved: boolean;
  onPickFile: (file?: File | null) => void;
  initials: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

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
        <DateField
          value={p.aniversario || undefined}
          onChange={(v) => setP({ ...p, aniversario: v ?? "" })}
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
    applyPresenceStatus(next);
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
