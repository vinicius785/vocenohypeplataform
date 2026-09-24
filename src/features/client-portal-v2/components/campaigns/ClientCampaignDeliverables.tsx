import { ChevronRight, Film } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { EmptyState } from "@/components/shared/EmptyState";
import { ENTREGA_STAGE_TONE } from "@/lib/campanha-status";
import { CampaignSection } from "./CampaignSection";
import {
  activeAjuste,
  ajusteSemDetalheDisponivel,
  conteudoAindaNaoEnviado,
  formatAjusteSummary,
} from "../../lib/ajuste-format";
import type { ContentItem } from "../../types/content";

/** Conteúdos e entregas — cada card abre o conteúdo de verdade (drawer do
 * influenciador + viewer dessa entrega), nunca uma linha passiva sem
 * destino. Sem placeholder cinza gigante: ícone discreto quando não há
 * mídia, tipo + status já traduzidos pro cliente (`statusCliente`, mesma
 * fonte usada no drawer — nunca um segundo mapeamento de estágio). */
export function ClientCampaignDeliverables({ items }: { items: ContentItem[] }) {
  const navigate = useNavigate();

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
          {items.map((item) => {
            const ajuste = activeAjuste(item.entrega);
            const semDetalhe = !ajuste && ajusteSemDetalheDisponivel(item.entrega);
            const naoEnviado = conteudoAindaNaoEnviado(item.entrega);

            const cardContent = (
              <>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <Film className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {item.entrega.titulo || item.entrega.tipo}
                  </p>
                  <p className="truncate text-xs text-text-secondary">{item.influencerNome}</p>
                  {naoEnviado && (
                    <p className="mt-0.5 truncate text-xs text-text-secondary">
                      Aguardando a equipe da Você no Hype.
                    </p>
                  )}
                  {ajuste && (
                    <p className="mt-0.5 truncate text-xs text-text-secondary">
                      {formatAjusteSummary(ajuste.veredito)}
                    </p>
                  )}
                  {semDetalhe && (
                    <p className="mt-0.5 truncate text-xs text-text-secondary">
                      Ajuste solicitado anteriormente.
                    </p>
                  )}
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                    ENTREGA_STAGE_TONE[item.entrega.stage as keyof typeof ENTREGA_STAGE_TONE] ??
                    "bg-muted text-muted-foreground"
                  }`}
                >
                  {naoEnviado ? "Ainda não enviado" : item.entrega.statusCliente}
                </span>
              </>
            );

            if (naoEnviado) {
              return (
                <div
                  key={item.entrega.id}
                  className="flex items-center gap-3 rounded-2xl bg-card p-3 dark:shadow-none"
                >
                  {cardContent}
                </div>
              );
            }

            return (
              <button
                key={item.entrega.id}
                type="button"
                onClick={() =>
                  navigate({
                    to: "/portal-v2/campanhas/$campanhaId",
                    params: { campanhaId: item.campanhaId },
                    search: {
                      influenciador: item.influencerId,
                      conteudo: item.entrega.id,
                    },
                  })
                }
                className="flex items-center gap-3 rounded-2xl bg-card p-3 text-left hover:bg-muted/40 dark:shadow-none"
              >
                {cardContent}
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </button>
            );
          })}
        </div>
      )}
    </CampaignSection>
  );
}
