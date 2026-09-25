import { PageContainer } from "@/components/shared/PageContainer";
import { ClientProfileSettings } from "../components/settings/ClientProfileSettings";
import { ClientAccountInformation } from "../components/settings/ClientAccountInformation";
import { ClientSecuritySettings } from "../components/settings/ClientSecuritySettings";

const SECTIONS = [
  { id: "perfil", label: "Perfil" },
  { id: "conta", label: "Conta" },
  { id: "seguranca", label: "Segurança" },
] as const;

/**
 * Configurações — ÚNICA página pra Perfil/Conta/Segurança (rodada de
 * reconstrução: antes era `ContaV2` misturando os três, mais entradas
 * soltas e duplicadas na sidebar). Tema NÃO mora aqui — é um controle
 * global na topbar (`ClientThemeMenu`), ao lado do sino.
 *
 * Navegação interna por âncoras simples (`#perfil`/`#conta`/`#seguranca`)
 * em vez de tabs — todo o conteúdo continua acessível de uma rolada só,
 * nunca escondido.
 */
export function ConfiguracoesV2() {
  return (
    <PageContainer className="max-w-3xl space-y-8">
      <header>
        <h1 className="text-xl font-semibold text-foreground">Configurações</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Gerencie seu perfil, acesso e preferências.
        </p>
      </header>

      <nav aria-label="Seções de configurações" className="flex gap-1 border-b border-border">
        {SECTIONS.map((s) => (
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
      </div>
    </PageContainer>
  );
}
