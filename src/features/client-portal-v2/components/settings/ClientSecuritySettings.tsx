import { ClientPasswordChangeForm } from "./ClientPasswordChangeForm";

/**
 * Página de Segurança — hoje só o bloco "Senha" (o único fluxo real que
 * o Supabase Auth oferece pra esta conta). Sem "Última alteração": não
 * existe hoje um campo confiável que registre quando a senha mudou pela
 * última vez — mostrar um valor inventado violaria a regra explícita de
 * nunca fabricar dado. Sem "Sessões ativas" pelo mesmo motivo — não
 * existe uma lista confiável de sessões/dispositivos pra usuário do
 * Portal V2 hoje (só um cookie de organização ativa e o JWT do
 * Supabase).
 */
export function ClientSecuritySettingsPage() {
  return (
    <div className="max-w-xl">
      <header className="mb-6">
        <h2 className="text-lg font-semibold text-foreground">Segurança</h2>
        <p className="mt-0.5 text-sm text-text-secondary">
          Gerencie sua senha e proteja sua conta.
        </p>
      </header>

      <div className="rounded-lg border border-border p-4">
        <h3 className="text-sm font-semibold text-foreground">Senha</h3>
        <p className="mt-0.5 text-xs text-text-secondary">
          Use uma senha forte e exclusiva para proteger sua conta.
        </p>
        <div className="mt-3">
          <ClientPasswordChangeForm />
        </div>
      </div>
    </div>
  );
}
