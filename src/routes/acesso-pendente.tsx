import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Clock3, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/acesso-pendente")({
  ssr: false,
  component: AcessoPendentePage,
  head: () => ({
    meta: [{ title: "Acesso pendente · Plataforma VNH" }],
  }),
});

function AcessoPendentePage() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        navigate({ to: "/" });
        return;
      }
      setChecking(false);
    });
  }, [navigate]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  };

  if (checking) return null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-8 text-center shadow-xl">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Clock3 className="h-6 w-6" />
        </div>
        <h1 className="mt-4 text-lg font-semibold tracking-tight text-foreground">
          Acesso pendente
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Sua conta ainda não tem nenhum acesso ativo a um workspace ou portal. Fale com um
          administrador da Você no Hype para liberar seu acesso.
        </p>
        <button
          type="button"
          onClick={handleLogout}
          className="mt-6 inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-xs font-medium text-foreground hover:bg-muted"
        >
          <LogOut className="h-3.5 w-3.5" /> Sair
        </button>
      </div>
    </div>
  );
}
