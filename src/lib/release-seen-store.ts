/** Dedup do aviso de nova versão entre abas — mesmo padrão de
 * `BroadcastChannel` já usado em `focus-mode-store.ts`. Duas categorias
 * de dispensa, como pedido:
 * - "Ver novidades" → `localStorage["vnh:release-seen:{userId}"]`
 *   (persistente — nunca mais mostra o toast pra essa versão).
 * - "Agora não" → `sessionStorage["vnh:release-dismissed"]` (só nesta
 *   sessão/aba do navegador — reaparece na próxima sessão se ainda for
 *   a versão mais recente; dispensar uma versão nunca impede o aviso de
 *   uma versão futura).
 * Uma aba que mostra o aviso avisa as outras via `BroadcastChannel`, que
 * também consultam seu próprio `localStorage`/`sessionStorage` (já
 * compartilhado entre abas da mesma origem) — a mensagem existe pra
 * disparar a re-checagem imediatamente, sem esperar o próximo poll. */

const CHANNEL_NAME = "platform-release";
const EVENT = "platform-release:changed";

let channel: BroadcastChannel | null = null;
function getChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === "undefined") return null;
  if (!channel) {
    try {
      channel = new BroadcastChannel(CHANNEL_NAME);
    } catch {
      return null;
    }
  }
  return channel;
}

function notify() {
  window.dispatchEvent(new CustomEvent(EVENT));
  getChannel()?.postMessage({ type: "changed" });
}

const seenKey = (userId: string) => `vnh:release-seen:${userId}`;
const DISMISSED_KEY = "vnh:release-dismissed";

export function getSeenVersion(userId: string): string | null {
  try {
    return localStorage.getItem(seenKey(userId));
  } catch {
    return null;
  }
}

export function markReleaseSeen(userId: string, version: string): void {
  try {
    localStorage.setItem(seenKey(userId), version);
  } catch {
    /* localStorage indisponível — não é crítico, só reaparece o aviso */
  }
  notify();
}

export function getDismissedVersion(): string | null {
  try {
    return sessionStorage.getItem(DISMISSED_KEY);
  } catch {
    return null;
  }
}

export function markReleaseDismissed(version: string): void {
  try {
    sessionStorage.setItem(DISMISSED_KEY, version);
  } catch {
    /* ignore */
  }
  notify();
}

/** Assina mudanças feitas nesta aba (evento próprio) ou em outra aba
 * (`BroadcastChannel`) — usado pelo `HypitoReleaseAlert` pra esconder o
 * aviso imediatamente se outra aba já mostrou/dispensou. */
export function subscribeReleaseSeen(cb: () => void): () => void {
  const onEvent = () => cb();
  window.addEventListener(EVENT, onEvent);
  const ch = getChannel();
  ch?.addEventListener("message", onEvent);
  return () => {
    window.removeEventListener(EVENT, onEvent);
    ch?.removeEventListener("message", onEvent);
  };
}
