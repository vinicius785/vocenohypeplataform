import { useEffect, useMemo, useRef, useState } from "react";
import { APP_VERSION, BUILD_ID } from "@/lib/app-version";
import {
  fetchVersionInfo,
  getSeenVersion,
  isUpdateAvailable,
  markVersionSeen,
  releaseHighlights,
  type Release,
  type VersionInfo,
} from "@/lib/release-notes";
import { ReleaseNotesDialog } from "./ReleaseNotesDialog";
import { VersionNotice } from "./VersionNotice";
import { playSound } from "@/lib/sound/sound-manager";

const CHECK_INTERVAL_MS = 5 * 60_000;
/** Intervalo mínimo entre duas consultas (foco/visibilidade/timer não geram rajada). */
const MIN_GAP_MS = 60_000;

/**
 * `public/version.json` é atualizado manualmente junto com APP_VERSION a
 * cada deploy. Comparar contra ele (em vez de só confiar no bundle já
 * carregado) é o único jeito de notificar quem já está com a aba aberta
 * que saiu uma versão nova — sem isso a pessoa só percebe dando F5 por
 * acaso.
 *
 * `releases`/`releasesVC` trazem só a release mais recente do changelog
 * curado (por módulo, em linguagem de produto — ver `release-notes.ts`) —
 * `releasesVC` é o mesmo conteúdo filtrado só pras mudanças que o cliente
 * percebe no portal, usado quando `scope="vc"`. O histórico completo e o
 * changelog técnico interno (`notes`/`notesVC`) ficam em
 * `public/changelog.json`, fora deste arquivo que é consultado a cada 5 min.
 */
export function VersionWatcher({ scope = "vi" }: { scope?: "vi" | "vc" }) {
  const [info, setInfo] = useState<VersionInfo | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let lastCheck = 0;
    let inFlight = false;
    const check = async () => {
      // Offline, aba em segundo plano, consulta em andamento ou checada há pouco: não consulta.
      if (inFlight || (typeof navigator !== "undefined" && navigator.onLine === false)) return;
      if (Date.now() - lastCheck < MIN_GAP_MS) return;
      inFlight = true;
      lastCheck = Date.now();
      try {
        const data = await fetchVersionInfo();
        if (!cancelled && data?.version) setInfo(data);
      } finally {
        inFlight = false;
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    void check();
    const iv = window.setInterval(() => {
      if (document.visibilityState === "visible") void check();
    }, CHECK_INTERVAL_MS);
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(iv);
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onVisible);
    };
  }, []);

  const outdated = isUpdateAvailable(info, { version: APP_VERSION, build: BUILD_ID });
  const releases = scope === "vc" ? info?.releasesVC : info?.releases;
  const release: Release | null = releases?.[0] ?? null;
  const seenToken = `${info?.version ?? ""}+${info?.build ?? ""}`;
  const alreadySeen = useMemo(
    () => !!info?.version && getSeenVersion(scope) === seenToken,
    [info?.version, scope, seenToken],
  );

  const dismiss = () => {
    setDismissed(true);
    if (info?.version) markVersionSeen(scope, seenToken);
  };

  const handleUpdate = () => {
    setUpdating(true);
    window.location.reload();
  };

  const sameSemver = info?.version === APP_VERSION;
  const visible = outdated && !dismissed && !alreadySeen && !!info?.version;

  // Som discreto (Djavan) uma vez por versão anunciada; só no portal do time.
  const soundedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!visible || scope !== "vi" || soundedFor.current === seenToken) return;
    soundedFor.current = seenToken;
    playSound("update");
  }, [visible, scope, seenToken]);

  if (!visible || !info?.version) return null;

  return (
    <>
      {!showNotes && (
        <VersionNotice
          currentVersion={sameSemver && BUILD_ID ? `${APP_VERSION} (${BUILD_ID})` : APP_VERSION}
          newVersion={sameSemver && info.build ? `${info.version} (${info.build})` : info.version}
          highlights={releaseHighlights(release)}
          updating={updating}
          onUpdate={handleUpdate}
          onDismiss={dismiss}
          onShowNotes={() => setShowNotes(true)}
        />
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
