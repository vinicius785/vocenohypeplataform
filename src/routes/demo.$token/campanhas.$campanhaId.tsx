import { createFileRoute, useParams, useSearch } from "@tanstack/react-router";
import { CampanhaDetailV2 } from "@/features/client-portal-v2/pages/CampanhaDetailV2";
import { campanhaSearchSchema } from "../portal-v2/campanhas.$campanhaId";

/** Mesma página de campanha do Portal V2 (mesmo esquema de busca na URL). */
export const Route = createFileRoute("/demo/$token/campanhas/$campanhaId")({
  validateSearch: campanhaSearchSchema,
  component: DemoCampanhaPage,
});

function DemoCampanhaPage() {
  const { campanhaId } = useParams({ from: "/demo/$token/campanhas/$campanhaId" });
  const search = useSearch({ from: "/demo/$token/campanhas/$campanhaId" });
  return (
    <CampanhaDetailV2
      campanhaId={campanhaId}
      openInfluencerId={search.influenciador}
      openContentId={search.entrega ?? search.conteudo}
      foco={search.foco}
      openReportId={search.relatorio}
      competencia={search.competencia}
    />
  );
}
