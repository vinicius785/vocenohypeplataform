import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Mail,
  Lock,
  ArrowLeft,
  ArrowRight,
  Loader2,
  CheckCircle2,
  Eye,
  EyeOff,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { REMEMBER_KEY, markTabSessionActive } from "@/lib/session-scope";
import { fetchWorkspace, type Workspace } from "@/lib/workspace-store";
import { resolveUserEnvironment } from "@/lib/user-environment.server";
import { checkLoginRateLimit, checkRecoveryRateLimit } from "@/lib/rate-limit.functions";
import { logLoginSuccess, logLoginFailure } from "@/lib/audit-log.functions";
import { shouldRequireMfaChallenge, checkMfaVerifyRateLimit } from "@/lib/mfa.functions";
import Grainient from "@/components/Grainient";

const GENERIC_RATE_LIMIT_MESSAGE = "Muitas tentativas. Tente novamente em alguns minutos.";
const GENERIC_MFA_ERROR = "Código inválido. Tente novamente.";

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
  const checkLoginRateLimitFn = useServerFn(checkLoginRateLimit);
  const checkRecoveryRateLimitFn = useServerFn(checkRecoveryRateLimit);
  const logLoginSuccessFn = useServerFn(logLoginSuccess);
  const logLoginFailureFn = useServerFn(logLoginFailure);
  const checkMfaVerifyRateLimitFn = useServerFn(checkMfaVerifyRateLimit);
  const [view, setView] = useState<"login" | "forgot" | "forgot-sent" | "mfa-challenge">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ws, setWs] = useState<Workspace | null>(null);

  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);

  const [mfaCode, setMfaCode] = useState("");
  const [mfaBusy, setMfaBusy] = useState(false);
  const [mfaError, setMfaError] = useState<string | null>(null);

  // Completes login exactly the way the pre-MFA code always did (audit log,
  // "remember" flag, tab-session marker, resolve environment, redirect) —
  // extracted so both the no-MFA path (handleSubmit) and the post-challenge
  // path (submitMfaCode) call the IDENTICAL sequence instead of two
  // hand-copied versions that could drift.
  const completeLogin = async () => {
    logLoginSuccessFn().catch(() => {
      /* best-effort audit log only — never block login on this */
    });
    try {
      localStorage.setItem(REMEMBER_KEY, remember ? "true" : "false");
    } catch {
      /* ignore */
    }
    markTabSessionActive();
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
      navigate({ to: "/" });
      return;
    }
    const env = await resolveUserEnvironment(supabase, sessionData.session.user.id);
    navigate({ to: env.redirectTo });
  };

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) return;
      // A session persisted from an earlier tab/visit could be one that
      // completed password auth but never finished an MFA challenge (e.g.
      // the tab was closed mid-challenge) — never silently let that through
      // as if the challenge were satisfied. `getAuthenticatorAssuranceLevel`
      // reflects the CURRENT session's state (Supabase persists aal across
      // token refresh once achieved), so a session that already reached
      // aal2 is unaffected and proceeds exactly as before.
      let aalCurrent: string | null = null;
      let aalNext: string | null = null;
      try {
        const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        aalCurrent = aal?.currentLevel ?? null;
        aalNext = aal?.nextLevel ?? null;
      } catch {
        // If we can't read AAL, fail open to the existing behavior rather
        // than stranding the user on a blank check.
      }
      if (shouldRequireMfaChallenge(aalCurrent, aalNext)) {
        setView("mfa-challenge");
        return;
      }
      const env = await resolveUserEnvironment(supabase, data.session.user.id);
      navigate({ to: env.redirectTo });
    });
  }, [navigate]);

  useEffect(() => {
    fetchWorkspace()
      .then(setWs)
      .catch(() => setWs(null));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const trimmedEmail = email.trim();
    try {
      const { allowed } = await checkLoginRateLimitFn({ data: { email: trimmedEmail } });
      if (!allowed) {
        setLoading(false);
        setError(GENERIC_RATE_LIMIT_MESSAGE);
        return;
      }
    } catch {
      // Rate limiter unreachable — fail open (never block login over an
      // infra hiccup in an anti-abuse floor), same as the server-side
      // `checkRateLimit` helper.
    }

    const { error: err } = await supabase.auth.signInWithPassword({
      email: trimmedEmail,
      password,
    });
    if (err) {
      setLoading(false);
      setError(
        err.message === "Invalid login credentials" ? "E-mail ou senha inválidos." : err.message,
      );
      logLoginFailureFn({ data: { email: trimmedEmail } }).catch(() => {
        /* best-effort audit log only */
      });
      return;
    }
    // Check whether this freshly-authenticated session still needs an MFA
    // challenge before it counts as "logged in". `nextLevel === 'aal2'`
    // means the user HAS a verified factor; `currentLevel === 'aal1'` means
    // this session hasn't satisfied it yet. Anyone without an enrolled
    // factor gets `currentLevel === nextLevel === 'aal1'` here, so
    // `shouldRequireMfaChallenge` is false and every line below this block
    // runs exactly as it did before this feature existed.
    let aalCurrent: string | null = null;
    let aalNext: string | null = null;
    try {
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      aalCurrent = aal?.currentLevel ?? null;
      aalNext = aal?.nextLevel ?? null;
    } catch {
      // Fail open to the existing (non-MFA) path — never block a login over
      // this check failing, same fail-open philosophy as the rate limiter.
    }

    if (shouldRequireMfaChallenge(aalCurrent, aalNext)) {
      setLoading(false);
      setMfaCode("");
      setMfaError(null);
      setView("mfa-challenge");
      return;
    }

    setLoading(false);
    await completeLogin();
  };

  const submitMfaCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setMfaError(null);
    setMfaBusy(true);
    try {
      try {
        const { allowed } = await checkMfaVerifyRateLimitFn();
        if (!allowed) {
          setMfaError(GENERIC_RATE_LIMIT_MESSAGE);
          setMfaBusy(false);
          return;
        }
      } catch {
        // Rate limiter unreachable — fail open, same as the login rate
        // limit check above.
      }

      const { data: factorsData, error: listErr } = await supabase.auth.mfa.listFactors();
      if (listErr) throw listErr;
      const factor = factorsData?.totp?.[0];
      if (!factor) throw new Error("Fator de autenticação não encontrado.");

      const { data: challenge, error: challengeErr } = await supabase.auth.mfa.challenge({
        factorId: factor.id,
      });
      if (challengeErr) throw challengeErr;

      const { error: verifyErr } = await supabase.auth.mfa.verify({
        factorId: factor.id,
        challengeId: challenge.id,
        code: mfaCode,
      });
      if (verifyErr) throw verifyErr;

      // Session is now aal2 (Supabase's own `mfa.verify` already saved the
      // upgraded session) — proceed EXACTLY like the non-MFA path from here.
      setMfaBusy(false);
      await completeLogin();
    } catch {
      // Same challenge can be retried — never force restarting from
      // scratch (re-listing factors, new challenge) on a single wrong code.
      setMfaError(GENERIC_MFA_ERROR);
      setMfaBusy(false);
    }
  };

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = forgotEmail.trim();
    if (!trimmed) return;
    setForgotLoading(true);
    // Anti-enumeration: always the same outcome/copy regardless of whether
    // the email matches a real account, the call errors, or the request
    // was rate-limited — never branch on `error` here (see CLAUDE.md piece
    // B, item 2, and piece C: revealing "blocked" vs "sent" would itself
    // leak account existence).
    try {
      const { allowed } = await checkRecoveryRateLimitFn({ data: { email: trimmed } });
      if (allowed) {
        await supabase.auth.resetPasswordForEmail(trimmed, {
          redirectTo: `${window.location.origin}/redefinir-senha`,
        });
      }
    } catch {
      /* ignored on purpose — same generic message either way */
    } finally {
      setForgotLoading(false);
      setView("forgot-sent");
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
        <div className="mb-7 flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-foreground text-background">
          {ws?.logo ? (
            <img src={ws.logo} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="text-sm font-bold">
              {(ws?.nome || "V").trim().charAt(0).toUpperCase()}
            </span>
          )}
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
                    type={showPassword ? "text" : "password"}
                    required
                    autoComplete="current-password"
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
              Informe seu e-mail e enviaremos um link para redefinir sua senha.
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
              <button
                type="submit"
                disabled={forgotLoading}
                className="inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-full border-2 border-foreground bg-foreground text-sm font-medium text-background transition-colors duration-200 hover:bg-transparent hover:text-foreground disabled:opacity-60"
              >
                {forgotLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enviar instruções"}
              </button>
            </form>
          </>
        )}

        {view === "mfa-challenge" && (
          <>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Verificação em duas etapas
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Digite o código de 6 dígitos do seu app autenticador.
            </p>
            <form onSubmit={submitMfaCode} className="mt-7 space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  Código de verificação
                </label>
                <input
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  autoFocus
                  placeholder="000000"
                  className="h-11 w-full rounded-lg border border-input bg-background px-3 text-center font-mono text-lg tracking-[0.4em] outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                />
              </div>

              {mfaError && <p className="text-xs text-destructive">{mfaError}</p>}

              <button
                type="submit"
                disabled={mfaBusy || mfaCode.length !== 6}
                className="inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-full border-2 border-foreground bg-foreground text-sm font-medium text-background transition-colors duration-200 hover:bg-transparent hover:text-foreground disabled:opacity-60"
              >
                {mfaBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verificar"}
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
              Se existir uma conta vinculada a este e-mail, enviaremos as instruções de recuperação.
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
