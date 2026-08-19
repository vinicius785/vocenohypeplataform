import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Mail, Lock, ArrowLeft, ArrowRight, Loader2, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { requestPasswordReset } from "@/lib/password-reset.functions";
import { REMEMBER_KEY, markTabSessionActive } from "@/lib/session-scope";
import Grainient from "@/components/Grainient";

export const Route = createFileRoute("/")({
  component: LoginPage,
  head: () => ({
    meta: [
      { title: "Entrar · Plataforma VNH" },
      { name: "description", content: "Acesse sua conta no workspace Plataforma VNH." },
      { property: "og:title", content: "Entrar · Plataforma VNH" },
      { property: "og:description", content: "Acesse sua conta no workspace Plataforma VNH." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function LoginPage() {
  const navigate = useNavigate();
  const [view, setView] = useState<"login" | "forgot" | "forgot-sent">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotError, setForgotError] = useState<string | null>(null);
  const requestResetFn = useServerFn(requestPasswordReset);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/time" });
    });
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error: err } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setLoading(false);
    if (err) {
      setError(
        err.message === "Invalid login credentials" ? "E-mail ou senha inválidos." : err.message,
      );
      return;
    }
    try {
      localStorage.setItem(REMEMBER_KEY, remember ? "true" : "false");
    } catch {
      /* ignore */
    }
    markTabSessionActive();
    navigate({ to: "/time" });
  };

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotError(null);
    const trimmed = forgotEmail.trim();
    if (!trimmed) return;
    setForgotLoading(true);
    try {
      await requestResetFn({ data: { email: trimmed } });
      setView("forgot-sent");
    } catch (err) {
      setForgotError(err instanceof Error ? err.message : "Erro ao enviar o pedido.");
    } finally {
      setForgotLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background p-6">
      <div className="pointer-events-none absolute inset-0">
        <Grainient
          color1="#ff009c"
          color2="#3300ff"
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
          saturation={1.0}
          centerX={0.0}
          centerY={0.0}
          zoom={1.4}
        />
      </div>

      <div className="relative w-full max-w-sm overflow-hidden rounded-2xl border border-border bg-card/95 p-8 shadow-xl backdrop-blur-sm">
        <div className="mb-7 flex h-10 w-10 items-center justify-center rounded-xl bg-foreground text-background">
          <span className="text-sm font-bold">V</span>
        </div>

        {view === "login" && (
          <>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Entrar</h1>
            <p className="mt-1 text-sm text-muted-foreground">Acesse o workspace com seu e-mail.</p>
            <form onSubmit={handleSubmit} className="mt-7 space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  E-mail
                </label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    autoFocus
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-11 w-full rounded-lg border border-input bg-background pl-10 pr-3 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  Senha
                </label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="password"
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-11 w-full rounded-lg border border-input bg-background pl-10 pr-3 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between">
                <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                    className="h-3.5 w-3.5 rounded border-input accent-foreground"
                  />
                  Manter conectado
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setForgotEmail(email);
                    setForgotError(null);
                    setView("forgot");
                  }}
                  className="text-xs font-medium text-foreground underline underline-offset-2 hover:text-muted-foreground"
                >
                  Esqueci minha senha
                </button>
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
                    Entrar
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </form>
          </>
        )}

        {view === "forgot" && (
          <>
            <button
              type="button"
              onClick={() => setView("login")}
              className="mb-3 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Voltar
            </button>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Esqueci minha senha
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Sem redefinição automática por e-mail aqui — avisamos um administrador do workspace,
              que reseta sua senha manualmente.
            </p>
            <form onSubmit={handleForgotSubmit} className="mt-7 space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  Seu e-mail
                </label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    autoFocus
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    className="h-11 w-full rounded-lg border border-input bg-background pl-10 pr-3 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                  />
                </div>
              </div>
              {forgotError && <p className="text-xs text-destructive">{forgotError}</p>}
              <button
                type="submit"
                disabled={forgotLoading}
                className="inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-full border-2 border-foreground bg-foreground text-sm font-medium text-background transition-colors duration-200 hover:bg-transparent hover:text-foreground disabled:opacity-60"
              >
                {forgotLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Avisar administrador"
                )}
              </button>
            </form>
          </>
        )}

        {view === "forgot-sent" && (
          <div className="py-2 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <h1 className="mt-4 text-lg font-semibold tracking-tight text-foreground">
              Pedido enviado
            </h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Um administrador do workspace foi avisado e vai entrar em contato pra te ajudar a
              redefinir a senha.
            </p>
            <button
              type="button"
              onClick={() => setView("login")}
              className="mt-6 inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-xs font-medium text-foreground hover:bg-muted"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Voltar para login
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
