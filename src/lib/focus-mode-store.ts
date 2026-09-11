/** Persistência local do Modo Foco — sessão ativa + preferências
 * (Pomodoro, áudio, ciclos, notificações internas). Mesmo padrão de
 * `notif-prefs.ts`: `localStorage` direto, evento próprio pra reatividade
 * na mesma aba + evento nativo `storage` pra outras abas, sem
 * dependência de nenhuma tabela remota (Modo Foco é 100% local, item 8 e
 * 18 do pedido). Cada chave carrega um `schemaVersion` — se o formato
 * salvo não bater com o esperado, descarta e recomeça do zero (é sessão
 * de foco: perder um estado com formato desatualizado nunca é
 * destrutivo pra dados reais da plataforma, só reinicia o cronômetro
 * local). */

export type FocusSessionKind = "foco" | "pausa_curta" | "pausa_longa";
export type FocusTimerStatus = "ocioso" | "em_andamento" | "pausado" | "concluido" | "encerrado";

export type FocusTaskOrigin = "projeto" | "campanha" | "marketing";

/** Referência mínima à tarefa selecionada — o suficiente pra re-resolver
 * via `findTaskContext`/`useTaskDirectory` (`task-directory.ts`) sem
 * duplicar o objeto inteiro no localStorage (que já vive nos stores de
 * cada módulo). `rawId` é o id sem o prefixo `mkt:` (ver
 * `TaskDirectoryEntry.rawId`), usado pra resolver a tarefa de verdade;
 * `title`/`projectName` ficam cacheados só pra exibir algo mesmo no
 * instante entre "página recarregou" e "lista de tarefas recarregou". */
export type FocusSelectedTask = {
  rawId: string;
  title: string;
  projectName: string;
  origin: FocusTaskOrigin;
};

export type FocusSession = {
  schemaVersion: 1;
  id: string;
  kind: FocusSessionKind;
  status: FocusTimerStatus;
  task: FocusSelectedTask | null;
  /** Duração total planejada desta etapa, em ms — nunca muda depois de
   * iniciada (reiniciar cria uma nova sessão com a mesma duração). */
  plannedMs: number;
  /** Timestamp ISO de quando esta etapa deve terminar — fonte de
   * verdade pra calcular o restante (`endsAt - Date.now()`), null
   * enquanto pausado/ocioso/encerrado. Nunca decrementado por um
   * contador; ver item 7 do pedido. */
  endsAt: string | null;
  /** Restante salvo no momento da pausa (ms) — usado pra recalcular um
   * novo `endsAt` ao continuar. */
  remainingMsAtPause: number | null;
  /** Tempo efetivamente focado nesta etapa, acumulado através de
   * pausas/retomadas (ms) — registrado ao concluir/encerrar, distinto
   * de `plannedMs` (o que foi planejado) por pedido explícito do
   * item 9. */
  focusedMs: number;
  startedAt: string;
  /** Índice do ciclo de foco atual (0-based), pra progresso discreto de
   * ciclos (item 10) — só avança quando um "foco" termina/some pra dar
   * lugar à pausa. */
  cycleIndex: number;
  /** Rota anterior à entrada no Modo Foco — usado por "Sair do foco"
   * pra voltar exatamente de onde veio (item 2). */
  returnTo: string;
  /** Marca a etapa como já registrada (evita registro duplicado ao
   * recarregar a página bem no instante da conclusão — item 7/9). */
  registeredAt: string | null;
};

export type FocusAudioCategory = "silencio" | "lofi" | "classica" | "chuva";

export type FocusPrefs = {
  schemaVersion: 1;
  focusMinutes: number;
  pausaCurtaMinutes: number;
  pausaLongaMinutes: number;
  ciclosAntesLongaPausa: number;
  autoStartPausa: boolean;
  autoStartFoco: boolean;
  lastCustomMinutes: number | null;
  audio: {
    category: FocusAudioCategory;
    trackId: string | null;
    volume: number;
    muted: boolean;
  };
  notifications: {
    /** Som interno ao concluir uma etapa — sempre disponível, não
     * depende de nenhuma permissão do navegador. */
    soundEnabled: boolean;
    /** Notificação do SO — só true depois de o usuário ativar
     * explicitamente nas preferências do Modo Foco (item 13: nunca
     * solicitada automaticamente ao abrir a tela). */
    browserEnabled: boolean;
  };
  /** Efeito visual de chuva no fundo — independente do áudio (item 2 da
   * rodada de refinamento): ligado por padrão, mas 100% opcional e sem
   * nenhuma relação com a faixa de áudio selecionada. */
  visual: {
    rainEnabled: boolean;
  };
};

export const DEFAULT_FOCUS_PREFS: FocusPrefs = {
  schemaVersion: 1,
  focusMinutes: 25,
  pausaCurtaMinutes: 5,
  pausaLongaMinutes: 15,
  ciclosAntesLongaPausa: 4,
  autoStartPausa: false,
  autoStartFoco: false,
  lastCustomMinutes: null,
  audio: { category: "silencio", trackId: null, volume: 0.6, muted: false },
  notifications: { soundEnabled: true, browserEnabled: false },
  visual: { rainEnabled: true },
};

const SESSION_KEY = "focus-mode:session:v1";
const PREFS_KEY = "focus-mode:prefs:v1";
const EVENT = "focus-mode:changed";

let channel: BroadcastChannel | null = null;
function getChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === "undefined") return null;
  if (!channel) {
    try {
      channel = new BroadcastChannel("focus-mode");
    } catch {
      return null;
    }
  }
  return channel;
}

function notifyChange() {
  window.dispatchEvent(new CustomEvent(EVENT));
  getChannel()?.postMessage({ type: "changed" });
}

export function loadFocusSession(): FocusSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as FocusSession;
    if (parsed?.schemaVersion !== 1) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveFocusSession(session: FocusSession | null): void {
  try {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore — sessão local, sem impacto em dado real */
  }
  notifyChange();
}

export function loadFocusPrefs(): FocusPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return DEFAULT_FOCUS_PREFS;
    const parsed = JSON.parse(raw) as Partial<FocusPrefs>;
    if (parsed?.schemaVersion !== 1) return DEFAULT_FOCUS_PREFS;
    return {
      ...DEFAULT_FOCUS_PREFS,
      ...parsed,
      audio: { ...DEFAULT_FOCUS_PREFS.audio, ...parsed.audio },
      notifications: { ...DEFAULT_FOCUS_PREFS.notifications, ...parsed.notifications },
      visual: { ...DEFAULT_FOCUS_PREFS.visual, ...parsed.visual },
    };
  } catch {
    return DEFAULT_FOCUS_PREFS;
  }
}

export function saveFocusPrefs(prefs: FocusPrefs): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
  notifyChange();
}

/** Dispara em mudanças feitas nesta aba (evento próprio + BroadcastChannel)
 * ou em outra aba (evento nativo `storage`, sempre disparado pelo
 * `localStorage.setItem` acima) — mesma ideia de `subscribeNotifPrefs`,
 * cobrindo também o `BroadcastChannel` pedido no item 14 pra sincronizar
 * abas sem esperar o delay do `storage` em alguns navegadores. */
export function subscribeFocusMode(cb: () => void): () => void {
  const handler = () => cb();
  window.addEventListener(EVENT, handler);
  window.addEventListener("storage", handler);
  const ch = getChannel();
  ch?.addEventListener("message", handler);
  return () => {
    window.removeEventListener(EVENT, handler);
    window.removeEventListener("storage", handler);
    ch?.removeEventListener("message", handler);
  };
}
