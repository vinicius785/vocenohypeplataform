import { PageContainer } from "@/components/shared/PageContainer";
import { usePortalSessionData } from "@/components/portal/portal-session-context";
import { ClientProfileSettings } from "../components/settings/ClientProfileSettings";
import { ClientAccountInformation } from "../components/settings/ClientAccountInformation";
import { ClientSecuritySettings } from "../components/settings/ClientSecuritySettings";
import { ClientAccessSettings } from "../components/settings/ClientAccessSettings";

const BASE_SECTIONS = [
  { id: "perfil", label: "Perfil" },
  { id: "conta", label: "Conta" },
  { id: "seguranca", label: "Segurança" },
] as const;

/**
 * Configurações — ÚNICA página pra Perfil/Conta/Segurança/Pessoas e
 * acessos (rodada de reconstrução: antes era `ContaV2` misturando os
 * três, mais entradas soltas e duplicadas na sidebar). Tema NÃO mora
 * aqui — é um controle global na topbar (`ClientThemeMenu`), ao lado do
 * sino.
 *
 * "Pessoas e acessos" só aparece (na nav E no conteúdo) pra quem
 * `usePortalSessionData().role === "client_standard"` — nunca uma tela
 * bloqueada pra quem não administra, a seção simplesmente não existe.
 *
 * Navegação interna por âncoras simples (`#perfil`/`#conta`/`#seguranca`/
 * `#pessoas-e-acessos`) em vez de tabs — todo o conteúdo continua
 * acessível de uma rolada só, nunca escondido.
 */
export function ConfiguracoesV2() {
  const { data } = usePortalSessionData();
  const isAdmin = data.role === "client_standard";
  const sections = isAdmin
    ? [...BASE_SECTIONS, { id: "pessoas-e-acessos", label: "Pessoas e acessos" } as const]
    : BASE_SECTIONS;

  return (
    <PageContainer className="max-w-3xl space-y-8">
      <header>
        <h1 className="text-xl font-semibold text-foreground">Configurações</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Gerencie seu perfil, acesso e preferências.
        </p>
      </header>

      <nav
        aria-label="Seções de configurações"
        className="flex flex-wrap gap-1 border-b border-border"
      >
        {sections.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            className="rounded-t-md px-3 py-2 text-sm font-medium text-text-secondary hover:bg-muted hover:text-foreground"
          >
            {s.label}
          </a>
        ))}
      </nav>

      <div className="space-y-10">
        <ClientProfileSettings />
        <ClientAccountInformation />
        <ClientSecuritySettings />
        <ClientAccessSettings />
      </div>
    </PageContainer>
  );
}
