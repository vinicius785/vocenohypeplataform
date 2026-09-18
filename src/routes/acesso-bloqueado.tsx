import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { LogOut, ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AuthCardShell } from "@/components/auth/AuthCardShell";

/**
 * Distinct outcome from `/acesso-pendente` (see resolveUserEnvironment's
 * `"suspended"` union member, gap #2 in CLAUDE.md's Fase 3/portal work):
 * this is for a user whose access was explicitly suspended (or whose only
 * organization is suspended), not one who simply never had access granted.
 * Same guard shape as `/acesso-pendente` — no auto-retry, no bypass, just
 * sign-out.
 */
export const Route = createFileRoute("/acesso-bloqueado")({
  ssr: false,
  component: AcessoBloqueadoPage,
  head: () => ({
    meta: [{ title: "Acesso bloqueado · Plataforma VNH" }],
  }),
});

function AcessoBloqueadoPage() {
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
    <AuthCardShell showHeader={false}>
      <div className="py-2 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <ShieldAlert className="h-6 w-6" />
        </div>
        <h1 className="mt-4 text-lg font-semibold tracking-tight text-foreground">
          Acesso bloqueado
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Seu acesso a este workspace ou portal foi suspenso. Fale com um administrador da Você no
          Hype para reativá-lo.
        </p>
        <button
          type="button"
          onClick={handleLogout}
          className="mt-6 inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-xs font-medium text-foreground transition-colors hover:bg-muted"
        >
          <LogOut className="h-3.5 w-3.5" /> Sair
        </button>
      </div>
    </AuthCardShell>
  );
}
