import { createFileRoute } from "@tanstack/react-router";
import { ClientSecuritySettingsPage } from "@/features/client-portal-v2/components/settings/ClientSecuritySettings";

export const Route = createFileRoute("/portal-v2/configuracoes/seguranca")({
  component: ClientSecuritySettingsPage,
});
