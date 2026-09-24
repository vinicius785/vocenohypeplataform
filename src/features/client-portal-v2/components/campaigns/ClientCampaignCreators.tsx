import { useState } from "react";
import { ChevronRight, Users } from "lucide-react";
import { EmptyState } from "@/components/shared/EmptyState";
import { CampaignSection } from "./CampaignSection";
import type { PublicInfluencer } from "@/lib/portal-types";

const STATUS_TONE: Record<string, string> = {
  APROVADO: "bg-success-soft text-success-soft-foreground",
  ENVIADO_AO_CLIENTE: "bg-warning-soft text-warning-soft-foreground",
  RECUSADO: "bg-danger-soft text-danger-soft-foreground",
};

const PAGE_SIZE = 8;

/** Influenciadores — grid compacto (nunca cards altos e repetitivos), só
 * o essencial por item. Cada card abre o drawer de detalhes (clique,
 * Enter ou Espaço com foco no card) — nunca navega pra uma página
 * separada. */
export function ClientCampaignCreators({
  influencers,
  onOpenInfluencer,
}: {
  influencers: PublicInfluencer[];
  onOpenInfluencer: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? influencers : influencers.slice(0, PAGE_SIZE);

  return (
    <CampaignSection
      icon={<Users className="h-4 w-4" />}
      title="Influenciadores"
      description={influencers.length > 0 ? `${influencers.length} no total` : undefined}
      action={
        influencers.length > PAGE_SIZE ? (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-xs font-medium text-brand hover:underline"
          >
            {expanded ? "Ver menos" : "Ver todos"}
          </button>
        ) : undefined
      }
    >
      {influencers.length === 0 ? (
        <EmptyState
          compact
          icon={<Users className="h-4 w-4" aria-hidden="true" />}
          title="Nenhum influenciador nesta campanha ainda"
        />
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visible.map((influencer) => (
            <button
              key={influencer.id}
              type="button"
              onClick={() => onOpenInfluencer(influencer.id)}
              aria-label={`Ver detalhes de ${influencer.nome}, ${influencer.statusCliente}`}
              className="flex items-center gap-3 rounded-2xl bg-card p-3 text-left transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand dark:shadow-none"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                {influencer.foto ? (
                  <img src={influencer.foto} alt="" className="h-full w-full object-cover" />
                ) : (
                  influencer.nome.slice(0, 1).toUpperCase()
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{influencer.nome}</p>
                {(influencer.redes[0] || influencer.nicho) && (
                  <p className="truncate text-xs text-text-secondary">
                    {influencer.redes[0]
                      ? `@${influencer.redes[0].handle.replace(/^@+/, "")} · ${influencer.redes[0].plataforma}`
                      : influencer.nicho}
                  </p>
                )}
              </div>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                  STATUS_TONE[influencer.status] ?? "bg-muted text-muted-foreground"
                }`}
              >
                {influencer.statusCliente}
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            </button>
          ))}
        </div>
      )}
    </CampaignSection>
  );
}
