import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";

const searchSchema = z.object({ campanha: z.string().optional() });

/**
 * `/portal/$token/aprovacoes` — desde a correção visual/estrutural,
 * Aprovações deixou de ser um destino global (nav só tem Início/
 * Campanhas/Solicitações; pendências viram contextuais: sino do topbar +
 * seções "Aguardando você" na Início e na campanha). Esta rota continua
 * existindo só pra links antigos não quebrarem — redireciona pra âncora
 * equivalente.
 */
export const Route = createFileRoute("/portal/$token/aprovacoes")({
  validateSearch: searchSchema,
  loader: ({ params, location }) => {
    const search = searchSchema.parse(location.search);
    if (search.campanha) {
      throw redirect({
        to: "/portal/$token/campanhas/$campanhaId",
        params: { token: params.token, campanhaId: search.campanha },
        hash: "aguardando-voce",
      });
    }
    throw redirect({
      to: "/portal/$token/inicio",
      params: { token: params.token },
      hash: "aguardando-voce",
    });
  },
});
