import { createFileRoute } from "@tanstack/react-router";
import { ClientProfileSettingsPage } from "@/features/client-portal-v2/components/settings/ClientProfileSettings";

export const Route = createFileRoute("/portal-v2/configuracoes/perfil")({
  component: ClientProfileSettingsPage,
});
