import { createFileRoute } from "@tanstack/react-router";

/**
 * Rota dedicada do NPS mensal obrigatório. O guard de
 * `portal-v2/route.tsx` redireciona pra cá (com `returnTo` = rota
 * originalmente pedida) sempre que o servidor reporta NPS pendente, e
 * tira o usuário daqui assim que não houver mais pendência. O formulário
 * em si é renderizado pelo layout (`PortalV2Layout`) no lugar do shell
 * inteiro, porque o loader do layout não recebe dados do portal enquanto
 * houver pendência (`getPortalDataForSession` → `npsBlocked`).
 */
export const Route = createFileRoute("/portal-v2/nps")({
  validateSearch: (search: Record<string, unknown>): { returnTo?: string } => ({
    returnTo: typeof search.returnTo === "string" ? search.returnTo : undefined,
  }),
  component: () => null,
});
