import { createFileRoute, Outlet } from "@tanstack/react-router";

/** Layout puro: a lista vive em `campanhas.index.tsx` e o detalhe em `campanhas.$campanhaId.tsx`. */
export const Route = createFileRoute("/_authenticated/preview-cliente/$clienteId/campanhas")({
  component: () => <Outlet />,
});
