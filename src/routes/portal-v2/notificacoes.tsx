import { createFileRoute } from "@tanstack/react-router";
import { NotificacoesV2 } from "@/features/client-portal-v2/pages/NotificacoesV2";

export const Route = createFileRoute("/portal-v2/notificacoes")({
  component: NotificacoesV2,
});
