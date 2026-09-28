import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";

/**
 * Aprovações deixou de ser um destino de menu — a decisão acontece dentro
 * da campanha (card/drawer do influenciador). Links antigos continuam
 * funcionando: quando trazem contexto de campanha/influenciador,
 * redirecionam direto pra lá; sem contexto, caem na Início.
 */
const aprovacoesSearchSchema = z.object({
  campaign: z.string().optional(),
  influencer: z.string().optional(),
});

export const Route = createFileRoute("/portal-v2/aprovacoes")({
  validateSearch: aprovacoesSearchSchema,
  beforeLoad: ({ search }) => {
    if (search.campaign) {
      throw redirect({
        to: "/portal-v2/campanhas/$campanhaId",
        params: { campanhaId: search.campaign },
        search: search.influencer ? { influenciador: search.influencer } : {},
      });
    }
    throw redirect({ to: "/portal-v2/inicio" });
  },
});
