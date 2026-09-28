import { createFileRoute, redirect } from "@tanstack/react-router";

/** `/portal-v2/configuracoes` sozinha nunca renderiza nada — redireciona
 * direto pra Perfil, a primeira seção. */
export const Route = createFileRoute("/portal-v2/configuracoes/")({
  beforeLoad: () => {
    throw redirect({ to: "/portal-v2/configuracoes/perfil" });
  },
});
