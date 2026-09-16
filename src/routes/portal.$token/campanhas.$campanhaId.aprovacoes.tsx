import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * `/portal/$token/campanhas/:campanhaId/aprovacoes` — desde a Etapa 6,
 * redireciona pra Central de Aprovações (`/portal/$token/aprovacoes`) já
 * filtrada por esta campanha, em vez de voltar pra própria página de
 * campanha (comportamento do stub da Etapa 2).
 */
export const Route = createFileRoute("/portal/$token/campanhas/$campanhaId/aprovacoes")({
  loader: ({ params }) => {
    throw redirect({
      to: "/portal/$token/aprovacoes",
      params: { token: params.token },
      search: { campanha: params.campanhaId },
    });
  },
});
