import { createFileRoute, Outlet } from "@tanstack/react-router";

/**
 * Layout route pura — só existe pra `campanhas.$campanhaId` (o detalhe)
 * poder ser filho dela na árvore de rotas (convenção de ponto do
 * TanStack Router). A LISTA de campanhas em si vive em `campanhas.index.tsx`
 * (bug real corrigido nesta rodada: antes a lista estava aqui sem
 * `<Outlet/>`, então o detalhe da campanha nunca conseguia aparecer — a
 * URL mudava mas o conteúdo ficava travado na lista).
 */
export const Route = createFileRoute("/portal-v2/campanhas")({
  component: () => <Outlet />,
});
