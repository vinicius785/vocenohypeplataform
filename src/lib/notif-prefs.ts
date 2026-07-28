const KEY = "config:notif-prefs";
const EVENT = "notif-prefs:changed";

export type NotifPrefs = {
  mensagens: boolean;
  mencoes: boolean;
  tarefas: boolean;
  tarefaAtividade: boolean;
  reunioes: boolean;
};

export const DEFAULT_NOTIF_PREFS: NotifPrefs = {
  mensagens: true,
  mencoes: true,
  tarefas: true,
  tarefaAtividade: true,
  reunioes: true,
};

export function loadNotifPrefs(): NotifPrefs {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULT_NOTIF_PREFS, ...JSON.parse(raw) } : DEFAULT_NOTIF_PREFS;
  } catch {
    return DEFAULT_NOTIF_PREFS;
  }
}

export function saveNotifPrefs(p: NotifPrefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent(EVENT));
}

/** Fires on changes made in this tab (custom event) or another tab (storage event). */
export function subscribeNotifPrefs(cb: () => void) {
  const handler = () => cb();
  window.addEventListener(EVENT, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(EVENT, handler);
    window.removeEventListener("storage", handler);
  };
}
