import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * `/portal/$token/campanhas/:campanhaId/aprovacoes` — stub da Etapa 2, só
 * prova que a URL existe e é alcançável. A "Central de aprovações" de
 * verdade (agrupada por campanha/influenciador/tipo/urgência) é a Etapa 6
 * do pedido do usuário; até lá, redireciona pra página da campanha, que já
 * mostra os influenciadores/entregas aguardando decisão.
 */
export const Route = createFileRoute("/portal/$token/campanhas/$campanhaId/aprovacoes")({
  loader: ({ params }) => {
    throw redirect({ to: "/portal/$token/campanhas/$campanhaId", params });
  },
});
