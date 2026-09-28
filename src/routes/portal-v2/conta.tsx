import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * "Minha conta" deixou de ser uma página própria — as informações que
 * ela mostrava (e-mail/empresa/papel, só leitura) viraram um bloco
 * "Informações da conta" ao final da seção Perfil (não é mais um
 * destino de navegação isolado). Link antigo continua funcionando.
 */
export const Route = createFileRoute("/portal-v2/conta")({
  beforeLoad: () => {
    throw redirect({ to: "/portal-v2/configuracoes/perfil" });
  },
});
