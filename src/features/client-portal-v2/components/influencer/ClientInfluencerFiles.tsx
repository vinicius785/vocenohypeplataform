import { Download, Paperclip } from "lucide-react";
import { InfluencerDrawerSection } from "./InfluencerDrawerSection";
import type { PublicInfluencer } from "@/lib/portal-types";

/** Arquivos — anexos de entrega já visíveis ao cliente (mesmo campo
 * `anexos` já usado em Arquivos/Relatórios da campanha) — nunca um
 * arquivo interno sem permissão explícita pro cliente. */
export function ClientInfluencerFiles({ influencer }: { influencer: PublicInfluencer }) {
  const files = influencer.entregas.flatMap((e) => e.anexos ?? []);
  if (files.length === 0) return null;

  return (
    <InfluencerDrawerSection icon={<Paperclip className="h-4 w-4" />} title="Arquivos">
      <div className="space-y-1.5 rounded-2xl bg-card p-2 dark:shadow-none">
        {files.map((f) => (
          <div key={f.id} className="flex items-center gap-3 rounded-xl px-3 py-2">
            <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">{f.nome}</p>
              <p className="truncate text-xs text-text-secondary">{f.categoria}</p>
            </div>
            <a
              href={f.url}
              download
              className="flex shrink-0 items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-foreground hover:bg-muted"
            >
              <Download className="h-3.5 w-3.5" />
            </a>
          </div>
        ))}
      </div>
    </InfluencerDrawerSection>
  );
}
