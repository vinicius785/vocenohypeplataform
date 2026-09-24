import { Film } from "lucide-react";
import { EmptyState } from "@/components/shared/EmptyState";
import { ENTREGA_STAGE_TONE } from "@/lib/campanha-status";
import { CampaignSection } from "./CampaignSection";
import type { ContentItem } from "../../types/content";

/** Conteúdos e entregas — sem placeholder cinza gigante: ícone discreto
 * quando não há mídia, tipo + status já traduzidos pro cliente
 * (`statusCliente`, mesma fonte usada em Aprovações/Conteúdos — nunca um
 * segundo mapeamento de estágio). */
export function ClientCampaignDeliverables({ items }: { items: ContentItem[] }) {
  return (
    <CampaignSection
      icon={<Film className="h-4 w-4" />}
      title="Conteúdos e entregas"
      description={items.length > 0 ? `${items.length} no total` : undefined}
    >
      {items.length === 0 ? (
        <EmptyState
          compact
          icon={<Film className="h-4 w-4" aria-hidden="true" />}
          title="Nenhum conteúdo planejado ainda"
        />
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <div
              key={item.entrega.id}
              className="flex items-center gap-3 rounded-2xl bg-card p-3 dark:shadow-none"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <Film className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">
                  {item.entrega.titulo || item.entrega.tipo}
                </p>
                <p className="truncate text-xs text-text-secondary">{item.influencerNome}</p>
              </div>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                  ENTREGA_STAGE_TONE[item.entrega.stage as keyof typeof ENTREGA_STAGE_TONE] ??
                  "bg-muted text-muted-foreground"
                }`}
              >
                {item.entrega.statusCliente}
              </span>
            </div>
          ))}
        </div>
      )}
    </CampaignSection>
  );
}
