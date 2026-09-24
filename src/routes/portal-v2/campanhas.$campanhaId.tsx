import { createFileRoute, useParams, useSearch } from "@tanstack/react-router";
import { z } from "zod";
import { CampanhaDetailV2 } from "@/features/client-portal-v2/pages/CampanhaDetailV2";

/**
 * Rota única da campanha — consolidada nesta rodada (antes era um layout
 * com sub-rotas `/overview`, `/creators`, `/content`, `/timeline`,
 * `/results`, `/files`, cada uma uma "aba"). Agora é uma página vertical
 * só, sem `<Outlet/>`, sem navegação interna. As sub-rotas antigas viram
 * redirects pra cá (compatibilidade com links salvos).
 *
 * `?influenciador=<id>` (rodada do drawer) representa o influenciador
 * aberto — nunca uma página nova. Abrir empilha uma entrada de
 * histórico (`navigate` sem `replace`), então o botão voltar do
 * navegador já fecha o drawer sozinho antes de sair da campanha, de
 * graça, sem código extra.
 */
const campanhaSearchSchema = z.object({
  influenciador: z.string().optional(),
});

export const Route = createFileRoute("/portal-v2/campanhas/$campanhaId")({
  validateSearch: campanhaSearchSchema,
  component: CampanhaDetailPage,
});

function CampanhaDetailPage() {
  const { campanhaId } = useParams({ from: "/portal-v2/campanhas/$campanhaId" });
  const { influenciador } = useSearch({ from: "/portal-v2/campanhas/$campanhaId" });
  return <CampanhaDetailV2 campanhaId={campanhaId} openInfluencerId={influenciador} />;
}
