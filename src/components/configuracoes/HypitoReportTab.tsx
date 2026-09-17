import { useEffect, useMemo, useState } from "react";
import { Bot, Eye, Loader2, Pause, Play, RefreshCcw, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/EmptyState";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useConfirm } from "@/hooks/use-confirm";
import { getTeamDirectory } from "@/lib/team.functions";
import {
  getHypitoReportSettings,
  updateHypitoReportSettings,
  listHypitoReportRuns,
  generateHypitoReportPreview,
  sendHypitoReportNow,
  retryHypitoReportRun,
  pauseHypitoReport,
  resumeHypitoReport,
} from "@/lib/hypito-report.functions";
import { HYPITO_AVATAR_URL, HYPITO_NAME, HYPITO_TAGLINE } from "@/lib/hypito";
import { SURFACE } from "@/lib/design-tokens";

type Settings = Awaited<ReturnType<typeof getHypitoReportSettings>>;
type Run = Awaited<ReturnType<typeof listHypitoReportRuns>>[number];
type Preview = Awaited<ReturnType<typeof generateHypitoReportPreview>>;
type Person = { id: string; name: string };

const RUN_STATUS_LABEL: Record<string, string> = {
  running: "Em execução",
  success: "Publicado",
  failed: "Falhou",
};
const RUN_STATUS_TONE: Record<string, "brand" | "success" | "danger"> = {
  running: "brand",
  success: "success",
  failed: "danger",
};

function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

/** Próxima sexta-feira 17h em America/Sao_Paulo, só pra exibição — não é
 * usado por nenhuma lógica de agendamento de verdade (isso é o
 * `schedule` do Vercel Cron, ver `vercel.json`). */
function nextFridayLabel(weekday: number, _hour: number): string {
  const now = new Date();
  const tz = "America/Sao_Paulo";
  for (let i = 0; i < 14; i++) {
    const candidate = new Date(now.getTime() + i * 86_400_000);
    const dow = Number(
      new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "numeric" as never }).format(
        candidate,
      ),
    );
    if (dow % 7 === weekday) {
      return candidate.toLocaleDateString("pt-BR", { day: "2-digit", month: "long" });
    }
  }
  return "—";
}

export function HypitoReportTab() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const { confirm, confirmDialog } = useConfirm();

  const load = async () => {
    setLoading(true);
    try {
      const [s, r, team] = await Promise.all([
        getHypitoReportSettings(),
        listHypitoReportRuns(),
        getTeamDirectory(),
      ]);
      setSettings(s);
      setRuns(r);
      setPeople(team.map((m) => ({ id: m.id, name: m.name })));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const excludedSet = useMemo(() => new Set(settings?.excludedUserIds ?? []), [settings]);
  const lastRun = runs.find((r) => !r.preview);

  const toggleExcluded = async (userId: string) => {
    if (!settings) return;
    const next = excludedSet.has(userId)
      ? settings.excludedUserIds.filter((id) => id !== userId)
      : [...settings.excludedUserIds, userId];
    setSettings({ ...settings, excludedUserIds: next });
    await updateHypitoReportSettings({ data: { excludedUserIds: next } });
  };

  const toggleMentions = async () => {
    if (!settings) return;
    const next = !settings.mentionUsers;
    setSettings({ ...settings, mentionUsers: next });
    await updateHypitoReportSettings({ data: { mentionUsers: next } });
  };

  const handlePreview = async () => {
    setBusy("preview");
    try {
      const result = await generateHypitoReportPreview();
      setPreview(result);
      setPreviewOpen(true);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Falha ao gerar prévia.");
    } finally {
      setBusy(null);
    }
  };

  const handleSendNow = async () => {
    const mentionsWarning = settings?.mentionUsers
      ? "Pessoas com evidência no relatório serão marcadas e notificadas."
      : "Ninguém será marcado (menções desativadas nesta configuração).";
    if (
      !(await confirm(
        `Publicar o relatório semanal agora no canal Geral? ${mentionsWarning} Isso conta como a publicação oficial da semana — só é possível uma por semana.`,
      ))
    ) {
      return;
    }
    setBusy("send");
    try {
      const result = await sendHypitoReportNow();
      if (!result.ok) alert(`Falha ao publicar: ${result.error}`);
      await load();
    } finally {
      setBusy(null);
    }
  };

  const handleRetry = async (run: Run) => {
    if (
      !(await confirm(
        `Reprocessar a execução da semana de ${run.week_start}? Isso reaproveita a mesma execução — não cria uma publicação duplicada.`,
      ))
    ) {
      return;
    }
    setBusy(`retry:${run.id}`);
    try {
      const result = await retryHypitoReportRun();
      if (!result.ok) alert(`Falha ao reprocessar: ${result.error}`);
      await load();
    } finally {
      setBusy(null);
    }
  };

  const handleTogglePause = async () => {
    if (!settings) return;
    setBusy("toggle");
    try {
      if (settings.enabled) await pauseHypitoReport();
      else await resumeHypitoReport();
      await load();
    } finally {
      setBusy(null);
    }
  };

  if (loading || !settings) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className={`rounded-2xl ${SURFACE.raised} p-5`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <img
              src={HYPITO_AVATAR_URL}
              alt=""
              className="h-12 w-12 rounded-full object-cover"
              aria-hidden="true"
            />
            <div>
              <div className="flex items-center gap-2">
                <p className="text-[15px] font-semibold text-foreground">{HYPITO_NAME}</p>
                <Badge variant="brand">Assistente</Badge>
              </div>
              <p className="text-xs text-muted-foreground">{HYPITO_TAGLINE}</p>
            </div>
          </div>
          <Badge variant={settings.enabled ? "success" : "secondary"}>
            {settings.enabled ? "Ativo" : "Pausado"}
          </Badge>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Info label="Canal" value={`#${settings.channelSlug}`} />
          <Info label="Dia" value="Sexta-feira" />
          <Info label="Horário" value={`${settings.hour}:00`} />
          <Info label="Fuso" value={settings.timezone} />
          <Info label="Última execução" value={fmtDateTime(lastRun?.started_at ?? null)} />
          <Info
            label="Resultado"
            value={
              lastRun ? (RUN_STATUS_LABEL[lastRun.status] ?? lastRun.status) : "Nunca executado"
            }
          />
          <Info label="Próxima execução" value={nextFridayLabel(settings.weekday, settings.hour)} />
          <Info label="Menciona pessoas" value={settings.mentionUsers ? "Sim" : "Não"} />
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={handlePreview} disabled={busy !== null}>
            {busy === "preview" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Eye className="h-3.5 w-3.5" />
            )}
            Gerar prévia
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleSendNow}
            disabled={busy !== null || !settings.enabled}
          >
            {busy === "send" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
            Enviar agora
          </Button>
          <Button variant="outline" size="sm" onClick={handleTogglePause} disabled={busy !== null}>
            {settings.enabled ? (
              <Pause className="h-3.5 w-3.5" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )}
            {settings.enabled ? "Pausar automação" : "Reativar automação"}
          </Button>
          <Button variant="ghost" size="sm" onClick={toggleMentions} disabled={busy !== null}>
            {settings.mentionUsers ? "Desativar menções" : "Ativar menções"}
          </Button>
        </div>
      </div>

      <div className={`rounded-2xl ${SURFACE.raised} p-5`}>
        <p className="text-[15px] font-semibold text-foreground">Pessoas incluídas nos insights</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Todo integrante com acesso ao canal Geral aparece por padrão. Desmarcar remove a pessoa do
          relatório (resumo e menções), sem afetar nenhum outro dado da plataforma.
        </p>
        <div className="mt-3 max-h-64 space-y-1 overflow-y-auto">
          {people.map((p) => (
            <label
              key={p.id}
              className="flex cursor-pointer items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-muted/40"
            >
              <span className="text-foreground">{p.name}</span>
              <input
                type="checkbox"
                checked={!excludedSet.has(p.id)}
                onChange={() => void toggleExcluded(p.id)}
                className="h-3.5 w-3.5 accent-brand"
                aria-label={`Incluir ${p.name} no relatório semanal`}
              />
            </label>
          ))}
        </div>
      </div>

      <div className={`rounded-2xl ${SURFACE.raised} p-5`}>
        <p className="text-[15px] font-semibold text-foreground">Histórico de execuções</p>
        {runs.filter((r) => !r.preview).length === 0 ? (
          <EmptyState compact icon={<Bot className="h-4 w-4" />} title="Nenhuma execução ainda." />
        ) : (
          <div className="mt-3 divide-y divide-border/70">
            {runs
              .filter((r) => !r.preview)
              .map((r) => (
                <div
                  key={r.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm"
                >
                  <div className="min-w-0">
                    <p className="text-foreground">Semana de {r.week_start}</p>
                    <p className="text-xs text-muted-foreground">
                      {fmtDateTime(r.started_at)} ·{" "}
                      {r.trigger === "manual" ? "manual" : "automático"}
                      {r.duration_ms ? ` · ${Math.round(r.duration_ms / 1000)}s` : ""}
                    </p>
                    {r.error && <p className="mt-0.5 text-xs text-danger">{r.error}</p>}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge variant={RUN_STATUS_TONE[r.status] ?? "secondary"}>
                      {RUN_STATUS_LABEL[r.status] ?? r.status}
                    </Badge>
                    {r.status === "failed" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void handleRetry(r)}
                        disabled={busy !== null}
                      >
                        <RefreshCcw className="h-3.5 w-3.5" />
                        Reprocessar
                      </Button>
                    )}
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Prévia do relatório semanal</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            Esta prévia não publica nenhuma mensagem no Chat nem notifica ninguém.
          </p>
          <div className="max-h-[60vh] overflow-y-auto whitespace-pre-wrap rounded-lg border border-border bg-muted/30 p-3 text-sm text-foreground">
            {preview?.text}
          </div>
        </DialogContent>
      </Dialog>
      {confirmDialog}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}
