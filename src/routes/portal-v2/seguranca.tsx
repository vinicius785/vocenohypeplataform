import { createFileRoute, redirect } from "@tanstack/react-router";

/** Nunca existiu como página real, mas link salvo/favorito pode apontar
 * aqui — cai direto na seção "Segurança" de Configurações. */
export const Route = createFileRoute("/portal-v2/seguranca")({
  beforeLoad: () => {
    throw redirect({ to: "/portal-v2/configuracoes/seguranca" });
  },
});
