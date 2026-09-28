import { useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { usePortalSessionData } from "@/components/portal/portal-session-context";
import { ClientAccessSettingsPage } from "@/features/client-portal-v2/components/settings/ClientAccessSettings";

/** Só `client_standard` administra pessoas/acessos — quem chega aqui por
 * URL direta sem essa permissão é redirecionado pra Perfil (nunca uma
 * tela bloqueada). O backend recusa a mesma ação de qualquer forma
 * (defesa em profundidade). */
function ClientAccessRouteGuard() {
  const { data } = usePortalSessionData();
  const navigate = useNavigate();
  const isAdmin = data.role === "client_standard";

  useEffect(() => {
    if (!isAdmin) navigate({ to: "/portal-v2/configuracoes/perfil", replace: true });
  }, [isAdmin, navigate]);

  if (!isAdmin) return null;
  return <ClientAccessSettingsPage />;
}

export const Route = createFileRoute("/portal-v2/configuracoes/acessos")({
  component: ClientAccessRouteGuard,
});
