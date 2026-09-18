import { Loader2 } from "lucide-react";
import { HYPITO_AVATAR_URL } from "@/lib/hypito";

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
 * Same dark background classes as the redesigned auth card shell (see
 * AuthCardShell) so there's no visual flash between this and the login
 * card behind it.
 */
export function PreparingEnvironmentScreen() {
  return (
    <div className="flex min-h-[100dvh] w-full items-center justify-center bg-background p-6">
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl bg-card shadow-lg ring-1 ring-border">
          <img src={HYPITO_AVATAR_URL} alt="" className="h-full w-full object-cover" />
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          <span>Preparando seu ambiente…</span>
        </div>
      </div>
    </div>
  );
}
