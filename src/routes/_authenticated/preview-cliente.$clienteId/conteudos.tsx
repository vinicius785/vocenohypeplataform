import { createFileRoute, redirect } from "@tanstack/react-router";

/** Atalho do Início ("conteúdos"): leva à lista de campanhas (visualização do time). */
export const Route = createFileRoute("/_authenticated/preview-cliente/$clienteId/conteudos")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/preview-cliente/$clienteId/campanhas", params });
  },
});
