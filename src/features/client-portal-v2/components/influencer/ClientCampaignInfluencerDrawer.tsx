import { useEffect } from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { usePortalSessionData } from "@/components/portal/portal-session-context";
import { deriveContentItems } from "../../lib/derive";
import { ClientInfluencerHeader } from "./ClientInfluencerHeader";
import { ClientInfluencerStatusActions } from "./ClientInfluencerStatusActions";
import {
  ClientInfluencerProfileInfo,
  ClientInfluencerRecommendation,
} from "./ClientInfluencerProfileInfo";
import { ClientInfluencerMetrics } from "./ClientInfluencerMetrics";
import { ClientInfluencerDeliverables } from "./ClientInfluencerDeliverables";
import { ClientInfluencerBriefing } from "./ClientInfluencerBriefing";
import { ClientInfluencerContents } from "./ClientInfluencerContents";
import { ClientInfluencerFiles } from "./ClientInfluencerFiles";
import { ClientInfluencerComments } from "./ClientInfluencerComments";
import { ClientInfluencerActivity } from "./ClientInfluencerActivity";

/**
 * Drawer de detalhes do influenciador — página vertical compacta dentro
 * do contexto da campanha (nunca uma rota separada). Aberto/fechado via
 * `?influenciador=<id>` na URL da própria campanha (ver
 * `routes/portal-v2/campanhas.$campanhaId.tsx`): o botão voltar do
 * navegador já fecha o drawer sozinho, porque abrir empilha uma entrada
 * de histórico normal.
 *
 * `Sheet` (Radix Dialog por baixo) já resolve de graça: Escape fecha,
 * clique no backdrop fecha, foco fica preso dentro do drawer, e
 * `onOpenChange(false)` é chamado em qualquer um desses casos — só
 * conectamos isso a "remover o parâmetro da URL".
 */
export function ClientCampaignInfluencerDrawer({
  campanhaId,
  influencerId,
  initialContentId,
  initialFoco,
  onClose,
}: {
  campanhaId: string;
  influencerId: string;
  /** Deep link `?conteudo=` — abre o viewer deste conteúdo por cima do
   * drawer assim que ele monta. */
  initialContentId?: string;
  /** Deep link `?foco=briefing` — rola o drawer até a seção de briefing. */
  initialFoco?: "briefing";
  onClose: () => void;
}) {
  const { data } = usePortalSessionData();
  const campaign = data.campanhas.find((c) => c.id === campanhaId);
  const influencer = campaign?.influencers.find((i) => i.id === influencerId);

  const contentItems = influencer
    ? deriveContentItems(data).filter(
        (item) => item.campanhaId === campanhaId && item.influencerId === influencerId,
      )
    : [];

  useEffect(() => {
    if (initialFoco !== "briefing") return;
    const el = document.getElementById("influencer-briefing");
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [initialFoco]);

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-none md:w-[640px] md:max-w-[680px]"
      >
        {!influencer || !campaign ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
            <p className="text-sm font-medium text-foreground">Influenciador não encontrado</p>
            <p className="text-xs text-text-secondary">
              Ele pode ter sido removido desta campanha.
            </p>
          </div>
        ) : (
          <>
            <ClientInfluencerHeader influencer={influencer} />
            <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
              <ClientInfluencerStatusActions influencer={influencer} campanhaId={campanhaId} />
              <ClientInfluencerProfileInfo influencer={influencer} />
              <ClientInfluencerRecommendation influencer={influencer} />
              <ClientInfluencerMetrics influencer={influencer} />
              <ClientInfluencerDeliverables
                entregas={influencer.entregas}
                campanhaId={campanhaId}
                influencerId={influencer.id}
              />
              <div id={initialFoco === "briefing" ? "influencer-briefing" : undefined}>
                <ClientInfluencerBriefing influencer={influencer} />
              </div>
              <ClientInfluencerContents
                items={contentItems}
                initialOpenEntregaId={initialContentId}
              />
              <ClientInfluencerFiles influencer={influencer} />
              <ClientInfluencerComments
                comments={influencer.clienteComments ?? []}
                campanhaId={campanhaId}
                influencerId={influencer.id}
              />
              <ClientInfluencerActivity influencer={influencer} />
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
