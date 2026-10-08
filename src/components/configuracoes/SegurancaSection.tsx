import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Lock, KeyRound, ShieldCheck, Clock, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { EmptyState } from "@/components/shared/EmptyState";
import { LockedSection } from "@/components/LockedSection";
import { supabase } from "@/integrations/supabase/client";
import { useStorageSync } from "@/lib/use-storage-sync";
import { useConfirm } from "@/hooks/use-confirm";
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
import { MfaEnrollCard } from "./MfaEnrollCard";
import { SettingsCard, SettingsSectionHeader } from "./settings-shared";
import { NativeSelect } from "@/components/ui/native-select";
import { toast } from "sonner";
import { CATEGORIAS, DECRYPT_FAILED, filterSenhas, type Senha } from "./cofre/cofre-model";
import { SenhaTile } from "./cofre/SenhaTile";
import { SenhaDetail } from "./cofre/SenhaDetail";
import { SenhaForm } from "./cofre/SenhaForm";

const SENHAS_KEY = "config:senhas";
const loadSenhas = (): Senha[] => {
  try {
    const raw = localStorage.getItem(SENHAS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

export function SegurancaSection({ canConfig, isAdmin }: { canConfig: boolean; isAdmin: boolean }) {
  if (!canConfig) return <LockedSection title="Segurança" />;
  return (
    <div className="space-y-6">
      <SettingsSectionHeader
        icon={<Lock className="h-4 w-4" />}
        title="Segurança"
        description="Acesso à sua conta, autenticador do cofre e pedidos de recuperação de senha."
      />
      <MfaEnrollCard isAdmin={isAdmin} />
      <VaultTotpEnroll />
      <SenhasEsquecidasCard isAdmin={isAdmin} />
    </div>
  );
}

/** Cofre de senhas — mesma lógica de antes (criptografia, desbloqueio, acesso temporário), agora
 * em página própria dentro do grupo Segurança. */
export function CofreSection({ canConfig }: { canConfig: boolean }) {
  if (!canConfig) return <LockedSection title="Cofre de senhas" />;
  return (
    <div className="space-y-6">
      <SettingsSectionHeader
        icon={<KeyRound className="h-4 w-4" />}
        title="Cofre de senhas"
        description="Credenciais de ferramentas e redes sociais, criptografadas com a chave do cofre."
      />
      <SenhasCard />
    </div>
  );
}

/** Admins never type anything here — they're trusted by role, so this fetches
 * the vault key from the server the moment the tab is admin-confirmed and
 * unlocks automatically. Everyone else only ever gets a 10-minute grant from
 * an admin (see VaultRequestAccess below). */
function VaultUnlockCard({ onUnlock, isAdmin }: { onUnlock: () => void; isAdmin: boolean }) {
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
      <SettingsCard>
        <div className="mx-auto max-w-sm space-y-3 py-4 text-center">
          <Lock className="mx-auto h-6 w-6 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">Cofre</h3>
          {error ? (
            <div className="space-y-2">
              <p className="text-xs text-destructive">{error}</p>
              <Button
                type="button"
                size="sm"
                onClick={() => void unlock()}
                disabled={busy}
                className="w-full"
              >
                Tentar novamente
              </Button>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Carregando acesso de admin...</p>
          )}
        </div>
      </SettingsCard>
    );
  }

  return (
    <SettingsCard>
      <VaultRequestAccess onGranted={onUnlock} />
    </SettingsCard>
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
    <div className="mx-auto max-w-sm space-y-3 py-4 text-center">
      <Lock className="mx-auto h-6 w-6 text-muted-foreground" />
      <h3 className="text-sm font-semibold text-foreground">Cofre restrito a admins</h3>
      <p className="text-xs text-muted-foreground">
        Digite o código de 6 dígitos do Google Authenticator de um admin para ter acesso temporário
        (10 minutos).
      </p>
      <form onSubmit={submit} className="space-y-2">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="000000"
          className="h-9 w-full rounded-md border border-border bg-background px-3 text-center font-mono text-sm tracking-[0.3em] outline-none focus:ring-2 focus:ring-ring"
        />
        {error && <p className="text-xs text-destructive">{error}</p>}
        <Button type="submit" disabled={busy || code.length !== 6} className="w-full">
          <ShieldCheck className="h-3.5 w-3.5" />
          {busy ? "Verificando..." : "Desbloquear"}
        </Button>
      </form>
    </div>
  );
}

/** Card de destaque pro estado do autenticador — item explícito do
 * pedido de redesenho de Segurança ("dar destaque ao estado do
 * autenticador com um card de segurança"). */
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

  return (
    <SettingsCard
      layout="split"
      title="Autenticador do cofre"
      description="Google Authenticator: gera o código de 6 dígitos usado para liberar acesso temporário ao cofre."
    >
      {confirmDialog}
      {status.enrolled && !secret ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            Configurado — para dar acesso a alguém, peça o código de 6 dígitos do app.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => void regenerate()}
          >
            {busy ? "Gerando..." : "Gerar nova chave"}
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Ainda não configurado. Sem isso, ninguém sem a chave de admin consegue pedir acesso
            temporário.
          </p>
          {secret && (
            <div className="space-y-1.5 rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
              <p className="text-[11px] text-amber-700 dark:text-amber-400">
                Adicione manualmente no Google Authenticator (tipo "baseado em tempo") — essa chave
                não aparece de novo depois que você sair desta tela.
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 truncate rounded bg-background px-2 py-1 font-mono text-xs">
                  {secret}
                </code>
                <Button type="button" variant="outline" size="sm" onClick={copy}>
                  {copied ? "Copiado!" : "Copiar"}
                </Button>
              </div>
            </div>
          )}
          {!secret && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => void enroll()}
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              {busy ? "Gerando..." : "Configurar autenticador"}
            </Button>
          )}
        </div>
      )}
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
    </SettingsCard>
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

function SenhasCard() {
  const [items, setItems] = useState<Senha[]>(() => loadSenhas());
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Senha | null>(null);
  const [unlocked, setUnlocked] = useState(() => isVaultUnlocked());
  const [decrypted, setDecrypted] = useState<Record<string, string>>({});
  const [isAdmin, setIsAdmin] = useState(false);
  useStorageSync(SENHAS_KEY, () => setItems(loadSenhas()));

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

  useEffect(() => onVaultLocked(() => setUnlocked(false)), []);

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
          next[s.id] = DECRYPT_FAILED;
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

  const [categoria, setCategoria] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null);
  const { confirm, confirmDialog } = useConfirm();

  const filtered = useMemo(() => filterSenhas(items, query, categoria), [items, query, categoria]);
  const hasFilter = query.trim() !== "" || categoria !== "";

  const copyValue = (value: string, what: string) => {
    void navigator.clipboard?.writeText(value);
    toast.success(`${what} copiado`);
  };

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

  const requestRemove = async (s: Senha) => {
    const ok = await confirm(`Excluir a credencial "${s.nome}"? Essa ação não pode ser desfeita.`, {
      title: "Excluir senha?",
      confirmLabel: "Excluir",
      destructive: true,
    });
    if (!ok) return;
    persist(items.filter((x) => x.id !== s.id));
    if (detailId === s.id) setDetailId(null);
  };

  if (!unlocked) {
    return <VaultUnlockCard onUnlock={() => setUnlocked(true)} isAdmin={isAdmin} />;
  }

  const detail = items.find((x) => x.id === detailId) ?? null;
  const plainOf = (s: Senha) => decrypted[s.id] ?? (s.encrypted ? undefined : s.senha);
  const openNew = () => {
    setEditing(null);
    setOpen(true);
  };
  const openEdit = (s: Senha) => {
    setDetailId(null);
    setEditing(s);
    setOpen(true);
  };

  return (
    <div className="space-y-5">
      {confirmDialog}
      {getVaultExpiry() !== null && <VaultExpiryBanner expiresAt={getVaultExpiry()!} />}

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
            placeholder="Buscar ferramenta ou rede social"
            aria-label="Buscar ferramenta ou rede social"
            className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand"
          />
        </div>
        <NativeSelect
          value={categoria}
          onChange={(e) => setCategoria(e.target.value)}
          aria-label="Filtrar por categoria"
          className="w-auto min-w-[10rem]"
          selectClassName="border-input bg-background shadow-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <option value="">Todas as categorias</option>
          {CATEGORIAS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </NativeSelect>
        <div className="ml-auto flex items-center gap-1.5">
          <Button type="button" variant="primary" onClick={openNew}>
            <Plus className="h-3.5 w-3.5" /> Nova senha
          </Button>
          <IconButton
            label="Bloquear cofre"
            onClick={() => {
              lockVault();
              setUnlocked(false);
            }}
          >
            <Lock className="h-3.5 w-3.5" />
          </IconButton>
        </div>
      </div>

      {filtered.length === 0 ? (
        items.length === 0 ? (
          <EmptyState
            compact
            icon={<KeyRound className="h-5 w-5" />}
            title="Nenhuma credencial cadastrada"
            description="Adicione uma senha para começar a organizar os acessos do workspace."
            primaryAction={{ label: "Nova senha", onClick: openNew }}
          />
        ) : (
          <EmptyState
            compact
            icon={<Search className="h-5 w-5" />}
            title="Nenhuma credencial encontrada"
            description="Não encontramos uma ferramenta ou acesso com esse nome."
            secondaryAction={
              hasFilter
                ? {
                    label: "Limpar busca",
                    onClick: () => {
                      setQuery("");
                      setCategoria("");
                    },
                  }
                : undefined
            }
          />
        )
      ) : (
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {filtered.map((s) => {
            const plain = plainOf(s);
            return (
              <SenhaTile
                key={s.id}
                s={s}
                canCopySenha={plain !== undefined && plain !== DECRYPT_FAILED}
                onOpen={() => setDetailId(s.id)}
                onEdit={() => openEdit(s)}
                onDelete={() => void requestRemove(s)}
                onCopyUsuario={() => copyValue(s.usuario, "Usuário")}
                onCopySenha={() => plain && copyValue(plain, "Senha")}
              />
            );
          })}
        </ul>
      )}

      {detail && (
        <SenhaDetail
          s={detail}
          plainSenha={plainOf(detail)}
          onClose={() => setDetailId(null)}
          onEdit={() => openEdit(detail)}
          onCopy={copyValue}
        />
      )}

      {open && (
        <SenhaForm
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

type PasswordResetRequest = { id: string; email: string; created_at: string; resolved: boolean };

function SenhasEsquecidasCard({ isAdmin }: { isAdmin: boolean }) {
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
    if (isAdmin) void load();
  }, [isAdmin]);

  const resolve = async (id: string) => {
    setRequests((prev) => prev.filter((r) => r.id !== id));
    const { data: u } = await supabase.auth.getUser();
    const { error: err } = await supabase
      .from("password_reset_requests")
      .update({ resolved: true, resolved_at: new Date().toISOString(), resolved_by: u.user?.id })
      .eq("id", id);
    if (err) setError(err.message);
  };

  if (!isAdmin) {
    return (
      <SettingsCard layout="split" title="Recuperação de senha">
        <p className="text-xs text-muted-foreground">
          Apenas administradores podem ver pedidos de "esqueci minha senha".
        </p>
      </SettingsCard>
    );
  }

  return (
    <SettingsCard
      layout="split"
      title="Recuperação de senha"
      description="Pedidos de “esqueci minha senha”. Redefina a senha pela linha do membro em Time → Performance do Time (ícone de chave) e marque como resolvido aqui."
    >
      {error && <p className="mb-2 text-xs text-destructive">{error}</p>}
      {loading ? (
        <p className="text-xs text-muted-foreground">Carregando...</p>
      ) : requests.length === 0 ? (
        <EmptyState
          compact
          icon={<KeyRound className="h-5 w-5" />}
          title="Nenhum pedido pendente"
        />
      ) : (
        <div className="max-h-[420px] space-y-2 overflow-y-auto">
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
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void resolve(r.id)}
                className="shrink-0"
              >
                Marcar resolvido
              </Button>
            </div>
          ))}
        </div>
      )}
    </SettingsCard>
  );
}
