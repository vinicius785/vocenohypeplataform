import { createFileRoute, notFound } from "@tanstack/react-router";
import { DesignSystemPage } from "@/components/design-system/DesignSystemPage";

/**
 * Rota só de validação local da Etapa 2 do design system.
 * - Herda o guard de autenticação de `_authenticated/route.tsx` (precisa
 *   de sessão, igual qualquer outra rota autenticada).
 * - `beforeLoad` some com a rota (404) fora de `import.meta.env.DEV` —
 *   `DEV` é sempre `false` num build de produção (Vite), então isso nunca
 *   fica exposto em produção, sem precisar de nenhuma checagem de role
 *   nova nem de mudar o fluxo de login.
 * - Não aparece na sidebar (`AppShell`'s `groups`/`SectionKey` não foram
 *   tocados) — só alcançável digitando a URL.
 */
export const Route = createFileRoute("/_authenticated/design-system")({
  beforeLoad: () => {
    if (!import.meta.env.DEV) {
      throw notFound();
    }
  },
  component: DesignSystemPage,
  head: () => ({ meta: [{ title: "Design System · Plataforma VNH" }] }),
});
