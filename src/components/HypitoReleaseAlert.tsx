import { useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, RefreshCw, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { HYPITO_AVATAR_URL, HYPITO_BADGE_LABEL, HYPITO_NAME, HYPITO_TAGLINE } from "@/lib/hypito";
import { APP_VERSION } from "@/lib/app-version";
import { useReleaseWatch } from "@/lib/release-watch";
import { markReleaseDismissed, markReleaseSeen } from "@/lib/release-seen-store";
import { ReleaseHistoryDialog } from "./ReleaseHistoryDialog";

/**
 * Aviso de nova versão "assinado" pelo Hypito — mesma identidade visual
 * de `UpcomingMeetingAlert.tsx` (avatar+nome+badge "Assistente", glow
 * discreto, `createPortal` canto inferior direito, 360-400px). Some do
 * `AppShell.tsx` interno; o Portal do Cliente continua com
 * `VersionWatcher.tsx` (genérico, `public/version.json`), intocado.
 *
 * Nunca recarrega sozinho — "Atualizar plataforma" só aparece quando a
 * release marca `requiresReload`, e mesmo assim é um clique explícito.
 */
export function HypitoReleaseAlert() {
  const { release, userId } = useReleaseWatch();
  const [showHistory, setShowHistory] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [hiddenVersion, setHiddenVersion] = useState<string | null>(null);

  if (!release || release.version === hiddenVersion) return null;

  const seeNotes = () => {
    if (userId) markReleaseSeen(userId, release.version);
    setHiddenVersion(release.version);
    setShowHistory(true);
  };

  const dismiss = () => {
    markReleaseDismissed(release.version);
    setHiddenVersion(release.version);
  };

  const handleUpdate = () => {
    setUpdating(true);
    window.location.reload();
  };

  return (
    <>
      {createPortal(
        <div
          role="status"
          aria-label={`Aviso do Hypito: nova versão ${release.version} disponível`}
          className="fixed inset-x-3 bottom-3 z-40 sm:inset-x-auto sm:bottom-6 sm:right-6 sm:[width:min(400px,calc(100vw-32px))] [padding-bottom:env(safe-area-inset-bottom)]"
        >
          <div className="relative animate-in fade-in slide-in-from-bottom-2 overflow-hidden rounded-2xl border border-border/60 bg-card p-4 shadow-xl duration-300 motion-reduce:animate-none sm:slide-in-from-bottom-0 sm:slide-in-from-right-4 sm:p-5">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -left-6 -top-6 h-24 w-24 rounded-full bg-brand/20 blur-2xl"
            />

            <div className="relative flex items-start gap-3">
              <div className="relative shrink-0">
                <div
                  aria-hidden="true"
                  className="absolute inset-0 -m-1 rounded-full bg-brand-subtle blur-[2px]"
                />
                <img
                  src={HYPITO_AVATAR_URL}
                  alt=""
                  aria-hidden="true"
                  className="relative h-9 w-9 rounded-full object-cover ring-2 ring-card sm:h-10 sm:w-10"
                />
              </div>
              <div className="min-w-0 flex-1 pt-0.5">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <p className="text-xs font-semibold text-foreground">{HYPITO_NAME}</p>
                  <Badge
                    variant="brand"
                    title={HYPITO_TAGLINE}
                    className="px-1.5 py-0 text-[9px] normal-case"
                  >
                    {HYPITO_BADGE_LABEL}
                  </Badge>
                </div>
                <p className="mt-1 text-sm font-semibold leading-snug text-foreground">
                  Nova versão disponível
                </p>
              </div>
              <IconButton
                label="Fechar aviso de nova versão"
                onClick={dismiss}
                className="shrink-0 -mr-1 -mt-1"
              >
                <X className="h-4 w-4" />
              </IconButton>
            </div>

            <p className="relative mt-2.5 text-xs leading-relaxed text-muted-foreground">
              A plataforma foi atualizada para a versão {release.version}
              {release.summary ? `. ${release.summary}` : "."}
            </p>
            <p className="relative mt-1 text-[11px] tabular-nums text-muted-foreground">
              {APP_VERSION} → {release.version}
            </p>

            <div className="relative mt-3.5 flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" onClick={seeNotes}>
                Ver novidades
              </Button>
              <Button size="sm" variant="ghost" onClick={dismiss}>
                Agora não
              </Button>
              {release.requiresReload && (
                <Button
                  size="sm"
                  onClick={handleUpdate}
                  disabled={updating}
                  className="ml-auto gap-1.5"
                >
                  {updating ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
                  )}
                  Atualizar plataforma
                </Button>
              )}
            </div>
          </div>
        </div>,
        document.body,
      )}

      <ReleaseHistoryDialog open={showHistory} onOpenChange={setShowHistory} />
    </>
  );
}
