import { useState } from "react";
import { Check, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Release } from "@/lib/release-notes";

/** Lista de módulos/itens de uma release, sem chrome de dialog — usada
 * tanto dentro do `ReleaseNotesDialog` quanto na página "Configurações →
 * Novidades" (`ConfiguracoesSection.tsx`), pra nunca duplicar o mesmo
 * markup em dois lugares. */
export function ReleaseModulesList({ release }: { release: Release | null }) {
  if (!release || release.modules.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Atualizamos a plataforma nos bastidores — nenhuma novidade visível desta vez.
      </p>
    );
  }
  return (
    <div className="space-y-6">
      {release.modules.map((mod) => (
        <div key={mod.name}>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {mod.name}
          </p>
          {mod.tagline && (
            <p className="mt-0.5 text-sm font-medium text-foreground">{mod.tagline}</p>
          )}
          <ul className="mt-2.5 space-y-2.5">
            {mod.items.map((item, i) => (
              <li key={i} className="flex gap-2">
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-500" />
                <div className="min-w-0">
                  <p className="text-sm font-medium leading-snug text-foreground">{item.title}</p>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {item.description}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** Painel "O que há de novo" — reusado pelo toast de nova versão
 * (`VersionWatcher.tsx`) e por Configurações → Novidades. Sempre a mesma
 * experiência, agrupada por módulo, nunca um changelog técnico corrido. */
export function ReleaseNotesDialog({
  open,
  onOpenChange,
  version,
  release,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  version?: string;
  release: Release | null;
}) {
  const [updating, setUpdating] = useState(false);

  const handleUpdate = () => {
    setUpdating(true);
    window.location.reload();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 p-0 sm:max-w-lg">
        <DialogHeader className="shrink-0 border-b border-border px-6 py-4">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-muted-foreground" />O que há de novo
          </DialogTitle>
          {version && <p className="text-xs text-muted-foreground">Versão {version}</p>}
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <ReleaseModulesList release={release} />
        </div>

        <div className="shrink-0 border-t border-border px-6 py-4">
          <button
            type="button"
            onClick={handleUpdate}
            disabled={updating}
            className="inline-flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-md bg-foreground px-4 py-2.5 text-sm font-medium text-background hover:opacity-90 disabled:cursor-default disabled:opacity-70"
          >
            {updating ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Atualizando...
              </>
            ) : (
              <>
                <RefreshCw className="h-3.5 w-3.5" /> Atualizar agora
              </>
            )}
          </button>
          <p className="mt-1.5 text-center text-[11px] text-muted-foreground">
            Leva apenas alguns segundos.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
