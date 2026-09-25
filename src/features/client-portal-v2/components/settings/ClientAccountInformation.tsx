import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePortalSessionData } from "@/components/portal/portal-session-context";
import { CLIENT_ROLE_LABEL } from "../ClientSidebarProfile";

/** Conta — só leitura: e-mail, empresa e papel são geridos pela
 * organização/equipe, nunca pelo próprio usuário (empresa e papel nunca
 * são editáveis — critério explícito). "Conta criada em" vem de
 * `auth.users.created_at` (sempre real, sempre disponível) — não uso
 * `organization_members.last_access_at` porque hoje só é atualizado no
 * fluxo de troca de ambiente multi-empresa, não em todo login; mostrar
 * como "último acesso" seria um dado real mas enganosamente incompleto
 * pra quem só tem uma empresa. */
export function ClientAccountInformation() {
  const { data } = usePortalSessionData();
  const { data: authUser } = useQuery({
    queryKey: ["portal-v2-user"],
    queryFn: async () => (await supabase.auth.getUser()).data.user,
    staleTime: 5 * 60 * 1000,
  });

  const roleLabel = CLIENT_ROLE_LABEL[data.role] ?? data.role;

  return (
    <section id="conta" className="space-y-4 scroll-mt-20">
      <div>
        <h2 className="text-sm font-semibold text-foreground">Conta</h2>
        <p className="mt-0.5 text-xs text-text-secondary">
          Informações da sua conta e do seu acesso.
        </p>
      </div>

      <dl className="grid max-w-md grid-cols-1 gap-4 text-sm">
        <div>
          <dt className="text-xs text-text-secondary">E-mail</dt>
          <dd className="mt-0.5 font-medium text-foreground">{authUser?.email ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-xs text-text-secondary">Empresa</dt>
          <dd className="mt-0.5 font-medium text-foreground">{data.clienteNome}</dd>
        </div>
        <div>
          <dt className="text-xs text-text-secondary">Papel</dt>
          <dd className="mt-0.5 font-medium text-foreground">{roleLabel}</dd>
        </div>
        {authUser?.created_at && (
          <div>
            <dt className="text-xs text-text-secondary">Conta criada em</dt>
            <dd className="mt-0.5 font-medium text-foreground">
              {new Date(authUser.created_at).toLocaleDateString("pt-BR")}
            </dd>
          </div>
        )}
      </dl>

      <p className="max-w-md text-xs text-text-secondary">
        E-mail, empresa e papel são gerenciados pela sua organização.
      </p>
    </section>
  );
}
