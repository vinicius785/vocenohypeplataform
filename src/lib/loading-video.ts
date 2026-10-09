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
