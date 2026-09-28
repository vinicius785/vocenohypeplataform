import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePortalSessionData } from "@/components/portal/portal-session-context";
import { CLIENT_ROLE_LABEL } from "../ClientSidebarProfile";

/**
 * "Informações da conta" — bloco de leitura ao final da seção Perfil
 * (não é mais um destino de navegação próprio; a antiga seção "Conta"
 * isolada só tinha dado somente-leitura, então foi incorporada aqui).
 * E-mail/empresa/papel nunca são editáveis pelo próprio usuário — sem
 * botão de editar o que não pode mudar. "Conta criada em" vem de
 * `auth.users.created_at` (sempre real) — não uso
 * `organization_members.last_access_at` porque hoje só é atualizado no
 * fluxo de troca de ambiente multi-empresa, não em todo login; mostrar
 * como "último acesso" seria um dado real mas enganosamente incompleto
 * pra quem só tem uma empresa.
 */
export function ClientAccountInformation() {
  const { data } = usePortalSessionData();
  const { data: authUser } = useQuery({
    queryKey: ["portal-v2-user"],
    queryFn: async () => (await supabase.auth.getUser()).data.user,
    staleTime: 5 * 60 * 1000,
  });

  const roleLabel = CLIENT_ROLE_LABEL[data.role] ?? data.role;

  const rows: { label: string; value: string }[] = [
    { label: "E-mail", value: authUser?.email ?? "—" },
    { label: "Empresa", value: data.clienteNome },
    { label: "Nível de acesso", value: roleLabel },
  ];
  if (authUser?.created_at) {
    rows.push({
      label: "Conta criada em",
      value: new Date(authUser.created_at).toLocaleDateString("pt-BR"),
    });
  }

  return (
    <div className="max-w-xl border-t border-border pt-6">
      <h3 className="text-sm font-semibold text-foreground">Informações da conta</h3>
      <p className="mt-0.5 text-xs text-text-secondary">Dados vinculados ao seu acesso.</p>

      <dl className="mt-4 divide-y divide-border/70">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex flex-col gap-0.5 py-2.5 text-sm sm:flex-row sm:items-center sm:justify-between sm:gap-4"
          >
            <dt className="text-text-secondary">{row.label}</dt>
            <dd className="font-medium text-foreground sm:text-right">{row.value}</dd>
          </div>
        ))}
      </dl>

      <p className="mt-4 text-xs text-text-secondary">
        E-mail, empresa e nível de acesso são gerenciados pela sua organização.
      </p>
    </div>
  );
}
