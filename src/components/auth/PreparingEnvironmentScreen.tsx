import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { pickLoadingVideo, type LoadingVideoChoice } from "@/lib/loading-video";

/**
 * Shared "Preparando seu ambiente…" screen. Reused in three places so the
 * transition between "authenticated" and "landed on the right home" never
 * shows a blank/generic spinner:
 *  - src/routes/index.tsx: the mount-time already-authenticated redirect
 *    check, and the post-login `completeLogin()` gap.
 *  - src/routes/_authenticated/route.tsx: `pendingComponent`.
 *  - src/routes/portal-app/route.tsx: implicitly via the same pattern if a
 *    pendingComponent is added there.
 *
 * Mostra a animação da marca (vídeo em loop, sem áudio): horizontal em telas largas, vertical em
 * retrato. As bordas do vídeo são pretas, então o fundo preto o funde à tela sem emendas. Com
 * "reduzir movimento" ou se o vídeo falhar, volta ao indicador estático anterior. O vídeo é
 * decorativo; o estado "carregando" é anunciado por texto para leitores de tela.
 */
export function PreparingEnvironmentScreen() {
  // `pending` até o cliente saber a orientação/preferência (o servidor não sabe): fundo preto, sem
  // piscar a tela clara do indicador antigo.
  const [choice, setChoice] = useState<LoadingVideoChoice | "pending">("pending");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const portrait = window.matchMedia("(orientation: portrait)");
    const update = () =>
      setChoice(pickLoadingVideo({ reducedMotion: reduced.matches, portrait: portrait.matches }));
    update();
    reduced.addEventListener("change", update);
    portrait.addEventListener("change", update);
    return () => {
      reduced.removeEventListener("change", update);
      portrait.removeEventListener("change", update);
    };
  }, []);

  if (choice !== "pending" && (choice.kind === "static" || failed)) return <StaticPreparing />;

  return (
    <div
      className="flex min-h-[100dvh] w-full items-center justify-center bg-black"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span className="sr-only">Preparando seu ambiente…</span>
      {choice !== "pending" && (
        <video
          // `key`: ao girar o aparelho troca de arquivo (remonta o elemento).
          key={choice.src}
          src={choice.src}
          className="h-[100dvh] w-full object-contain"
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          disablePictureInPicture
          disableRemotePlayback
          aria-hidden="true"
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
}

/** Indicador anterior (movimento reduzido ou vídeo indisponível). */
function StaticPreparing() {
  return (
    <div className="flex min-h-[100dvh] w-full items-center justify-center bg-background p-6">
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl bg-foreground text-background shadow-lg ring-1 ring-border">
          <span className="text-sm font-semibold tracking-tight" aria-hidden="true">
            VH
          </span>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          <span>Preparando seu ambiente…</span>
        </div>
      </div>
    </div>
  );
}
