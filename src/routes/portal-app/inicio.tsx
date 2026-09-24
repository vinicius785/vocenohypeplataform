import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * V1 (sessão) aposentada como destino de login (2026-09-24) — a V2 é o
 * padrão agora pra todo cliente com login por sessão. Fica só como
 * redirect de compatibilidade pra quem tinha essa URL salva/em favoritos.
 */
export const Route = createFileRoute("/portal-app/inicio")({
  beforeLoad: () => {
    throw redirect({ to: "/portal-v2/inicio" });
  },
});
