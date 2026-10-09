/**
 * Escolha do vídeo da tela "Preparando seu ambiente". O vídeo vertical (1080×1920) serve telas em
 * retrato (celulares, janelas estreitas); o horizontal (1920×1080), as demais. Quem prefere
 * movimento reduzido não recebe vídeo nenhum (a tela mostra o indicador estático).
 */
export const LOADING_VIDEO_DESKTOP = "/brand/loading-desktop.mp4";
export const LOADING_VIDEO_MOBILE = "/brand/loading-mobile.mp4";

export type LoadingVideoChoice = { kind: "video"; src: string } | { kind: "static" };

export function pickLoadingVideo(env: {
  reducedMotion: boolean;
  portrait: boolean;
}): LoadingVideoChoice {
  if (env.reducedMotion) return { kind: "static" };
  return { kind: "video", src: env.portrait ? LOADING_VIDEO_MOBILE : LOADING_VIDEO_DESKTOP };
}

/** Duração dos dois vídeos (ambos têm 6 s). */
export const LOADING_VIDEO_DURATION_MS = 6000;
/** Folga para o início da reprodução (decodificação) depois que a tela aparece. */
const LOADING_VIDEO_START_MARGIN_MS = 300;
/** `pendingMinMs` padrão do roteador quando não há vídeo. */
const DEFAULT_PENDING_MIN_MS = 500;

/**
 * Tempo mínimo que o roteador mantém a tela "Preparando seu ambiente" depois que ela aparece, para
 * o vídeo tocar INTEIRO antes de trocar de tela (o `pendingMinMs` do roteador conta a partir de
 * quando a tela é exibida). Quem usa "reduzir movimento" não vê vídeo, então não espera.
 */
export function pendingMinMsForLoadingVideo(reducedMotion: boolean): number {
  return reducedMotion
    ? DEFAULT_PENDING_MIN_MS
    : LOADING_VIDEO_DURATION_MS + LOADING_VIDEO_START_MARGIN_MS;
}
