import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowRight, Eye, EyeOff, Lock, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { resolveUserEnvironment } from "@/lib/user-environment.server";
import { AuthCardShell } from "@/components/auth/AuthCardShell";
import { PreparingEnvironmentScreen } from "@/components/auth/PreparingEnvironmentScreen";

/**
 * Client invite-acceptance / first-access screen ("Crie sua senha") — see
 * CLAUDE.md, gap #1. NOT nested under `_authenticated` (clients never enter
 * that route tree): `_authenticated/primeiro-acesso.tsx` remains the
 * team-only first-access flow, completely untouched.
 *
 * Only `portal-app/route.tsx`'s must-change-password redirect points here.
 * This route still defensively re-resolves the environment itself and
 * bounces an internal user (who should never land here) back to
 * `/primeiro-acesso` instead of rendering the wrong form.
 */
export const Route = createFileRoute("/criar-senha")({
  ssr: false,
  component: CriarSenhaPage,
  head: () => ({
    meta: [{ title: "Crie sua senha · Plataforma VNH" }],
  }),
});

const inputBase =
  "h-11 w-full rounded-lg border border-input bg-background/60 text-sm text-foreground outline-none " +
  "transition-colors placeholder:text-muted-foreground/60 hover:border-foreground/30 " +
  "focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/40 " +
  "aria-[invalid=true]:border-destructive aria-[invalid=true]:focus:ring-destructive/30";

const primaryButtonBase =
  "inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-full bg-[var(--brand)] " +
  "text-sm font-medium text-[var(--brand-foreground)] transition-all duration-200 " +
  "hover:bg-[var(--brand-hover)] active:brightness-95 focus-visible:outline-none focus-visible:ring-2 " +
  "focus-visible:ring-[var(--brand)] focus-visible:ring-offset-2 focus-visible:ring-offset-card " +
  "disabled:cursor-not-allowed disabled:opacity-60";

function CriarSenhaPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<"checking" | "ready">("checking");
  const [userId, setUserId] = useState<string | null>(null);
  const [orgName, setOrgName] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        if (!cancelled) navigate({ to: "/" });
        return;
      }
      const uid = sessionData.session.user.id;
      const env = await resolveUserEnvironment(supabase, uid);
      if (cancelled) return;

      // Defensive branch-by-environment (see module doc): an internal user
      // somehow landing here belongs on the team's own first-access flow,
      // never this client-shaped form.
      if (env.type === "internal") {
        navigate({ to: "/primeiro-acesso" });
        return;
      }
      if (env.type !== "client") {
        // pending/suspended/multiple-without-a-resolved-client-org: nothing
        // for this screen to do — send back through the normal resolver
        // path so the user lands wherever they actually belong.
        navigate({ to: env.redirectTo });
        return;
      }

      const { data: org } = await supabase
        .from("organizations")
        .select("name")
        .eq("id", env.organizationId)
        .maybeSingle();
      if (cancelled) return;
      setOrgName(org?.name ?? null);
      setUserId(uid);
      setStatus("ready");
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  const handleBackToLogin = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("A senha precisa ter pelo menos 8 caracteres.");
      return;
    }
    if (password !== confirmPassword) {
      setError("As senhas não conferem.");
      return;
    }
    if (!userId) return;

    setLoading(true);
    try {
      const { error: passErr } = await supabase.auth.updateUser({ password });
      if (passErr) throw passErr;

      const { error: profErr } = await supabase
        .from("profiles")
        .update({ must_change_password: false })
        .eq("id", userId);
      if (profErr) throw profErr;

      const env = await resolveUserEnvironment(supabase, userId);
      navigate({ to: env.redirectTo });
    } catch (err) {
      setLoading(false);
      setError(err instanceof Error ? err.message : "Erro ao criar senha.");
    }
  };

  if (status === "checking") {
    return <PreparingEnvironmentScreen />;
  }

  return (
    <AuthCardShell>
      <h1 className="text-xl font-semibold tracking-tight text-foreground">Crie sua senha</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Você foi convidado para acessar o Portal do Cliente da Você no Hype
        {orgName ? ` em nome de ${orgName}` : ""}.
      </p>
      <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-4">
        <div>
          <label
            htmlFor="new-password"
            className="mb-1.5 block text-xs font-medium text-muted-foreground"
          >
            Nova senha
          </label>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              id="new-password"
              type={showPassword ? "text" : "password"}
              required
              autoComplete="new-password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={error ? "true" : "false"}
              className={`${inputBase} pl-10 pr-10`}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
        <div>
          <label
            htmlFor="confirm-password"
            className="mb-1.5 block text-xs font-medium text-muted-foreground"
          >
            Confirmar nova senha
          </label>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              id="confirm-password"
              type={showPassword ? "text" : "password"}
              required
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              aria-invalid={error ? "true" : "false"}
              className={`${inputBase} pl-10 pr-3`}
            />
          </div>
        </div>

        {error && (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}

        <button type="submit" disabled={loading} className={primaryButtonBase}>
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
              Criando…
            </>
          ) : (
            <>
              Criar senha e acessar
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </button>
        <button
          type="button"
          onClick={handleBackToLogin}
          className="w-full text-center text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          Voltar para o login
        </button>
      </form>
    </AuthCardShell>
  );
}
