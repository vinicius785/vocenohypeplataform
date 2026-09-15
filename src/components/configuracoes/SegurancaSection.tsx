import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Lock,
  KeyRound,
  ShieldCheck,
  Clock,
  Plus,
  X,
  Eye,
  EyeOff,
  Copy,
  Pencil,
  Search,
} from "lucide-react";
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
import { SettingsCard, SettingsSectionHeader } from "./settings-shared";

type Senha = {
  id: string;
  nome: string;
  categoria: string;
  usuario: string;
  senha: string;
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

const inputCls =
  "h-9 w-full rounded-md border border-border bg-background px-2.5 text-sm outline-none focus:ring-2 focus:ring-ring";

export function SegurancaSection({ canConfig, isAdmin }: { canConfig: boolean; isAdmin: boolean }) {
  if (!canConfig) return <LockedSection title="Segurança" />;
  return (
    <div className="space-y-6">
      <SettingsSectionHeader
        icon={<Lock className="h-4 w-4" />}
        title="Segurança"
        description="Autenticação em dois fatores, cofre de senhas e pedidos de recuperação."
      />
      <VaultTotpEnroll />
      <SenhasCard />
      <SenhasEsquecidasCard isAdmin={isAdmin} />
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
    <SettingsCard title="Autenticador (Google Authenticator)">
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
    return <VaultUnlockCard onUnlock={() => setUnlocked(true)} isAdmin={isAdmin} />;
  }

  return (
    <SettingsCard title="Cofre de senhas">
      <div className="space-y-4">
        {getVaultExpiry() !== null && <VaultExpiryBanner expiresAt={getVaultExpiry()!} />}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-64 max-w-full">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar ferramenta ou rede social"
              className="h-9 w-full rounded-md border border-border bg-background pl-8 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <Button
            type="button"
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
            className="ml-auto"
          >
            <Plus className="h-3.5 w-3.5" />
            Nova senha
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

        <p className="text-[11px] text-muted-foreground">
          Só admins têm acesso permanente. Cada senha fica criptografada com a chave do cofre — sem
          ela, ninguém lê o conteúdo, nem quem tem acesso direto ao banco de dados. Quem não é admin
          pode pedir acesso temporário de 10 minutos.
        </p>

        {filtered.length === 0 ? (
          <EmptyState
            compact
            icon={<KeyRound className="h-5 w-5" />}
            title={items.length === 0 ? "Nenhuma senha cadastrada" : "Nenhum resultado"}
          />
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
      </div>

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
    </SettingsCard>
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
  const [copiedField, setCopiedField] = useState<"usuario" | "senha" | null>(null);
  const copy = (v: string, field: "usuario" | "senha") => {
    navigator.clipboard?.writeText(v);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 1200);
  };
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
          <IconButton label="Editar" onClick={onEdit}>
            <Pencil className="h-3.5 w-3.5" />
          </IconButton>
          <IconButton label="Remover" onClick={onDelete}>
            <X className="h-3.5 w-3.5" />
          </IconButton>
        </div>
      </div>
      <dl className="mt-3 space-y-1.5 text-xs">
        {s.usuario && (
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-muted-foreground">{s.usuario}</span>
            <IconButton
              label={copiedField === "usuario" ? "Copiado!" : "Copiar usuário"}
              onClick={() => copy(s.usuario, "usuario")}
            >
              <Copy className="h-3 w-3" />
            </IconButton>
          </div>
        )}
        <div className="flex items-center justify-between gap-2">
          <span className="truncate font-mono text-muted-foreground">
            {show ? plainSenha : "•".repeat(Math.min(12, plainSenha.length || 8))}
          </span>
          <div className="flex items-center gap-1">
            <IconButton
              label={show ? "Ocultar senha" : "Mostrar senha"}
              onClick={() => setShow((v) => !v)}
            >
              {show ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
            </IconButton>
            <IconButton
              label={copiedField === "senha" ? "Copiado!" : "Copiar senha"}
              onClick={() => copy(plainSenha, "senha")}
            >
              <Copy className="h-3 w-3" />
            </IconButton>
          </div>
        </div>
        {s.url && (
          <a
            href={s.url}
            target="_blank"
            rel="noreferrer"
            className="block truncate text-[11px] text-sky-600 hover:underline dark:text-sky-400"
            title={s.url}
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
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" size="sm" disabled={saving}>
            {saving ? "Salvando..." : "Salvar"}
          </Button>
        </div>
      </form>
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
      <SettingsCard title="Solicitações de recuperação">
        <p className="text-xs text-muted-foreground">
          Apenas administradores podem ver pedidos de "esqueci minha senha".
        </p>
      </SettingsCard>
    );
  }

  return (
    <SettingsCard
      title="Solicitações de recuperação"
      description="Redefina a senha pela linha do membro em Time → Performance do Time (ícone de chave) e marque como resolvido aqui."
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
