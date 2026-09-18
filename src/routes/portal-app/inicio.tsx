import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/portal-app/inicio")({
  ssr: false,
  component: PortalAppInicio,
  head: () => ({ meta: [{ title: "Portal do Cliente · Você no Hype" }] }),
});

function PortalAppInicio() {
  const navigate = useNavigate();
  const { organizationId } = Route.useRouteContext();
  const [orgName, setOrgName] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("organizations")
      .select("name")
      .eq("id", organizationId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setOrgName(data?.name ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [organizationId]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-xl">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Bem-vindo{orgName ? `, ${orgName}` : ""}!
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Este é o novo portal autenticado do cliente. Esta é uma versão mínima — o restante das
          funcionalidades (aprovações de influenciadores, campanhas, relatórios) chega em uma
          próxima fase, reaproveitando o portal por link já existente.
        </p>
        <button
          type="button"
          onClick={handleLogout}
          className="mx-auto mt-6 flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-xs font-medium text-foreground hover:bg-muted"
        >
          <LogOut className="h-3.5 w-3.5" /> Sair
        </button>
      </div>
    </div>
  );
}
