import { Download, Paperclip } from "lucide-react";
import { InfluencerDrawerSection } from "./InfluencerDrawerSection";
import type { PublicInfluencer } from "@/lib/portal-types";

/** Arquivos gerais do influenciador/participação (não de uma entrega
 * específica) — hoje só o briefing enviado na inscrição. Anexos de
 * entrega (roteiro, conteúdo final, referências) ficam DENTRO de cada
 * entrega em "Entregas e conteúdos" (`ClientInfluencerDeliverables`),
 * nunca duplicados aqui — antes esta seção listava `entregas.flatMap(e
 * => e.anexos)` inteiro, repetindo o mesmo arquivo nas duas áreas. */
export function ClientInfluencerFiles({ influencer }: { influencer: PublicInfluencer }) {
  if (!influencer.briefingAnexoUrl) return null;

  return (
    <InfluencerDrawerSection icon={<Paperclip className="h-4 w-4" />} title="Arquivos">
      <div className="space-y-1.5 rounded-2xl bg-card p-2 dark:shadow-none">
        <div className="flex items-center gap-3 rounded-xl px-3 py-2">
          <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">
              {influencer.briefingAnexoNome || "Briefing"}
            </p>
          </div>
          <a
            href={influencer.briefingAnexoUrl}
            download
            className="flex shrink-0 items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-foreground hover:bg-muted"
          >
            <Download className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>
    </InfluencerDrawerSection>
  );
}
