import type { ReactNode } from "react";
import { HYPITO_AVATAR_URL } from "@/lib/hypito";
import Grainient from "@/components/Grainient";

/**
 * Shared dark card shell for every auth-adjacent screen (login, esqueci
 * senha, MFA, redefinir senha, seleção de ambiente, acesso pendente/
 * bloqueado, criar senha). Centralizes the background + card container so
 * each route only supplies its own header/body/footer content, keeping
 * them visually identical without copy-pasting the wrapper JSX five times.
 *
 * `prefers-reduced-motion` is respected by disabling the Grainient's own
 * time-based animation (`timeSpeed`/`grainAnimated`) — the same idea as the
 * `motion-reduce:` Tailwind variant already used elsewhere in the app,
 * applied here via a media query check since Grainient takes numeric props
 * rather than CSS classes.
 */
function usePrefersReducedMotion() {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

export function AuthCardShell({
  children,
  showHeader = true,
}: {
  children: ReactNode;
  /** Set false for screens (e.g. the loading/checking gate) that render
   * their own centered content without the logo+card chrome. */
  showHeader?: boolean;
}) {
  const reducedMotion = usePrefersReducedMotion();

  return (
    <div className="relative flex min-h-[100dvh] w-full items-center justify-center overflow-hidden bg-background p-4">
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <Grainient
          color1="#050505"
          color2="#5a5a5a"
          color3="#ffffff"
          timeSpeed={reducedMotion ? 0 : 0.5}
          colorBalance={-0.01}
          warpStrength={1.0}
          warpFrequency={5.0}
          warpSpeed={reducedMotion ? 0 : 2.0}
          warpAmplitude={50.0}
          blendAngle={0.0}
          blendSoftness={0.05}
          rotationAmount={reducedMotion ? 0 : 500.0}
          noiseScale={2.0}
          grainAmount={0.1}
          grainScale={2.0}
          grainAnimated={false}
          contrast={0.95}
          gamma={1.0}
          saturation={0.0}
          centerX={0.0}
          centerY={0.0}
          zoom={1.4}
        />
      </div>

      <div
        className="relative w-full overflow-hidden rounded-2xl border border-border bg-card/95 p-7 shadow-xl backdrop-blur-sm sm:p-8"
        style={{ maxWidth: "min(440px, calc(100vw - 32px))" }}
      >
        {showHeader && (
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-foreground text-background">
              <img src={HYPITO_AVATAR_URL} alt="" className="h-full w-full object-cover" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold leading-tight text-foreground">
                Você no Hype
              </p>
              <p className="truncate text-xs leading-tight text-muted-foreground">
                Plataforma e Portal do Cliente
              </p>
            </div>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
