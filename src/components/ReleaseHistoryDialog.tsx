import { useEffect, useState } from "react";
import { Check, Sparkles } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { mapPlatformReleaseRow, type PlatformRelease } from "@/lib/platform-releases";

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

/** Lista de mudanças de uma release — sempre texto puro (nunca
 * `dangerouslySetInnerHTML`), defesa contra HTML/script injetado no
 * changelog. */
function ReleaseChanges({ release }: { release: PlatformRelease }) {
  if (release.changes.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Atualizamos a plataforma nos bastidores — nenhuma novidade visível desta vez.
      </p>
    );
  }
  return (
    <ul className="space-y-2.5">
      {release.changes.map((item, i) => (
        <li key={i} className="flex gap-2">
          <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-500" />
          <div className="min-w-0">
            <p className="text-sm font-medium leading-snug text-foreground">{item.title}</p>
            {item.description && (
              <p className="text-xs leading-relaxed text-muted-foreground">{item.description}</p>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * Histórico de versões — substitui a antiga página "Configurações →
 * Novidades" (já removida) por um Dialog/Drawer, sem criar uma aba nova
 * (Seção 7/8 do pedido). Lista da mais recente pra mais antiga, cada
 * versão expansível (`Accordion`, já existente no design system).
 * Aberto por: aviso do Hypito ("Ver novidades"), `NovidadesButton`
 * (rodapé da sidebar) e clique na versão em Configurações.
 */
export function ReleaseHistoryDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [releases, setReleases] = useState<PlatformRelease[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!open || releases) return;
    let cancelled = false;
    supabase
      .from("platform_releases")
      .select("*")
      .order("released_at", { ascending: false })
      .then(({ data, error: err }) => {
        if (cancelled) return;
        if (err || !data) {
          setError(true);
          return;
        }
        setReleases(data.map(mapPlatformReleaseRow));
      });
    return () => {
      cancelled = true;
    };
  }, [open, releases]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 p-0 sm:max-w-lg">
        <DialogHeader className="shrink-0 border-b border-border px-6 py-4">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-brand" /> Histórico de versões
          </DialogTitle>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {error && (
            <p className="text-sm text-muted-foreground">
              Não foi possível carregar o histórico agora. Tente de novo em instantes.
            </p>
          )}
          {!error && !releases && <p className="text-sm text-muted-foreground">Carregando...</p>}
          {!error && releases && releases.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhuma release registrada ainda.</p>
          )}
          {!error && releases && releases.length > 0 && (
            <Accordion type="single" collapsible defaultValue={releases[0].id}>
              {releases.map((r) => (
                <AccordionItem key={r.id} value={r.id}>
                  <AccordionTrigger>
                    <div className="text-left">
                      <p className="text-sm font-semibold text-foreground">Versão {r.version}</p>
                      <p className="text-xs text-muted-foreground">{fmtDate(r.releasedAt)}</p>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    {r.summary && <p className="mb-3 text-sm text-foreground">{r.summary}</p>}
                    <ReleaseChanges release={r} />
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
