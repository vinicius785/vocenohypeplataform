import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Building2, Loader2, LogOut, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { resolveUserEnvironment, type AvailableEnvironment } from "@/lib/user-environment.server";
import { setActiveOrganization } from "@/lib/portal-auth.functions";

export const Route = createFileRoute("/selecionar-ambiente")({
  ssr: false,
  component: SelecionarAmbientePage,
  head: () => ({
    meta: [{ title: "Onde você deseja entrar? · Plataforma VNH" }],
  }),
});

function SelecionarAmbientePage() {
  const navigate = useNavigate();
  const [environments, setEnvironments] = useState<AvailableEnvironment[] | null>(null);
  const setActiveOrganizationFn = useServerFn(setActiveOrganization);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        if (!cancelled) navigate({ to: "/" });
        return;
      }
      const env = await resolveUserEnvironment(supabase, sessionData.session.user.id);
      if (cancelled) return;
      // Nunca mostrar o seletor com uma opção só (ou nenhuma) — redireciona
      // direto pra onde `resolveUserEnvironment` já mandaria.
      if (env.type !== "multiple") {
        navigate({ to: env.redirectTo });
        return;
      }
      setEnvironments(env.environments);
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  const handleSelect = async (env: AvailableEnvironment) => {
    await supabase
      .from("organization_members")
      .update({ last_access_at: new Date().toISOString() })
      .eq("organization_id", env.organizationId);
    if (env.type === "client") {
      // Persiste qual das (possivelmente várias) organizações de cliente
      // ativas do usuário é a "atual" — lido pelo guard de `/portal-app/**`
      // a cada request seguinte. Só é necessário no caso multi-ambiente
      // (o caso comum, de organização única, nunca passa por aqui).
      try {
        await setActiveOrganizationFn({ data: { organizationId: env.organizationId } });
      } catch (err) {
        console.error("[selecionar-ambiente] falha ao salvar ambiente ativo", err);
      }
    }
    navigate({ to: env.type === "internal" ? "/time" : "/portal-app/inicio" });
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  };

  if (!environments) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-md">
        <h1 className="text-center text-2xl font-semibold tracking-tight text-foreground">
          Onde você deseja entrar?
        </h1>
        <p className="mt-1.5 text-center text-sm text-muted-foreground">
          Sua conta tem acesso a mais de um ambiente.
        </p>
        <div className="mt-7 space-y-3">
          {environments.map((env) => (
            <button
              key={env.organizationId}
              type="button"
              onClick={() => handleSelect(env)}
              className="flex w-full items-center gap-4 rounded-xl border border-border bg-card p-4 text-left shadow-sm transition-colors hover:bg-muted"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-foreground text-background">
                {env.logoUrl ? (
                  <img src={env.logoUrl} alt="" className="h-full w-full object-cover" />
                ) : env.type === "internal" ? (
                  <Users className="h-5 w-5" />
                ) : (
                  <Building2 className="h-5 w-5" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{env.name}</p>
                <p className="text-xs text-muted-foreground">
                  {env.type === "internal" ? "Workspace interno" : "Portal do cliente"}
                </p>
              </div>
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={handleLogout}
          className="mx-auto mt-6 flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <LogOut className="h-3.5 w-3.5" /> Sair
        </button>
      </div>
    </div>
  );
}
