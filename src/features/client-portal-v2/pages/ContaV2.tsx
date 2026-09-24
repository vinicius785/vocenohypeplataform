import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { KeyRound, Palette, User, ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getTheme, setTheme, type Theme } from "@/lib/theme";
import { usePortalSessionData } from "@/components/portal/portal-session-context";

/**
 * Minha conta — só construído o que tem suporte real de backend hoje:
 * Perfil (leitura, dados reais do usuário autenticado), Segurança (trocar
 * senha — `supabase.auth.updateUser`, funciona de verdade), Aparência
 * (tema — reaproveita `src/lib/theme.ts`, já usado no resto do app).
 *
 * "Usuários e acesso" (convidar/remover/alterar função de membros do
 * cliente) FICA DE FORA por enquanto: as server functions que já existem
 * pra isso (`inviteClientUser`/`listOrganizationMembers`/etc,
 * `organization-invites.functions.ts`) chamam `assertAdmin`, que exige um
 * ADMIN INTERNO da Você no Hype — não existe hoje nenhum caminho de
 * autoatendimento pra um `client_admin` gerenciar sua própria equipe.
 * Construir essa aba de verdade exige uma nova checagem de autorização no
 * backend (algo como "é client_admin desta organização"), que é trabalho
 * de uma rodada própria, não uma tela que promete uma ação que vai
 * devolver 403.
 */

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof User;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      </div>
      {children}
    </section>
  );
}

export function ContaV2() {
  const { data } = usePortalSessionData();
  const { data: authUser } = useQuery({
    queryKey: ["portal-v2-auth-user"],
    queryFn: async () => (await supabase.auth.getUser()).data.user,
    staleTime: 60 * 1000,
  });

  const [theme, setThemeState] = useState<Theme>("light");
  useEffect(() => {
    setThemeState(getTheme());
  }, []);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changing, setChanging] = useState(false);

  const handleChangePassword = async () => {
    if (newPassword.length < 8) {
      toast.error("A senha precisa ter pelo menos 8 caracteres.");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("As senhas não coincidem.");
      return;
    }
    setChanging(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast.success("Senha alterada com sucesso.");
      setNewPassword("");
      setConfirmPassword("");
    } catch {
      toast.error("Não foi possível alterar a senha. Tente novamente.");
    } finally {
      setChanging(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <header>
        <h1 className="text-xl font-semibold text-foreground">Minha conta</h1>
        <p className="mt-1 text-sm text-muted-foreground">{data.clienteNome}</p>
      </header>

      <Section icon={User} title="Perfil">
        <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-muted-foreground">Nome</dt>
            <dd className="mt-0.5 font-medium text-foreground">
              {(authUser?.user_metadata?.full_name as string | undefined) || "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">E-mail</dt>
            <dd className="mt-0.5 font-medium text-foreground">{authUser?.email ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Empresa</dt>
            <dd className="mt-0.5 font-medium text-foreground">{data.clienteNome}</dd>
          </div>
        </dl>
      </Section>

      <Section icon={KeyRound} title="Segurança">
        <div className="flex flex-col gap-2">
          <label className="text-xs text-muted-foreground" htmlFor="v2-new-password">
            Nova senha
          </label>
          <input
            id="v2-new-password"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
          <label className="text-xs text-muted-foreground" htmlFor="v2-confirm-password">
            Confirmar nova senha
          </label>
          <input
            id="v2-confirm-password"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
          <button
            type="button"
            disabled={changing || !newPassword || !confirmPassword}
            onClick={handleChangePassword}
            className="mt-1 w-fit rounded-md bg-brand px-3 py-2 text-sm font-medium text-brand-foreground disabled:opacity-50"
          >
            Alterar senha
          </button>
        </div>
      </Section>

      <Section icon={Palette} title="Aparência">
        <div className="flex gap-2">
          {(["light", "dark"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                setTheme(t);
                setThemeState(t);
              }}
              className={`rounded-md border px-3 py-2 text-sm font-medium ${
                theme === t
                  ? "border-brand bg-brand/10 text-brand"
                  : "border-border text-muted-foreground hover:bg-muted"
              }`}
            >
              {t === "light" ? "Claro" : "Escuro"}
            </button>
          ))}
        </div>
      </Section>

      <div className="flex items-start gap-2 rounded-lg border border-dashed border-border px-4 py-3 text-xs text-muted-foreground">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          "Usuários e acesso" ainda não está disponível aqui — hoje só a equipe interna consegue
          convidar ou remover membros do seu time. Fale com seu contato na Você no Hype enquanto
          isso.
        </p>
      </div>
    </div>
  );
}
