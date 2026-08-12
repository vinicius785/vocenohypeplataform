import { useEffect, useState } from "react";
import { RefreshCw, Sparkles, X } from "lucide-react";
import { APP_VERSION } from "./ConfiguracoesSection";

const CHECK_INTERVAL_MS = 5 * 60_000;

/** `notes` em `version.json` é um changelog cumulativo (dezenas de itens
 * acumulados desde sempre, mais novo primeiro) — mostrar a lista inteira
 * lota o aviso com tópicos antigos. Só as N mais recentes cabem aqui; o
 * resto quem quiser vê em Configurações. */
const MAX_NOTES = 3;

type VersionInfo = { version?: string; notes?: string[] };

/**
 * `public/version.json` é atualizado manualmente junto com APP_VERSION a
 * cada deploy — e a cada bump ganha também um `notes` com o que mudou nessa
 * versão. Comparar contra ele (em vez de só confiar no bundle já carregado)
 * é o único jeito de notificar quem já está com a aba aberta que saiu uma
 * versão nova — sem isso a pessoa só percebe dando F5 por acaso.
 */
export function VersionWatcher() {
  const [info, setInfo] = useState<VersionInfo | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const res = await fetch(`/version.json?t=${Date.now()}`, { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as VersionInfo;
        if (!cancelled && data.version) setInfo(data);
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

  const outdated = !!info?.version && info.version !== APP_VERSION;
  if (!outdated || dismissed) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[200] flex max-h-[80vh] w-full max-w-sm flex-col overflow-hidden rounded-xl border border-border bg-background shadow-xl">
      <div className="flex shrink-0 items-center justify-between gap-3 bg-gradient-to-r from-sky-500/15 to-violet-500/15 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-background text-sky-600 shadow-sm dark:text-sky-400">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Nova versão disponível</p>
            <p className="text-[11px] tabular-nums text-muted-foreground">
              {APP_VERSION} → {info.version}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="shrink-0 rounded p-1 text-muted-foreground hover:bg-background/60 hover:text-foreground"
          aria-label="Dispensar"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="min-h-0 overflow-y-auto px-4 py-3">
        {info.notes && info.notes.length > 0 ? (
          <ul className="space-y-1.5">
            {info.notes.slice(0, MAX_NOTES).map((note, i) => (
              <li key={i} className="flex gap-2 text-xs text-muted-foreground">
                <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/60" />
                <span className="leading-relaxed">{note}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">
            Atualize a página para pegar as últimas mudanças.
          </p>
        )}
      </div>

      <div className="shrink-0 px-4 pb-4">
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-foreground px-3 py-2 text-xs font-medium text-background hover:opacity-90"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Atualizar página
        </button>
      </div>
    </div>
  );
}
