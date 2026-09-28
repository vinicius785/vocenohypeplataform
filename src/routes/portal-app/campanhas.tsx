import { createFileRoute, Outlet } from "@tanstack/react-router";

/**
 * Layout pura — só existe pra `campanhas.$campanhaId` poder ser filho
 * dela (convenção de ponto do TanStack Router). Se ela mesma redirecionar
 * no `beforeLoad`, o redirect do PAI dispara antes do filho ter a chance
 * de rodar o SEU `beforeLoad` (mesmo bug já corrigido em `portal-v2` —
 * ver `campanhas.tsx` de lá) — por isso o redirect pra
 * `/portal-v2/campanhas` mora só em `campanhas.index.tsx`, nunca aqui.
 */
export const Route = createFileRoute("/portal-app/campanhas")({
  component: () => <Outlet />,
});
