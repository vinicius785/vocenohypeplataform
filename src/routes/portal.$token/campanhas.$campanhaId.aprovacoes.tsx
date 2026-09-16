import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * `/portal/$token/campanhas/:campanhaId/aprovacoes` — link antigo (época
 * das abas/Central de Aprovações). Redireciona direto pra âncora
 * "Aguardando você" da própria página de campanha.
 */
export const Route = createFileRoute("/portal/$token/campanhas/$campanhaId/aprovacoes")({
  loader: ({ params }) => {
    throw redirect({
      to: "/portal/$token/campanhas/$campanhaId",
      params: { token: params.token, campanhaId: params.campanhaId },
      hash: "aguardando-voce",
    });
  },
});
