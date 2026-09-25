import { ClientPasswordChangeForm } from "./ClientPasswordChangeForm";

/**
 * Segurança — hoje só troca de senha (o único fluxo real que o Supabase
 * Auth oferece pra esta conta). Nenhuma seção de "Sessões" — não existe,
 * pra usuários do Portal V2, uma lista confiável de sessões/dispositivos
 * ativos hoje (só um cookie de organização ativa e o JWT do Supabase);
 * criar essa UI seria inventar dado que a spec pede explicitamente pra
 * não fazer. */
export function ClientSecuritySettings() {
  return (
    <section id="seguranca" className="space-y-4 scroll-mt-20">
      <div>
        <h2 className="text-sm font-semibold text-foreground">Segurança</h2>
        <p className="mt-0.5 text-xs text-text-secondary">Gerencie a senha da sua conta.</p>
      </div>
      <ClientPasswordChangeForm />
    </section>
  );
}
