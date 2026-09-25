import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * "Minha conta" deixou de ser uma página própria — perfil/conta/segurança
 * viraram seções âncora dentro de Configurações. Link antigo continua
 * funcionando, só sobe direto pra "Conta" (a seção que este nome
 * representava).
 */
export const Route = createFileRoute("/portal-v2/conta")({
  beforeLoad: () => {
    throw redirect({ to: "/portal-v2/configuracoes", hash: "conta" });
  },
});
