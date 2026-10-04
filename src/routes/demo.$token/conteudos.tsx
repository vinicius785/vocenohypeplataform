import { createFileRoute, redirect } from "@tanstack/react-router";

/** Atalho do Início ("conteúdos"): leva à lista de campanhas (a Demo tem uma só). */
export const Route = createFileRoute("/demo/$token/conteudos")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/demo/$token/campanhas", params });
  },
});
