import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";

/**
 * Conteúdos deixou de ser uma biblioteca própria — conteúdo aparece
 * dentro da campanha + influenciador. Links antigos com contexto
 * (`?campaign=&content=`) abrem direto o viewer certo; sem contexto,
 * caem na listagem de Campanhas.
 */
const conteudosSearchSchema = z.object({
  campaign: z.string().optional(),
  content: z.string().optional(),
  influencer: z.string().optional(),
});

export const Route = createFileRoute("/portal-v2/conteudos")({
  validateSearch: conteudosSearchSchema,
  beforeLoad: ({ search }) => {
    if (search.campaign) {
      throw redirect({
        to: "/portal-v2/campanhas/$campanhaId",
        params: { campanhaId: search.campaign },
        search: {
          ...(search.influencer ? { influenciador: search.influencer } : {}),
          ...(search.content ? { conteudo: search.content } : {}),
        },
      });
    }
    throw redirect({ to: "/portal-v2/campanhas" });
  },
});
