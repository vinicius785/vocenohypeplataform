/**
 * "Manter conectado" (tela de login) sem mexer no cliente Supabase gerado
 * — que já tem uma customização delicada de storage pro PWA do iPhone (ver
 * `src/integrations/supabase/client.ts`). Em vez de trocar onde a sessão é
 * persistida, guarda a preferência em `localStorage` (sobrevive fechar o
 * navegador) e marca a aba atual como "ativa" em `sessionStorage` (não
 * sobrevive fechar o navegador, só reload/navegação dentro da mesma aba).
 * Se alguém não marcou "manter conectado" e o app carrega sem o marcador de
 * aba ativa, é sinal de que o navegador foi fechado de vez e reaberto — a
 * sessão (ainda válida no Supabase) deve ser encerrada. Ver uso em
 * `src/routes/index.tsx` e `src/routes/_authenticated/route.tsx`.
 */
export const REMEMBER_KEY = "vnh:remember_me";
export const TAB_SESSION_KEY = "vnh:tab_session";

/** true = deve encerrar a sessão (não marcou "manter conectado" e esta é
 * uma aba/janela nova, não uma continuação da mesma). */
export function shouldExpireUnrememberedSession(): boolean {
  try {
    const remember = localStorage.getItem(REMEMBER_KEY);
    if (remember !== "false") return false;
    return sessionStorage.getItem(TAB_SESSION_KEY) !== "1";
  } catch {
    return false;
  }
}

export function markTabSessionActive() {
  try {
    sessionStorage.setItem(TAB_SESSION_KEY, "1");
  } catch {
    /* ignore */
  }
}
