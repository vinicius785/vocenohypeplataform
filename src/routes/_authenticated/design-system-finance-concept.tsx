import { createFileRoute, notFound } from "@tanstack/react-router";
import { FinanceConceptPage } from "@/components/design-system/finance-concept/FinanceConceptPage";

/**
 * Exploração visual isolada do Resumo Financeiro — mesmo guard DEV-only
 * de `_authenticated/design-system.tsx`. Rota irmã (não aninhada sob
 * `/design-system`): aninhar como `/design-system/finance-concept`
 * exigiria que `design-system.tsx` renderizasse `<Outlet />` pra exibir
 * a rota filha (convenção do `src/routes/README.md`), o que mudaria
 * arquivo de uma tela já aprovada — evitado por segurança. Não
 * substitui `/time?section=financeiro`, não lê/grava nenhum dado real
 * (ver `fixture.ts`), e não aparece na sidebar.
 */
export const Route = createFileRoute("/_authenticated/design-system-finance-concept")({
  beforeLoad: () => {
    if (!import.meta.env.DEV) {
      throw notFound();
    }
  },
  component: FinanceConceptPage,
  head: () => ({ meta: [{ title: "Conceito · Resumo Financeiro · Plataforma VNH" }] }),
});
