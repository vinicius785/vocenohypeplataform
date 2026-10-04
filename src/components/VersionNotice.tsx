import { Loader2, RefreshCw, Sparkles, X } from "lucide-react";

/** Cartão "Nova versão disponível" (canto inferior direito; no mobile ocupa a largura útil).
 * Só apresentação — a detecção, o fechamento e a atualização vivem em `VersionWatcher`. */
export function VersionNotice({
  currentVersion,
  newVersion,
  highlights,
  updating,
  onUpdate,
  onDismiss,
  onShowNotes,
}: {
  currentVersion: string;
  newVersion: string;
  highlights: string[];
  updating: boolean;
  onUpdate: () => void;
  onDismiss: () => void;
  onShowNotes: () => void;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 left-4 right-4 z-[200] rounded-xl border border-border bg-background p-4 shadow-lg sm:left-auto sm:w-96"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-subtle text-text-brand">
          <Sparkles className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-semibold text-foreground">Nova versão disponível</p>
            <button
              type="button"
              onClick={onDismiss}
              className="-mr-1 -mt-1 shrink-0 cursor-pointer rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              aria-label="Dispensar"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Você está na <span className="tabular-nums">v{currentVersion}</span>. A{" "}
            <span className="tabular-nums font-medium text-foreground">v{newVersion}</span> já está
            disponível.
          </p>
          {highlights.length > 0 && (
            <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
              {highlights.map((h) => (
                <li key={h} className="flex gap-1.5">
                  <span aria-hidden="true">•</span>
                  <span className="min-w-0 break-words">{h}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onShowNotes}
              className="cursor-pointer text-xs font-medium text-foreground underline underline-offset-4 hover:no-underline"
            >
              Ver novidades
            </button>
            <button
              type="button"
              onClick={onUpdate}
              disabled={updating}
              className="ml-auto inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-brand-foreground hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1 disabled:cursor-default disabled:opacity-70"
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
  );
}
