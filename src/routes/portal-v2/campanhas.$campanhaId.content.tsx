import { createFileRoute, redirect } from "@tanstack/react-router";
import { campanhaSearchSchema } from "./campanhas.$campanhaId";

/**
 * Compatibilidade — esta seção virou parte da página única da campanha
 * (rodada de consolidação: nunca mais uma aba separada). Link antigo
 * redireciona pra `/portal-v2/campanhas/$campanhaId`.
 */
export const Route = createFileRoute("/portal-v2/campanhas/$campanhaId/content")({
  validateSearch: campanhaSearchSchema,
  beforeLoad: ({ params, search }) => {
    throw redirect({
      to: "/portal-v2/campanhas/$campanhaId",
      params: { campanhaId: params.campanhaId },
      search,
    });
  },
});
