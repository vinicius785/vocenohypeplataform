import { useCallback, useEffect, useRef, useState } from "react";
import {
  loadFocusSession,
  saveFocusSession,
  loadFocusPrefs,
  saveFocusPrefs,
  subscribeFocusMode,
  type FocusSession,
  type FocusSessionKind,
  type FocusSelectedTask,
  type FocusPrefs,
} from "@/lib/focus-mode-store";
import {
  remainingMs,
  isDue,
  createSession,
  pauseSession,
  resumeSession,
  restartSession,
  completeSession,
  endSessionEarly,
} from "@/lib/focus-timer-engine";

const TICK_MS = 250;

function durationForKind(prefs: FocusPrefs, kind: FocusSessionKind): number {
  const minutes =
    kind === "foco"
      ? prefs.focusMinutes
      : kind === "pausa_curta"
        ? prefs.pausaCurtaMinutes
        : prefs.pausaLongaMinutes;
  return minutes * 60_000;
}

/** Hook único que orquestra sessão + preferências do Modo Foco pra
 * qualquer componente da tela (item 18: interface só consome este hook,
 * nunca mexe direto em `focus-mode-store`/`focus-timer-engine`).
 *
 * - Um único `setInterval` (nunca múltiplos — item 7), só pra forçar
 *   re-render; o valor exibido sempre vem de `remainingMs`, recalculado
 *   do `endsAt` real.
 * - `visibilitychange` recalcula na hora ao voltar a aba pro primeiro
 *   plano, sem esperar o próximo tick.
 * - Sincroniza entre abas via `subscribeFocusMode` (storage +
 *   BroadcastChannel) — cada aba deriva o mesmo restante do mesmo
 *   `endsAt` persistido, então não há dois cronômetros conflitantes.
 * - A CONCLUSÃO (transição pra "concluido" quando o tempo acaba) só é
 *   "reivindicada" por uma aba de cada vez: sempre relê a sessão do
 *   storage antes de gravar o status concluído, e só grava se ainda
 *   estiver "em_andamento" — evita dupla conclusão/registro entre abas. */
export function useFocusSession() {
  const [session, setSessionState] = useState<FocusSession | null>(() => loadFocusSession());
  const [prefs, setPrefsState] = useState<FocusPrefs>(() => loadFocusPrefs());
  const [, forceTick] = useState(0);

  const sync = useCallback(() => {
    setSessionState(loadFocusSession());
    setPrefsState(loadFocusPrefs());
  }, []);

  useEffect(() => subscribeFocusMode(sync), [sync]);

  // Tick único, só pra forçar recomputar `remainingMs` no render — nunca
  // decrementa nada sozinho.
  useEffect(() => {
    const iv = setInterval(() => forceTick((n) => n + 1), TICK_MS);
    return () => clearInterval(iv);
  }, []);

  // Recalcula imediatamente ao voltar ao primeiro plano (item 7).
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") forceTick((n) => n + 1);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  // Detecta e "reivindica" a conclusão pelo horário final — reprocessado
  // a cada tick/mudança de sessão, mas só grava uma vez (idempotente:
  // relê do storage e confere `status` antes de escrever).
  const completingRef = useRef(false);
  useEffect(() => {
    if (!session || completingRef.current) return;
    if (!isDue(session)) return;
    completingRef.current = true;
    const fresh = loadFocusSession();
    // Cobre tanto "em_andamento" que acabou de vencer quanto "pausado"
    // com restante já zerado (item 8: nunca restaurar/deixar uma sessão
    // presa em "pausado" no 0:00 — `isDue`, acima, já detecta os dois
    // casos; aqui só falta não gravar duas vezes se outra aba já
    // concluiu primeiro).
    if (
      fresh &&
      fresh.id === session.id &&
      (fresh.status === "em_andamento" || fresh.status === "pausado")
    ) {
      saveFocusSession(completeSession(fresh));
    }
    completingRef.current = false;
  });

  const remaining = session ? remainingMs(session) : 0;
  const progress = session && session.plannedMs > 0 ? 1 - remaining / session.plannedMs : 0;

  const start = useCallback(
    (params: { kind: FocusSessionKind; task: FocusSelectedTask | null; returnTo: string }) => {
      const p = loadFocusPrefs();
      const cycleIndex = params.kind === "foco" ? (loadFocusSession()?.cycleIndex ?? 0) : 0;
      const next = createSession({
        kind: params.kind,
        durationMs: durationForKind(p, params.kind),
        task: params.task,
        returnTo: params.returnTo,
        cycleIndex,
      });
      saveFocusSession(next);
    },
    [],
  );

  const startCustom = useCallback(
    (params: {
      task: FocusSelectedTask | null;
      returnTo: string;
      minutes: number;
      kind?: FocusSessionKind;
    }) => {
      const next = createSession({
        kind: params.kind ?? "foco",
        durationMs: Math.round(params.minutes * 60_000),
        task: params.task,
        returnTo: params.returnTo,
        cycleIndex: loadFocusSession()?.cycleIndex ?? 0,
      });
      saveFocusSession(next);
      saveFocusPrefs({ ...loadFocusPrefs(), lastCustomMinutes: params.minutes });
    },
    [],
  );

  const pause = useCallback(() => {
    const s = loadFocusSession();
    if (s) saveFocusSession(pauseSession(s));
  }, []);

  const resume = useCallback(() => {
    const s = loadFocusSession();
    if (s) saveFocusSession(resumeSession(s));
  }, []);

  const restart = useCallback(() => {
    const s = loadFocusSession();
    if (s) saveFocusSession(restartSession(s));
  }, []);

  /** Encerra antecipadamente — chamador decide se pede confirmação
   * antes (item 9/14: "Encerrar sessão" pede confirmação). */
  const endEarly = useCallback(() => {
    const s = loadFocusSession();
    if (s) saveFocusSession(endSessionEarly(s));
  }, []);

  /** Sai do Modo Foco SEM encerrar a sessão — só um flag de "não
   * mostrar" não existe aqui (a sessão continua rodando/pausada em
   * localStorage normalmente); a rota é quem decide voltar pra
   * `returnTo`, o hook não precisa fazer nada além de manter o estado. */
  const discardSession = useCallback(() => {
    saveFocusSession(null);
  }, []);

  /** Marca que os efeitos de conclusão (som/notificação) já foram
   * disparados pra esta sessão — persistido, não só em memória, senão
   * recarregar a página enquanto uma sessão concluída ainda não foi
   * vista de novo re-tocava o aviso (item 8/9: "não disparar múltiplos
   * avisos"). Chamado pela interface assim que ela toca o som/mostra a
   * notificação. */
  const markRegistered = useCallback(() => {
    const s = loadFocusSession();
    if (s && !s.registeredAt) saveFocusSession({ ...s, registeredAt: new Date().toISOString() });
  }, []);

  const selectTask = useCallback((task: FocusSelectedTask | null) => {
    const s = loadFocusSession();
    if (!s) return;
    saveFocusSession({ ...s, task });
  }, []);

  /** Inicia a próxima etapa (pausa depois de um foco, ou foco depois de
   * uma pausa) preservando a tarefa selecionada. `cycleIndex` conta
   * ciclos de FOCO concluídos desde a última pausa longa — usado só pra
   * exibir progresso discreto (item 10); zera ao iniciar uma pausa
   * longa, incrementa a cada foco concluído, mantém-se do jeito que
   * está ao entrar numa pausa curta. */
  const startNextAfterCompletion = useCallback((kind: FocusSessionKind, returnTo: string) => {
    const s = loadFocusSession();
    const p = loadFocusPrefs();
    const prevCycle = s?.cycleIndex ?? 0;
    const cycleIndex = kind === "pausa_longa" ? 0 : kind === "foco" ? prevCycle + 1 : prevCycle;
    const next = createSession({
      kind,
      durationMs: durationForKind(p, kind),
      task: s?.task ?? null,
      returnTo,
      cycleIndex,
    });
    saveFocusSession(next);
  }, []);

  const updatePrefs = useCallback((patch: Partial<FocusPrefs>) => {
    const p = loadFocusPrefs();
    saveFocusPrefs({
      ...p,
      ...patch,
      audio: { ...p.audio, ...patch.audio },
      notifications: { ...p.notifications, ...patch.notifications },
      visual: { ...p.visual, ...patch.visual },
    });
  }, []);

  return {
    session,
    prefs,
    remainingMs: remaining,
    progress: Math.min(1, Math.max(0, progress)),
    start,
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
  };
}
