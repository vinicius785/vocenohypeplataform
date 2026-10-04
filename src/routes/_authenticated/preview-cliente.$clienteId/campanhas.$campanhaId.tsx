import { createFileRoute, useParams, useSearch } from "@tanstack/react-router";
import { CampanhaDetailV2 } from "@/features/client-portal-v2/pages/CampanhaDetailV2";
import { campanhaSearchSchema } from "../../portal-v2/campanhas.$campanhaId";

/** Mesma página de campanha do Portal V2 (mesmo esquema de busca na URL). */
export const Route = createFileRoute(
  "/_authenticated/preview-cliente/$clienteId/campanhas/$campanhaId",
)({
  validateSearch: campanhaSearchSchema,
  component: PreviewCampanhaPage,
});

function PreviewCampanhaPage() {
  const { campanhaId } = useParams({
    from: "/_authenticated/preview-cliente/$clienteId/campanhas/$campanhaId",
  });
  const search = useSearch({
    from: "/_authenticated/preview-cliente/$clienteId/campanhas/$campanhaId",
  });
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
