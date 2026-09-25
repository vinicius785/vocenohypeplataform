import { createFileRoute, redirect } from "@tanstack/react-router";

/** Nunca existiu como página real, mas link salvo/favorito pode apontar
 * aqui — cai direto na seção "Perfil" de Configurações. */
export const Route = createFileRoute("/portal-v2/perfil")({
  beforeLoad: () => {
    throw redirect({ to: "/portal-v2/configuracoes", hash: "perfil" });
  },
});
