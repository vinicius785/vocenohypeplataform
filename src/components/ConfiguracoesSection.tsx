import { useEffect, useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import {
  User,
  Bell,
  Clock,
  Building2,
  Webhook,
  DollarSign,
  Users,
  Lock,
  Download,
  Sliders,
  Bot,
  Bug,
  ImageIcon,
  Trash2,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  listBugReports,
  deleteBugReport,
  getBugScreenshotUrl,
  type BugReport,
} from "@/lib/bug-reports";
import { getMe, setStatus as setPresenceStatus, type MemberStatus } from "@/lib/chat-store";
import { useConfirm } from "@/hooks/use-confirm";
import { useMyAccess, hasPermission } from "@/lib/permissions";
import { resolveConfigTab, type ConfigTab } from "@/lib/section-nav";
import { ConfiguracoesLayout } from "@/components/configuracoes/ConfiguracoesLayout";
import type { ConfigNavGroup } from "@/components/configuracoes/SettingsNav";
import {
  PerfilSection,
  loadPerfil,
  PERFIL_KEY,
  type Perfil,
} from "@/components/configuracoes/PerfilSection";
import { PreferenciasSection } from "@/components/configuracoes/PreferenciasSection";
import { DisponibilidadeSection } from "@/components/configuracoes/DisponibilidadeSection";
import { GeralSection } from "@/components/configuracoes/GeralSection";
import { IntegracoesSection } from "@/components/configuracoes/IntegracoesSection";
import { PrecificacaoSection } from "@/components/configuracoes/PrecificacaoSection";
import { TimePermissoesTab } from "@/components/configuracoes/TimePermissoesTab";
import { SegurancaSection } from "@/components/configuracoes/SegurancaSection";
import { DadosBackupSection } from "@/components/configuracoes/DadosBackupSection";
import { ScoreOperacionalSection } from "@/components/configuracoes/ScoreOperacionalSection";
import { HypitoReportTab } from "@/components/configuracoes/HypitoReportTab";

export type { Perfil };

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
const toPresenceStatus = (s: StatusKey): MemberStatus => (s === "ausente" ? "away" : s);
function applyPresenceStatus(next: UserStatus) {
  void setPresenceStatus(getMe().id, toPresenceStatus(next.status));
}

/**
 * Grupos/itens da navegação de Configurações (reconstrução completa —
 * ver plano). "Novidades" saiu daqui de propósito (não é uma
 * configuração; virou o botão "Novidades da plataforma" no rodapé da
 * sidebar, ver `AppShell.tsx`/`NovidadesButton.tsx`). Visibilidade por
 * item usa a MESMA condição booleana que antes decidia `LockedSection`
 * — a diferença é que agora, se a condição for falsa, o item some da
 * navegação em vez de aparecer bloqueado com cadeado.
 */
function buildGroups(
  canConfig: boolean,
  canSeeTimePermissoes: boolean,
  isAdmin: boolean,
): ConfigNavGroup[] {
  return [
    {
      label: "Minha conta",
      items: [
        { key: "perfil" as ConfigTab, label: "Perfil", icon: User },
        { key: "preferencias" as ConfigTab, label: "Preferências", icon: Bell },
        {
          key: "disponibilidade" as ConfigTab,
          label: "Disponibilidade",
          icon: Clock,
          keywords: ["reunião", "horário"],
        },
      ],
    },
    {
      label: "Workspace",
      items: [
        {
          key: "workspace" as ConfigTab,
          label: "Geral",
          icon: Building2,
          keywords: ["logo", "nome do workspace"],
        },
        {
          key: "integracoes" as ConfigTab,
          label: "Integrações",
          icon: Webhook,
          keywords: ["webhook", "google agenda"],
        },
        ...(canConfig
          ? [{ key: "precificacao" as ConfigTab, label: "Custos e precificação", icon: DollarSign }]
          : []),
        ...(canSeeTimePermissoes
          ? [{ key: "time_permissoes" as ConfigTab, label: "Time e permissões", icon: Users }]
          : []),
      ],
    },
    {
      label: "Segurança e dados",
      items: [
        ...(canConfig ? [{ key: "seguranca" as ConfigTab, label: "Segurança", icon: Lock }] : []),
        ...(isAdmin
          ? [{ key: "dados_backup" as ConfigTab, label: "Dados e backup", icon: Download }]
          : []),
      ],
    },
    {
      label: "Automação e administração",
      items: isAdmin
        ? [
            { key: "score_operacional" as ConfigTab, label: "Score operacional", icon: Sliders },
            { key: "hypito" as ConfigTab, label: "Relatório semanal do Hypito", icon: Bot },
          ]
        : [],
    },
  ].filter((g) => g.items.length > 0);
}

export function ConfiguracoesSection() {
  const search = useSearch({ from: "/_authenticated/time" });
  const navigate = useNavigate();
  const tab = resolveConfigTab(search.configTab);
  const setTab = (k: ConfigTab) => {
    void navigate({
      to: "/time",
      search: (prev) => ({ ...prev, section: "configuracoes", configTab: k }),
      replace: true,
    });
  };

  const [perfil, setPerfil] = useState<Perfil>(() => loadPerfil());
  const access = useMyAccess();
  const canConfig = hasPermission(access, "configuracoes");
  const canSeeTimePermissoes = canConfig || hasPermission(access, "membros");
  const isAdmin = !!access?.isAdmin;

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === PERFIL_KEY) setPerfil(loadPerfil());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const groups = buildGroups(canConfig, canSeeTimePermissoes, isAdmin);
  const activeLabel =
    groups.flatMap((g) => g.items).find((i) => i.key === tab)?.label ?? "Configurações";

  return (
    <ConfiguracoesLayout
      groups={groups}
      activeKey={tab}
      activeLabel={activeLabel}
      onSelect={setTab}
    >
      {tab === "perfil" && <PerfilSection perfil={perfil} setPerfil={setPerfil} />}
      {tab === "preferencias" && <PreferenciasSection />}
      {tab === "disponibilidade" && <DisponibilidadeSection />}
      {tab === "workspace" && <GeralSection canConfig={canConfig} />}
      {tab === "integracoes" && <IntegracoesSection />}
      {tab === "precificacao" && <PrecificacaoSection canConfig={canConfig} />}
      {tab === "time_permissoes" && canSeeTimePermissoes && <TimePermissoesTab />}
      {tab === "seguranca" && <SegurancaSection canConfig={canConfig} isAdmin={isAdmin} />}
      {tab === "dados_backup" && <DadosBackupSection isAdmin={isAdmin} />}
      {tab === "score_operacional" && <ScoreOperacionalSection isAdmin={isAdmin} />}
      {tab === "hypito" && (isAdmin ? <HypitoReportTab /> : null)}
    </ConfiguracoesLayout>
  );
}

/** Movido de `TeamAdminSection.tsx` — área exclusiva de admin/superadmin,
 * fora das configurações normais (NÃO faz parte da navegação de
 * Configurações). Exportado pra `AppShell.tsx` renderizar num botão
 * próprio no rodapé, visível só pra admin. */
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
                  className="h-9 w-full rounded-md border border-border bg-background px-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
                  required
                />
              </label>
              <label className="block space-y-1">
                <span className="text-xs font-medium">Motivo</span>
                <input
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  className="h-9 w-full rounded-md border border-border bg-background px-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
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
