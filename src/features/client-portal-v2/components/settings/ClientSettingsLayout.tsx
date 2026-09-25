import type { ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { KeyRound, User, Users } from "lucide-react";
import { PageContainer } from "@/components/shared/PageContainer";
import { usePortalSessionData } from "@/components/portal/portal-session-context";

type SettingsNavItem = {
  href:
    | "/portal-v2/configuracoes/perfil"
    | "/portal-v2/configuracoes/seguranca"
    | "/portal-v2/configuracoes/acessos";
  label: string;
  description: string;
  icon: typeof User;
};

const PERSONAL_ITEMS: SettingsNavItem[] = [
  {
    href: "/portal-v2/configuracoes/perfil",
    label: "Perfil",
    description: "Sua foto e informações pessoais",
    icon: User,
  },
  {
    href: "/portal-v2/configuracoes/seguranca",
    label: "Segurança",
    description: "Senha e proteção da conta",
    icon: KeyRound,
  },
];

const ORG_ITEM: SettingsNavItem = {
  href: "/portal-v2/configuracoes/acessos",
  label: "Pessoas e acessos",
  description: "Usuários e convites",
  icon: Users,
};

function NavGroup({
  title,
  items,
  currentPath,
}: {
  title: string;
  items: SettingsNavItem[];
  currentPath: string;
}) {
  return (
    <div>
      <p className="px-2.5 text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
        {title}
      </p>
      <ul className="mt-1.5 space-y-0.5">
        {items.map((item) => {
          const active = currentPath.startsWith(item.href);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                to={item.href}
                aria-current={active ? "page" : undefined}
                className={`relative flex items-center gap-2.5 rounded-md px-2.5 py-2.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1 focus-visible:ring-offset-background md:py-2 ${
                  active
                    ? "bg-brand-subtle font-medium text-brand"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                {active && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-y-1 left-0 w-0.5 rounded-full bg-brand"
                  />
                )}
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{item.label}</span>
                  <span className="block truncate text-xs text-text-secondary md:hidden">
                    {item.description}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * Duas colunas no desktop (menu interno sticky + conteúdo da seção
 * ativa), lista → página interna no mobile (via CSS responsivo — cada
 * rota filha já é montada só quando ativa pelo próprio router, então
 * "só uma seção por vez" já é garantido pela navegação, não por
 * esconder com CSS). "Pessoas e acessos" só aparece pra
 * `client_standard`. Tema não mora aqui — a topbar do `PortalV2Shell`
 * já cobre isso.
 */
export function ClientSettingsLayout({ children }: { children: ReactNode }) {
  const { data } = usePortalSessionData();
  const isAdmin = data.role === "client_standard";
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;

  return (
    <PageContainer className="max-w-5xl">
      <header className="mb-6">
        <h1 className="text-xl font-semibold text-foreground">Configurações</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Gerencie seu perfil, segurança e acessos.
        </p>
      </header>

      <div className="flex flex-col gap-8 md:flex-row md:items-start md:gap-10">
        <nav
          aria-label="Seções de configurações"
          className="shrink-0 space-y-5 md:sticky md:top-6 md:w-[220px]"
        >
          <NavGroup title="Conta pessoal" items={PERSONAL_ITEMS} currentPath={currentPath} />
          {isAdmin && <NavGroup title="Organização" items={[ORG_ITEM]} currentPath={currentPath} />}
        </nav>

        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </PageContainer>
  );
}
