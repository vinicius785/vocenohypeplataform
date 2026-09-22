import { createFileRoute } from "@tanstack/react-router";
import { AppShell, type SectionKey } from "@/components/AppShell";
import { ClienteDetailPage } from "@/components/clientes/ClienteDetailPage";
import { useNavigate } from "@tanstack/react-router";

/**
 * `/clientes/:id` — full client-detail page (Part 2 of the client-detail-page
 * rebuild, see CLAUDE.md and `ClienteDetailPage.tsx`'s own docstring). The
 * closest existing precedent is `projeto.$id.tsx`: real nested route, wrapped
 * in the same `<AppShell>` shell (never a bare page), section switching via
 * `AppShell`'s own `onSelect` → `/time?section=...` navigation.
 *
 * This route lives under `_authenticated`, so it inherits that layout
 * route's session guard — a portal-role client session (which never gets a
 * `profiles` row routed through `_authenticated` in the first place, see
 * `resolveUserEnvironment`) cannot reach it, same as every other internal
 * route.
 */
export const Route = createFileRoute("/_authenticated/clientes/$id")({
  component: ClientePage,
  head: ({ params }) => ({ meta: [{ title: `Cliente · ${params.id.slice(0, 6)}` }] }),
});

function ClientePage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();

  const goToSection = (key: SectionKey) => {
    navigate({ to: "/time", search: { section: key } });
  };

  return (
    <AppShell active="clientes" onSelect={goToSection}>
      <ClienteDetailPage clienteId={id} />
    </AppShell>
  );
}
