import type { SoundKind } from "./sound-manifest";

/**
 * Preferências de som — mesma infraestrutura de `notif-prefs.ts` (localStorage + evento), uma chave
 * POR USUÁRIO (vários usuários no mesmo navegador não herdam as preferências uns dos outros).
 * Som é complemento: desligar nunca esconde a notificação visual.
 */
export type SoundPrefs = {
  /** Interruptor geral: desligado, nenhum som toca. */
  enabled: boolean;
  /** 0–1. */
  volume: number;
  chat: boolean;
  commercial: boolean;
  meeting: boolean;
};

export const DEFAULT_SOUND_PREFS: SoundPrefs = {
  enabled: true,
  volume: 0.7,
  chat: true,
  commercial: true,
  meeting: true,
};

const EVENT = "sound-prefs:changed";
const keyFor = (userId: string) => `config:sound-prefs:${userId || "anon"}`;

export function normalizeSoundPrefs(raw: unknown): SoundPrefs {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<SoundPrefs>;
  const vol = typeof r.volume === "number" && Number.isFinite(r.volume) ? r.volume : 0.7;
  return {
    enabled: typeof r.enabled === "boolean" ? r.enabled : DEFAULT_SOUND_PREFS.enabled,
    volume: Math.min(1, Math.max(0, vol)),
    chat: typeof r.chat === "boolean" ? r.chat : DEFAULT_SOUND_PREFS.chat,
    commercial: typeof r.commercial === "boolean" ? r.commercial : DEFAULT_SOUND_PREFS.commercial,
    meeting: typeof r.meeting === "boolean" ? r.meeting : DEFAULT_SOUND_PREFS.meeting,
  };
}

export function loadSoundPrefs(userId: string): SoundPrefs {
  try {
    const raw = localStorage.getItem(keyFor(userId));
    return normalizeSoundPrefs(raw ? JSON.parse(raw) : null);
  } catch {
    return { ...DEFAULT_SOUND_PREFS };
  }
}

export function saveSoundPrefs(userId: string, prefs: SoundPrefs) {
  try {
    localStorage.setItem(keyFor(userId), JSON.stringify(normalizeSoundPrefs(prefs)));
  } catch {
    /* sem armazenamento: a preferência vale só nesta sessão */
  }
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function subscribeSoundPrefs(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

/** Decide se um evento deve tocar: interruptor geral E o do tipo. */
export function isSoundAllowed(prefs: SoundPrefs, kind: SoundKind): boolean {
  return prefs.enabled && prefs[kind];
}

/** Janela de supressão por tipo (cooldown). `last` = instante do último toque (ms) ou null. */
export function withinCooldown(now: number, last: number | null, cooldownMs: number): boolean {
  return cooldownMs > 0 && last !== null && now - last < cooldownMs;
}
