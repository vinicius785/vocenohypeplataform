import { useEffect, useState } from "react";
import { RefreshCw, X } from "lucide-react";
import { APP_VERSION } from "./ConfiguracoesSection";

const CHECK_INTERVAL_MS = 5 * 60_000;

/**
 * `public/version.json` é atualizado manualmente junto com APP_VERSION a
 * cada deploy. Comparar contra ele (em vez de só confiar no bundle já
 * carregado) é o único jeito de notificar quem já está com a aba aberta de
 * que saiu uma versão nova — sem isso a pessoa só percebe dando F5 por acaso.
 */
export function VersionWatcher() {
  const [latest, setLatest] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const res = await fetch(`/version.json?t=${Date.now()}`, { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { version?: string };
        if (!cancelled && data.version) setLatest(data.version);
      } catch {
        /* ignore — offline ou blip de rede, tenta de novo no próximo ciclo */
      }
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

  const outdated = !!latest && latest !== APP_VERSION;
  if (!outdated || dismissed) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[200] w-full max-w-sm rounded-xl border border-border bg-background p-4 shadow-xl">
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sky-500/10 text-sky-600 dark:text-sky-400">
          <RefreshCw className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">Nova versão disponível</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Você está numa versão desatualizada da plataforma. Atualize a página para pegar as
            últimas mudanças.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Atualizar página
          </button>
        </div>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Dispensar"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
