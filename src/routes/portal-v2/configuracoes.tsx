import { createFileRoute, Outlet } from "@tanstack/react-router";
import { ClientSettingsLayout } from "@/features/client-portal-v2/components/settings/ClientSettingsLayout";

/**
 * Layout route pura (convenção de ponto do TanStack Router, mesmo padrão
 * de `campanhas.tsx`) — só existe pra `configuracoes.perfil`/`.seguranca`/
 * `.acessos` poderem ser filhas dela na árvore de rotas, todas
 * compartilhando o menu interno vertical (`ClientSettingsLayout`).
 * `configuracoes.index.tsx` redireciona pra `/perfil` — esta rota nunca
 * renderiza conteúdo próprio.
 */
export const Route = createFileRoute("/portal-v2/configuracoes")({
  component: () => (
    <ClientSettingsLayout>
      <Outlet />
    </ClientSettingsLayout>
  ),
});
