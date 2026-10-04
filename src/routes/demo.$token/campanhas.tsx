import { createFileRoute, Outlet } from "@tanstack/react-router";

/** Layout puro: a lista vive em `campanhas.index.tsx` e o detalhe em `campanhas.$campanhaId.tsx`. */
export const Route = createFileRoute("/demo/$token/campanhas")({
  component: () => <Outlet />,
});
