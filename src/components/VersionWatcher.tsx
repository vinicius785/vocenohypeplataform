import { useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw, Sparkles, X } from "lucide-react";
import { APP_VERSION } from "./ConfiguracoesSection";
import {
  fetchVersionInfo,
  getSeenVersion,
  markVersionSeen,
  type Release,
  type VersionInfo,
} from "@/lib/release-notes";
import { ReleaseNotesDialog } from "./ReleaseNotesDialog";

const CHECK_INTERVAL_MS = 5 * 60_000;

/**
 * `public/version.json` é atualizado manualmente junto com APP_VERSION a
 * cada deploy. Comparar contra ele (em vez de só confiar no bundle já
 * carregado) é o único jeito de notificar quem já está com a aba aberta
 * que saiu uma versão nova — sem isso a pessoa só percebe dando F5 por
 * acaso.
 *
 * `releases`/`releasesVC` trazem o changelog curado (por módulo, em
 * linguagem de produto — ver `release-notes.ts`) — `releasesVC` é o mesmo
 * conteúdo filtrado só pras mudanças que o cliente percebe no portal,
 * usado quando `scope="vc"`. `notes`/`notesVC` continuam existindo no
 * arquivo como changelog técnico interno (registro de deploy), mas não são
 * mais exibidos ao usuário — só o conteúdo curado aparece na UI.
 */
export function VersionWatcher({ scope = "vi" }: { scope?: "vi" | "vc" }) {
  const [info, setInfo] = useState<VersionInfo | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      const data = await fetchVersionInfo();
      if (!cancelled && data?.version) setInfo(data);
    };
    check();
    const iv = window.setInterval(check, CHECK_INTERVAL_MS);
    const onFocus = () => check();
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.clearInterval(iv);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  const outdated = !!info?.version && info.version !== APP_VERSION;
  const releases = scope === "vc" ? info?.releasesVC : info?.releases;
  const release: Release | null = releases?.[0] ?? null;
  const alreadySeen = useMemo(
    () => !!info?.version && getSeenVersion(scope) === info.version,
    [info?.version, scope],
  );

  const dismiss = () => {
    setDismissed(true);
    if (info?.version) markVersionSeen(scope, info.version);
  };

  const handleUpdate = () => {
    setUpdating(true);
    window.location.reload();
  };

  if (!outdated || dismissed || alreadySeen) return null;

  return (
    <>
      {!showNotes && (
        <div className="fixed bottom-4 right-4 z-[200] w-full max-w-sm rounded-xl border border-border bg-background p-4 shadow-lg">
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-foreground">
              <Sparkles className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">Nova versão disponível</p>
                  <p className="text-[11px] tabular-nums text-muted-foreground">
                    {APP_VERSION} → {info.version}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={dismiss}
                  className="shrink-0 cursor-pointer rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label="Dispensar"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              {release?.summary && (
                <p className="mt-1.5 line-clamp-1 text-xs text-muted-foreground">
                  {release.summary}
                </p>
              )}

              <div className="mt-3 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setShowNotes(true)}
                  className="cursor-pointer text-xs font-medium text-foreground underline underline-offset-4 hover:no-underline"
                >
                  Ver novidades
                </button>
                <button
                  type="button"
                  onClick={handleUpdate}
                  disabled={updating}
                  className="ml-auto inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90 disabled:cursor-default disabled:opacity-70"
                >
                  {updating ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin" /> Atualizando...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-3 w-3" /> Atualizar agora
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ReleaseNotesDialog
        open={showNotes}
        onOpenChange={(open) => {
          setShowNotes(open);
          if (!open) dismiss();
        }}
        version={info.version}
        release={release}
      />
    </>
  );
}
