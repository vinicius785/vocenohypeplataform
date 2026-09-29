import { createFileRoute, redirect } from "@tanstack/react-router";

/** Redirect de compatibilidade — Modo Foco foi removido da plataforma;
 * quem tinha a rota `/foco` salva ou aberta em outra aba cai na Home. */
export const Route = createFileRoute("/_authenticated/foco")({
  beforeLoad: () => {
    throw redirect({ to: "/time" });
  },
});
