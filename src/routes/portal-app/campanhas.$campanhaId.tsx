import { createFileRoute, redirect } from "@tanstack/react-router";

/** Redirect de compatibilidade — ver `inicio.tsx` neste mesmo diretório. */
export const Route = createFileRoute("/portal-app/campanhas/$campanhaId")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/portal-v2/campanhas/$campanhaId",
      params: { campanhaId: params.campanhaId },
    });
  },
});
