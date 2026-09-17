import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  X,
  Play,
  Pause,
  RotateCcw,
  Square,
  PanelRightClose,
  PanelRightOpen,
  ListChecks,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { useConfirm } from "@/hooks/use-confirm";
import { useFocusSession } from "@/hooks/use-focus-session";
import { useAmbientAudio } from "@/hooks/use-ambient-audio";
import { CircularTimer } from "@/components/focus/CircularTimer";
import { FocusTaskList, FocusSelectedTaskBadge } from "@/components/focus/FocusTaskList";
import { AmbientPlayer } from "@/components/focus/AmbientPlayer";
import { FocusSettingsMenu } from "@/components/focus/FocusSettingsMenu";
import { RainOverlay } from "@/components/focus/RainOverlay";
import { TaskModalStack } from "@/components/tasks/TaskModalStack";
import { findTaskContext } from "@/lib/task-directory";
import { createManualEntry } from "@/lib/time-entries";
import { completeFocusTask } from "@/lib/focus-tasks";
import type { FocusSelectedTask, FocusSessionKind } from "@/lib/focus-mode-store";

const QUICK_MINUTES = [15, 25, 45, 60];
const MIN_CUSTOM = 1;
const MAX_CUSTOM = 180;

function formatClock(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

const KIND_LABEL: Record<FocusSessionKind, string> = {
  foco: "Foco",
  pausa_curta: "Pausa curta",
  pausa_longa: "Pausa longa",
};

/** Chime de conclusão — reaproveita o mesmo arquivo de áudio já usado
 * pelo chat (`public/sounds/notification.mp3`, `chat-store.ts`), não
 * inventa nem baixa um som novo. */
function playCompletionChime() {
  try {
    const chime = new Audio("/sounds/notification.mp3");
    void chime.play().catch(() => {});
  } catch {
    /* ambiente sem suporte a Audio — silenciosamente ignora */
  }
}

/** Dois modos escolhíveis no estado ocioso (item 7: "mostrar alternância
 * clara entre Foco e Pausa") — pausa longa continua só alcançável pelo
 * fluxo natural de ciclos, não faz sentido como ponto de partida. */
type PendingKind = "foco" | "pausa_curta";

export function FocusModeScreen({
  initialTaskId,
  returnTo,
}: {
  initialTaskId?: string;
  returnTo: string;
}) {
  const navigate = useNavigate();
  const {
    session,
    prefs,
    remainingMs,
    progress,
    startCustom,
    pause,
    resume,
    restart,
    endEarly,
    discardSession,
    markRegistered,
    selectTask,
    startNextAfterCompletion,
    updatePrefs,
  } = useFocusSession();
  const audio = useAmbientAudio();
  const { confirm, confirmDialog } = useConfirm();

  const [pendingTask, setPendingTask] = useState<FocusSelectedTask | null>(null);
  const [pendingKind, setPendingKind] = useState<PendingKind>("foco");
  const [pendingMinutes, setPendingMinutes] = useState(prefs.focusMinutes || 25);
  const [customMinutes, setCustomMinutes] = useState<string>("");
  const [customError, setCustomError] = useState<string | null>(null);
  const [taskPanelOpen, setTaskPanelOpen] = useState(true);
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);
  const [completionHandled, setCompletionHandled] = useState(false);
  const audioInitedRef = useRef(false);

  // Pré-seleciona a tarefa vinda de um acesso contextual ("Iniciar foco"
  // numa tarefa) — abre o Modo Foco com a tarefa já selecionada. Só roda
  // uma vez, e só quando ainda não há sessão ativa.
  useEffect(() => {
    if (!initialTaskId || session) return;
    const ctx = findTaskContext(initialTaskId);
    if (!ctx) return;
    setPendingTask({
      rawId: initialTaskId,
      title: ctx.task.title,
      projectName: ctx.breadcrumb,
      origin: ctx.scope.kind,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTaskId]);

  // Restaura volume/faixa salvos uma única vez.
  useEffect(() => {
    if (audioInitedRef.current) return;
    audioInitedRef.current = true;
    audio.setInitial(prefs.audio.trackId, prefs.audio.volume, prefs.audio.muted);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persiste preferências de áudio quando mudam (sem tocar sozinho — o
  // áudio nunca inicia sem interação explícita).
  useEffect(() => {
    updatePrefs({
      audio: {
        category: audio.currentTrack?.category ?? "silencio",
        trackId: audio.trackId,
        volume: audio.volume,
        muted: audio.muted,
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audio.trackId, audio.volume, audio.muted]);

  // Se a tarefa vinculada à sessão for removida/perder permissão, cai
  // pra sessão livre e avisa — nunca falha silenciosamente nem trava a
  // tela.
  useEffect(() => {
    if (!session?.task) return;
    const ctx = findTaskContext(session.task.rawId);
    if (!ctx) {
      selectTask(null);
      toast.info("A tarefa vinculada a esta sessão não está mais disponível. Sessão livre.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.task?.rawId]);

  // Som + notificação do navegador ao concluir. `registeredAt`, gravado
  // no PRÓPRIO objeto de sessão (não só numa ref local), garante que o
  // aviso dispara uma única vez mesmo se a página for recarregada logo
  // depois da conclusão — sem isso, recarregar enquanto uma sessão
  // concluída ainda não tinha sido "vista" tocava o som de novo.
  useEffect(() => {
    if (session?.status !== "concluido" || session.registeredAt) return;
    if (prefs.notifications.soundEnabled) playCompletionChime();
    if (
      prefs.notifications.browserEnabled &&
      document.hidden &&
      Notification.permission === "granted"
    ) {
      new Notification("Sessão de foco concluída", {
        body: session.kind === "foco" ? "Hora de uma pausa." : "Hora de voltar ao foco.",
      });
    }
    markRegistered();
    setCompletionHandled(false);
  }, [session?.status, session?.registeredAt, session?.kind, prefs.notifications, markRegistered]);

  // A sessão guarda sua própria rota de retorno (gravada no instante em
  // que foi iniciada) — prevalece sobre o `from` da navegação atual, que
  // só importa antes de existir sessão.
  const effectiveReturnTo = session?.returnTo ?? returnTo;

  const exitFocus = async () => {
    if (session && (session.status === "em_andamento" || session.status === "pausado")) {
      const ok = await confirm(
        "Há uma sessão de foco ativa. Sair mantém a sessão rodando em segundo plano — você pode voltar a qualquer momento pelo botão no cabeçalho.",
      );
      if (!ok) return;
    }
    navigate({ to: effectiveReturnTo || "/time" });
  };

  const handleEndSession = async () => {
    const ok = await confirm("Encerrar esta sessão antes do fim? O tempo parcial fica registrado.");
    if (!ok) return;
    endEarly();
  };

  const handleSwitchTaskDuringSession = (apply: () => void) => {
    return confirm("Trocar a tarefa desta sessão ativa?").then((ok) => {
      if (ok) apply();
    });
  };

  const resolveMinutes = (): number | null => {
    const raw = customMinutes.trim();
    if (!raw) return pendingMinutes;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < MIN_CUSTOM || parsed > MAX_CUSTOM) {
      setCustomError(`Informe um valor entre ${MIN_CUSTOM} e ${MAX_CUSTOM} minutos.`);
      return null;
    }
    return parsed;
  };

  const pickMinutes = (m: number) => {
    setPendingMinutes(m);
    setCustomMinutes("");
    setCustomError(null);
    // Salva a preferência mais recente por modo — reabrir o Modo Foco
    // (ou trocar entre Foco/Pausa) lembra o último valor escolhido.
    updatePrefs(pendingKind === "foco" ? { focusMinutes: m } : { pausaCurtaMinutes: m });
  };

  const pickKind = (kind: PendingKind) => {
    setPendingKind(kind);
    setCustomMinutes("");
    setCustomError(null);
    setPendingMinutes(kind === "foco" ? prefs.focusMinutes : prefs.pausaCurtaMinutes);
  };

  const startSession = () => {
    const minutes = resolveMinutes();
    if (minutes === null) return;
    setCustomError(null);
    if (customMinutes.trim()) updatePrefs({ lastCustomMinutes: minutes });
    // Reaproveita a tarefa de uma sessão anterior encerrada/concluída se
    // o usuário ainda não trocou manualmente.
    startCustom({
      minutes,
      kind: pendingKind,
      task: session?.task ?? pendingTask,
      returnTo: effectiveReturnTo,
    });
  };

  const isActive = session?.status === "em_andamento" || session?.status === "pausado";
  const isPaused = session?.status === "pausado";
  const isCompleted = session?.status === "concluido";
  const isEnded = session?.status === "encerrado";
  const displayTask = session?.task ?? pendingTask;
  const canResume = isPaused && remainingMs > 0;

  const timerTone = isCompleted ? "success" : isEnded ? "danger" : "brand";

  const handleMarkTaskComplete = async () => {
    if (!session?.task) return;
    const ok = await confirm(`Marcar "${session.task.title}" como concluída?`);
    if (!ok) return;
    completeFocusTask(session.task.rawId);
    toast.success("Tarefa concluída.");
    setCompletionHandled(true);
  };

  const handleAddTimeToTask = async () => {
    if (!session?.task) return;
    const { entry, error } = await createManualEntry({
      taskId: session.task.rawId,
      taskOrigin: session.task.origin,
      startedAt: session.startedAt,
      endedAt: new Date().toISOString(),
      note: "Registrado via Modo Foco",
    });
    if (error || !entry) {
      toast.error("Não foi possível adicionar o tempo à tarefa.");
      return;
    }
    toast.success("Tempo adicionado à tarefa.");
  };

  /** "Nova sessão" (concluído-foco) — volta pro estado ocioso mantendo a
   * mesma tarefa, sem sair do Modo Foco. */
  const handleNovaSessao = () => {
    setPendingTask(session?.task ?? pendingTask);
    setPendingKind("foco");
    discardSession();
  };

  /** "Finalizar"/"Finalizar ciclo" — encerra o ciclo de vez e sai do
   * Modo Foco, voltando pra rota de origem. */
  const handleFinalizar = () => {
    const target = effectiveReturnTo || "/time";
    discardSession();
    navigate({ to: target });
  };

  const taskListProps = {
    selected: displayTask,
    hasActiveSession: isActive,
    onFreeSession: () => {
      if (isActive) selectTask(null);
      else setPendingTask(null);
      setMobileSheetOpen(false);
    },
    onSelect: (t: FocusSelectedTask) => {
      if (isActive) selectTask(t);
      else setPendingTask(t);
      setMobileSheetOpen(false);
    },
    onRequestConfirmSwitch: handleSwitchTaskDuringSession,
  };

  const centerLabel = session
    ? KIND_LABEL[session.kind]
    : pendingKind === "foco"
      ? "Foco"
      : "Pausa";
  const centerTime = session ? formatClock(remainingMs) : formatClock(pendingMinutes * 60_000);

  const sessionCard = (
    <div className="flex w-full max-w-md flex-col items-center gap-7 rounded-[28px] border border-white/[0.05] bg-white/[0.015] px-6 py-9 sm:px-10">
      <div className="flex flex-col items-center gap-1.5 text-center">
        <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-white/35">
          Sessão de foco
        </p>
        <FocusSelectedTaskBadge
          task={displayTask}
          onClear={
            displayTask ? () => (isActive ? selectTask(null) : setPendingTask(null)) : undefined
          }
        />
        {!session && <p className="text-sm text-white/45">No que você vai focar?</p>}
      </div>

      <CircularTimer
        progress={session ? progress : 0}
        label={centerLabel}
        timeLabel={centerTime}
        tone={timerTone}
      />

      {!session && (
        <div className="flex items-center gap-1 rounded-full border border-white/[0.08] bg-white/[0.02] p-1">
          {(["foco", "pausa_curta"] as PendingKind[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => pickKind(k)}
              className={`rounded-full px-3.5 py-1 text-xs font-medium transition-colors ${
                pendingKind === k
                  ? "bg-brand text-brand-foreground"
                  : "text-white/50 hover:text-white/80"
              }`}
            >
              {k === "foco" ? "Foco" : "Pausa"}
            </button>
          ))}
        </div>
      )}

      {!isCompleted && !isActive && (
        <div className="flex flex-col items-center gap-2">
          <div className="flex flex-wrap items-center justify-center gap-2">
            {QUICK_MINUTES.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => pickMinutes(m)}
                className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
                  pendingMinutes === m && !customMinutes
                    ? "border-brand bg-brand text-brand-foreground"
                    : "border-white/[0.1] text-white/60 hover:border-white/25 hover:text-white/85"
                }`}
              >
                {m} min
              </button>
            ))}
            <input
              type="number"
              min={MIN_CUSTOM}
              max={MAX_CUSTOM}
              placeholder="Outro"
              value={customMinutes}
              onChange={(e) => setCustomMinutes(e.target.value)}
              className="w-20 rounded-full border border-white/[0.1] bg-transparent px-3 py-1.5 text-center text-sm text-white/85 outline-none placeholder:text-white/30 focus-visible:ring-1 focus-visible:ring-brand"
            />
          </div>
          {customError && <p className="text-xs text-danger">{customError}</p>}
        </div>
      )}

      {isCompleted && <p className="text-sm font-medium text-success">Sessão concluída</p>}
      {isEnded && <p className="text-sm font-medium text-danger">Sessão encerrada.</p>}

      <div className="flex flex-wrap items-center justify-center gap-2">
        {!session && (
          <Button variant="primary" size="lg" onClick={startSession}>
            <Play className="h-4 w-4" />{" "}
            {pendingKind === "foco" ? "Entrar em foco" : "Iniciar pausa"}
          </Button>
        )}

        {session?.status === "em_andamento" && (
          <>
            <Button
              variant="outline"
              className="border-white/[0.12] bg-transparent text-white/85 hover:bg-white/[0.06]"
              onClick={pause}
            >
              <Pause className="h-4 w-4" /> Pausar
            </Button>
            <Button
              variant="ghost"
              className="text-danger hover:bg-danger-soft hover:text-danger"
              onClick={() => void handleEndSession()}
            >
              <Square className="h-4 w-4" /> Encerrar
            </Button>
          </>
        )}

        {isPaused && (
          <>
            {canResume && (
              <Button variant="primary" onClick={resume}>
                <Play className="h-4 w-4" /> Continuar
              </Button>
            )}
            <Button variant="ghost" className="text-white/70 hover:text-white" onClick={restart}>
              <RotateCcw className="h-4 w-4" /> Reiniciar
            </Button>
            <Button
              variant="ghost"
              className="text-danger hover:bg-danger-soft hover:text-danger"
              onClick={() => void handleEndSession()}
            >
              <Square className="h-4 w-4" /> Encerrar
            </Button>
          </>
        )}

        {isCompleted && session.kind === "foco" && (
          <>
            <Button
              variant="primary"
              onClick={() => startNextAfterCompletion("pausa_curta", effectiveReturnTo)}
            >
              <Play className="h-4 w-4" /> Iniciar pausa
            </Button>
            <Button
              variant="outline"
              className="border-white/[0.12] bg-transparent text-white/85 hover:bg-white/[0.06]"
              onClick={handleNovaSessao}
            >
              Nova sessão
            </Button>
            <Button
              variant="ghost"
              className="text-white/60 hover:text-white"
              onClick={handleFinalizar}
            >
              Finalizar
            </Button>
          </>
        )}

        {isCompleted && session.kind !== "foco" && (
          <>
            <Button
              variant="primary"
              onClick={() => startNextAfterCompletion("foco", effectiveReturnTo)}
            >
              <Play className="h-4 w-4" /> Iniciar foco
            </Button>
            <Button
              variant="ghost"
              className="text-white/60 hover:text-white"
              onClick={handleFinalizar}
            >
              Finalizar ciclo
            </Button>
          </>
        )}

        {isEnded && (
          <Button variant="primary" size="lg" onClick={startSession}>
            <Play className="h-4 w-4" /> Nova sessão
          </Button>
        )}
      </div>

      {isCompleted && session.task && !completionHandled && (
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button
            variant="outline"
            className="border-white/[0.12] bg-transparent text-white/85 hover:bg-white/[0.06]"
            onClick={() => void handleMarkTaskComplete()}
          >
            Marcar tarefa como concluída
          </Button>
          <Button
            variant="ghost"
            className="text-white/60 hover:text-white"
            onClick={() => void handleAddTimeToTask()}
          >
            Adicionar este tempo à tarefa
          </Button>
        </div>
      )}
      {isEnded && session.task && (
        <div className="flex flex-wrap items-center justify-center gap-2">
          {!completionHandled && (
            <Button
              variant="outline"
              className="border-white/[0.12] bg-transparent text-white/85 hover:bg-white/[0.06]"
              onClick={() => void handleMarkTaskComplete()}
            >
              Marcar tarefa como concluída
            </Button>
          )}
          <Button
            variant="ghost"
            className="text-white/60 hover:text-white"
            onClick={() => void handleAddTimeToTask()}
          >
            Adicionar este tempo à tarefa
          </Button>
        </div>
      )}

      <AmbientPlayer audio={audio} compact={isActive} />
    </div>
  );

  const mainContent = (
    <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto px-4 py-8">
      {confirmDialog}
      {sessionCard}
    </div>
  );

  return (
    // z-40 (não z-[100] como o CallOverlay) — de propósito: esta tela
    // aninha diálogos Radix (confirmação, detalhe de tarefa, folha de
    // tarefas no mobile) que são portados pro <body> com z-50 fixo
    // (ui/dialog.tsx, ui/sheet.tsx, ui/alert-dialog.tsx); um z-index maior
    // aqui os deixaria escondidos atrás do fundo opaco desta tela.
    //
    // Fundo próximo de preto absoluto (#050506), sem nenhum glow/gradiente
    // azul — só o anel do cronômetro e pequenos elementos funcionais usam
    // `--brand`. Independente do tema global da plataforma (claro/escuro):
    // o Modo Foco é sempre esta experiência escura própria.
    <div className="fixed inset-0 z-40 flex flex-col overflow-hidden bg-[#050506] text-white">
      <RainOverlay enabled={prefs.visual.rainEnabled} />
      <header className="relative z-10 flex shrink-0 items-center justify-between gap-2 border-b border-white/[0.06] px-4 py-3">
        <Button
          type="button"
          variant="ghost"
          className="gap-1.5 text-white/60 hover:bg-white/[0.06] hover:text-white/90"
          onClick={() => void exitFocus()}
        >
          <X className="h-4 w-4" /> Sair do foco
        </Button>
        <div className="flex items-center gap-1">
          <FocusSettingsMenu prefs={prefs} onChange={updatePrefs} />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="hidden text-white/60 hover:bg-white/[0.06] hover:text-white/90 md:inline-flex"
            aria-label={taskPanelOpen ? "Recolher painel de tarefas" : "Mostrar painel de tarefas"}
            onClick={() => setTaskPanelOpen((v) => !v)}
          >
            {taskPanelOpen ? (
              <PanelRightClose className="h-4 w-4" />
            ) : (
              <PanelRightOpen className="h-4 w-4" />
            )}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="gap-1.5 text-white/60 hover:bg-white/[0.06] hover:text-white/90 md:hidden"
            onClick={() => setMobileSheetOpen(true)}
          >
            <ListChecks className="h-4 w-4" /> Escolher tarefa
          </Button>
        </div>
      </header>

      <div className="relative z-10 flex min-h-0 flex-1">
        {mainContent}
        {taskPanelOpen && (
          <aside className="hidden w-[26%] min-w-[280px] max-w-[380px] shrink-0 border-l border-white/[0.06] bg-white/[0.012] p-4 md:flex">
            <FocusTaskList {...taskListProps} />
          </aside>
        )}
      </div>

      <Sheet open={mobileSheetOpen} onOpenChange={setMobileSheetOpen}>
        <SheetContent
          side="bottom"
          className="h-[85dvh] border-white/10 bg-[#0a0a0b] p-4 text-white [&_[data-radix-scroll-area-viewport]]:h-full"
        >
          <SheetTitle className="text-white">Escolha sua tarefa</SheetTitle>
          <SheetDescription className="sr-only">
            Busque, filtre e selecione uma tarefa para esta sessão de foco.
          </SheetDescription>
          <div className="mt-2 h-[calc(100%-2rem)]">
            <FocusTaskList {...taskListProps} />
          </div>
        </SheetContent>
      </Sheet>

      <TaskModalStack />
    </div>
  );
}
