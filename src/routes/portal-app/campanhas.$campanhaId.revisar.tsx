import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Redirect de compatibilidade — o modo de revisão sequencial não tem
 * equivalente na V2 ainda; leva pra página da campanha (onde os mesmos
 * influenciadores/decisões estão acessíveis, um a um, pelo drawer).
 */
export const Route = createFileRoute("/portal-app/campanhas/$campanhaId/revisar")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/portal-v2/campanhas/$campanhaId",
      params: { campanhaId: params.campanhaId },
    });
  },
});
