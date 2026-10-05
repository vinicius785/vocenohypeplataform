import { ArrowRight, CircleArrowUp, X } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Aviso de atualização de produto: "Nova versão disponível" (canto inferior direito; no mobile ocupa
 * a largura útil, respeitando a área segura). Só apresentação — a detecção, o fechamento e a
 * atualização vivem em `VersionWatcher`. Hierarquia: título → versões → descrição → novidades →
 * ação (Atualizar agora > Ver novidades). */
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
      aria-labelledby="version-notice-title"
      className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-4 right-4 z-[200] rounded-xl border border-border bg-background p-5 shadow-lg sm:bottom-6 sm:left-auto sm:right-6 sm:w-[26rem]"
    >
      <div className="flex items-start gap-3">
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-subtle text-text-brand"
          aria-hidden="true"
        >
          <CircleArrowUp className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h2
              id="version-notice-title"
              className="pt-1.5 text-base font-semibold leading-tight text-foreground"
            >
              Nova versão disponível
            </h2>
            <button
              type="button"
              onClick={onDismiss}
              title="Dispensar"
              aria-label="Dispensar"
              className="-mr-2 -mt-1 flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 tabular-nums">
            <span className="sr-only">
              Versão atual v{currentVersion}. Nova versão v{newVersion}.
            </span>
            <span aria-hidden="true" className="text-sm text-muted-foreground">
              v{currentVersion}
            </span>
            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
            <span
              aria-hidden="true"
              className="rounded-md bg-brand-subtle px-2 py-0.5 text-sm font-semibold text-text-brand"
            >
              v{newVersion}
            </span>
          </p>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Uma nova versão da plataforma está pronta.
          </p>

          {highlights.length > 0 && (
            <ul className="mt-3 space-y-1.5 border-t border-border pt-3 text-sm text-foreground">
              {highlights.map((h) => (
                <li key={h} className="flex gap-2">
                  <span aria-hidden="true" className="text-muted-foreground">
                    •
                  </span>
                  <span className="min-w-0 break-words">{h}</span>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-4 flex items-center justify-between gap-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onShowNotes}
              className="-ml-3 text-muted-foreground hover:text-foreground"
            >
              Ver novidades
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={onUpdate}
              isLoading={updating}
            >
              {updating ? "Atualizando..." : "Atualizar agora"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
