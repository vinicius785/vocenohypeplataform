import { useEffect, useState } from "react";
import { ChevronDown, KeyRound, Bug, ImageIcon, Trash2, Sliders } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  listBugReports,
  deleteBugReport,
  getBugScreenshotUrl,
  type BugReport,
} from "@/lib/bug-reports";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useConfirm } from "@/hooks/use-confirm";
import { usePerformanceSettings, savePerformanceSettings } from "@/lib/performance-events-store";
import type { PerformanceSettings } from "@/lib/performance-engine";

type PasswordResetRequest = {
  id: string;
  email: string;
  created_at: string;
  resolved: boolean;
};

/** Painel admin-only com os pedidos de "esqueci minha senha" feitos na tela
 * de login (sem sessão, então não têm como cair direto no perfil de
 * ninguém) — o admin vê o e-mail, reseta manualmente pela linha do membro
 * no ranking (ícone de chave) e marca aqui como resolvido. `isAdmin` já
 * vem calculado por quem monta o dashboard (`DiretorioTab`), evitando
 * repetir a mesma consulta `is_admin` que o painel fazia sozinho antes. */
function PasswordResetRequestsPanel({ isAdmin }: { isAdmin: boolean }) {
  const [open, setOpen] = useState(false);
  const [requests, setRequests] = useState<PasswordResetRequest[]>([]);
  const [loading, setLoading] = useState(false);
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
    if (open) void load();
  }, [open]);

  const resolve = async (id: string) => {
    setRequests((prev) => prev.filter((r) => r.id !== id));
    const { data: u } = await supabase.auth.getUser();
    const { error: err } = await supabase
      .from("password_reset_requests")
      .update({ resolved: true, resolved_at: new Date().toISOString(), resolved_by: u.user?.id })
      .eq("id", id);
    if (err) setError(err.message);
  };

  if (!isAdmin) return null;

  return (
    <div className="rounded-xl border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 px-5 py-4 text-left"
      >
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold text-foreground">Senhas esquecidas</span>
          {requests.length > 0 && (
            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
              {requests.length}
            </span>
          )}
        </div>
        <ChevronDown
          className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="space-y-3 border-t border-border px-5 py-4">
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
                  {new Date(r.created_at).toLocaleString("pt-BR")} · redefina pela linha do membro
                  no ranking (ícone de chave)
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void resolve(r.id)}
                className="shrink-0"
              >
                Marcar resolvido
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BugReportsPanel({ isAdmin }: { isAdmin: boolean }) {
  const [open, setOpen] = useState(false);
  const [reports, setReports] = useState<BugReport[]>([]);
  const [loading, setLoading] = useState(false);
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
    if (open) void load();
  }, [open]);

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

  if (!isAdmin) return null;

  return (
    <div className="rounded-xl border border-border bg-card">
      {confirmDialog}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 px-5 py-4 text-left"
      >
        <div className="flex items-center gap-2">
          <Bug className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold text-foreground">Bugs reportados</span>
          {reports.length > 0 && (
            <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-xs font-medium text-destructive">
              {reports.length}
            </span>
          )}
        </div>
        <ChevronDown
          className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="space-y-3 border-t border-border px-5 py-4">
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
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleDelete(r)}
                className="shrink-0 text-destructive hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}

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

/** Configuração dos pesos do Score Operacional e das regras de XP (item
 * 25 do pedido) — tudo aqui é configurável por Admin, EXCETO o corte de
 * 19h (fixo/global, hardcoded em `performance-engine.ts`, de propósito
 * fora deste painel). Singleton `performance_settings`, 1 linha só. */
function PerformanceSettingsPanel({ isAdmin }: { isAdmin: boolean }) {
  const [open, setOpen] = useState(false);
  const { settings, loading } = usePerformanceSettings();
  const [draft, setDraft] = useState<PerformanceSettings>(settings);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!loading) setDraft(settings);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  if (!isAdmin) return null;

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
    <div className="rounded-xl border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 px-5 py-4 text-left"
      >
        <div className="flex items-center gap-2">
          <Sliders className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold text-foreground">Configuração do Score e XP</span>
        </div>
        <ChevronDown
          className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="space-y-4 border-t border-border px-5 py-4">
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
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, xpTaskOnTime: Number(e.target.value) }))
                  }
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

          <p className="text-[11px] text-muted-foreground">
            O corte de 19h pra vencimento de tarefa é fixo pra toda a plataforma e não é
            configurável aqui.
          </p>

          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => void save()} disabled={saving || !weightSumOk}>
              {saving ? "Salvando..." : "Salvar"}
            </Button>
            {saved && (
              <span className="text-xs text-emerald-600 dark:text-emerald-400">Salvo!</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** "Administração" — senhas esquecidas e bugs reportados não competem
 * mais visualmente com os indicadores de gestão do time: viram uma
 * seção separada, mais discreta, no fim do dashboard. Cada item
 * continua no mesmo formato collapsible de sempre; a seção inteira some
 * pra quem não é admin (nenhum dos dois itens é visível pra membro
 * comum). */
export function TeamAdminSection({ isAdmin }: { isAdmin: boolean }) {
  if (!isAdmin) return null;
  return (
    <div className="space-y-3">
      <h3 className="px-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
        Administração
      </h3>
      <div className="space-y-3">
        <PasswordResetRequestsPanel isAdmin={isAdmin} />
        <BugReportsPanel isAdmin={isAdmin} />
        <PerformanceSettingsPanel isAdmin={isAdmin} />
      </div>
    </div>
  );
}
