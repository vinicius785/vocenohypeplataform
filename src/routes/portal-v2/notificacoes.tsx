import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Notificações deixou de ser uma página própria — vira um popover
 * compacto no sino da topbar (`NotificationsPopover`). Links antigos
 * caem na Início, nunca numa página em branco.
 */
export const Route = createFileRoute("/portal-v2/notificacoes")({
  beforeLoad: () => {
    throw redirect({ to: "/portal-v2/inicio" });
  },
});
