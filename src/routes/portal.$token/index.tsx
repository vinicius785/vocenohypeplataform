import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * `/portal/$token` sozinho (sem sub-rota) — inclusive links antigos já
 * compartilhados com clientes antes desta Etapa 2 — sempre cai em
 * `/inicio`. Mantém compatibilidade total com o link plano que existia
 * antes da migração pra rotas aninhadas.
 */
export const Route = createFileRoute("/portal/$token/")({
  loader: ({ params }) => {
    throw redirect({ to: "/portal/$token/inicio", params });
  },
});
