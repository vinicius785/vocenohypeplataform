import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Lock, ArrowRight, Loader2, CheckCircle2, Eye, EyeOff, ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { signOutOtherSessions } from "@/lib/password-reset.functions";
import { resolveUserEnvironment } from "@/lib/user-environment.server";
import { acceptPendingInvites } from "@/lib/accept-invite.functions";
import Grainient from "@/components/Grainient";

export const Route = createFileRoute("/redefinir-senha")({
  component: RedefinirSenhaPage,
  head: () => ({
    meta: [
      { title: "Redefinir senha · Plataforma VNH" },
      { name: "description", content: "Defina uma nova senha para sua conta." },
    ],
  }),
});

/**
 * Landing page from the `resetPasswordForEmail` recovery link (Phase 2a
 * piece B, see CLAUDE.md). The installed @supabase/supabase-js (v2.110)
 * client defaults to the PKCE flow with `detectSessionInUrl: true` (the
 * default — `src/integrations/supabase/client.ts` doesn't override either),
 * so landing here with `?code=...` in the URL makes the SDK exchange it for
 * a session automatically on load and fire a `PASSWORD_RECOVERY` event via
 * `onAuthStateChange`. We listen for that event (and also handle the case
 * where a session already exists by the time this effect runs, since the
 * exchange can complete before the listener is attached) rather than
 * calling `exchangeCodeForSession` ourselves — that method is meant for
 * flows that intercept the redirect manually before the SDK's own
 * `detectSessionInUrl` handling runs, which would race with it here.
 */
function RedefinirSenhaPage() {
  const navigate = useNavigate();
  const signOutOthersFn = useServerFn(signOutOtherSessions);

  const [status, setStatus] = useState<"checking" | "ready" | "invalid">("checking");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const resolvedRef = useRef(false);

  useEffect(() => {
    const markReady = () => {
      if (resolvedRef.current) return;
      resolvedRef.current = true;
      setStatus("ready");
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") markReady();
    });

    // Fallback: if the code exchange already completed before this
    // listener was attached, there's already a session — treat that as
    // ready too rather than getting stuck on "checking" forever.
    const timeout = setTimeout(async () => {
      if (resolvedRef.current) return;
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        markReady();
      } else {
        resolvedRef.current = true;
        setStatus("invalid");
      }
    }, 2500);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 6) {
      setError("A senha precisa ter pelo menos 6 caracteres.");
      return;
    }
    if (password !== confirmPassword) {
      setError("As senhas não coincidem.");
      return;
    }
    setLoading(true);
    const { error: updateErr } = await supabase.auth.updateUser({ password });
    if (updateErr) {
      setLoading(false);
      setError(updateErr.message);
      return;
    }

    // Best-effort — revoking other sessions must never block the user from
    // continuing after a successful password change.
    try {
      await signOutOthersFn();
    } catch (err) {
      console.warn("[redefinir-senha] falha ao encerrar outras sessões", err);
    }

    setLoading(false);
    setDone(true);

    const { data: sessionData } = await supabase.auth.getSession();
    if (sessionData.session) {
      // Mesmo caso de borda coberto em index.tsx: um cliente convidado que
      // recuperou a senha antes de completar o primeiro login também
      // precisa ter o vínculo `invited` ativado aqui, senão cai em
      // "acesso pendente" mesmo tendo acabado de provar a posse do e-mail.
      try {
        await acceptPendingInvites();
      } catch {
        /* segue mesmo assim */
      }
      const env = await resolveUserEnvironment(supabase, sessionData.session.user.id);
      setTimeout(() => navigate({ to: env.redirectTo }), 1200);
    } else {
      setTimeout(() => navigate({ to: "/" }), 1200);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background p-6">
      <div className="pointer-events-none absolute inset-0">
        <Grainient
          color1="#050505"
          color2="#5a5a5a"
          color3="#ffffff"
          timeSpeed={0.5}
          colorBalance={-0.01}
          warpStrength={1.0}
          warpFrequency={5.0}
          warpSpeed={2.0}
          warpAmplitude={50.0}
          blendAngle={0.0}
          blendSoftness={0.05}
          rotationAmount={500.0}
          noiseScale={2.0}
          grainAmount={0.1}
          grainScale={2.0}
          grainAnimated={false}
          contrast={0.95}
          gamma={1.0}
          saturation={0.0}
          centerX={0.0}
          centerY={0.0}
          zoom={1.4}
        />
      </div>

      <div className="relative w-full max-w-sm overflow-hidden rounded-2xl border border-border bg-card/95 p-8 shadow-xl backdrop-blur-sm">
        {status === "checking" && (
          <div className="flex flex-col items-center py-8 text-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <p className="mt-3 text-sm text-muted-foreground">Validando o link de redefinição...</p>
          </div>
        )}

        {status === "invalid" && (
          <div className="py-2 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <ShieldAlert className="h-6 w-6" />
            </div>
            <h1 className="mt-4 text-lg font-semibold tracking-tight text-foreground">
              Link inválido ou expirado
            </h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Solicite uma nova redefinição de senha na tela de login.
            </p>
            <button
              type="button"
              onClick={() => navigate({ to: "/" })}
              className="mt-6 inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-xs font-medium text-foreground hover:bg-muted"
            >
              Voltar para login
            </button>
          </div>
        )}

        {status === "ready" && !done && (
          <>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Definir nova senha
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Escolha uma nova senha para sua conta.
            </p>
            <form onSubmit={handleSubmit} className="mt-7 space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  Nova senha
                </label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    autoComplete="new-password"
                    autoFocus
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-11 w-full rounded-lg border border-input bg-background pl-10 pr-10 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  Confirmar nova senha
                </label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="h-11 w-full rounded-lg border border-input bg-background pl-10 pr-3 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                  />
                </div>
              </div>

              {error && <p className="text-xs text-destructive">{error}</p>}

              <button
                type="submit"
                disabled={loading}
                className="inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-full border-2 border-foreground bg-foreground text-sm font-medium text-background transition-colors duration-200 hover:bg-transparent hover:text-foreground disabled:opacity-60"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    Salvar nova senha
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </form>
          </>
        )}

        {status === "ready" && done && (
          <div className="py-2 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <h1 className="mt-4 text-lg font-semibold tracking-tight text-foreground">
              Senha atualizada
            </h1>
            <p className="mt-1.5 text-sm text-muted-foreground">Redirecionando...</p>
          </div>
        )}
      </div>
    </div>
  );
}
