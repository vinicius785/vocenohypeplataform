import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
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
import { resolveUserEnvironment } from "@/lib/user-environment.server";
import { checkLoginRateLimit, checkRecoveryRateLimit } from "@/lib/rate-limit.functions";
import { logLoginSuccess, logLoginFailure } from "@/lib/audit-log.functions";
import { shouldRequireMfaChallenge, checkMfaVerifyRateLimit } from "@/lib/mfa.functions";
import { acceptPendingInvites } from "@/lib/accept-invite.functions";
import { AuthCardShell } from "@/components/auth/AuthCardShell";
import { PreparingEnvironmentScreen } from "@/components/auth/PreparingEnvironmentScreen";

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

function LoginPage() {
  const navigate = useNavigate();
  const checkLoginRateLimitFn = useServerFn(checkLoginRateLimit);
  const checkRecoveryRateLimitFn = useServerFn(checkRecoveryRateLimit);
  const logLoginSuccessFn = useServerFn(logLoginSuccess);
  const logLoginFailureFn = useServerFn(logLoginFailure);
  const checkMfaVerifyRateLimitFn = useServerFn(checkMfaVerifyRateLimit);
  const [view, setView] = useState<
    "checking" | "login" | "forgot" | "forgot-sent" | "mfa-challenge" | "preparing"
  >("checking");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);

  const [mfaCode, setMfaCode] = useState("");
  const [mfaBusy, setMfaBusy] = useState(false);
  const [mfaError, setMfaError] = useState<string | null>(null);

  const errorRef = useRef<HTMLParagraphElement | null>(null);
  const mfaErrorRef = useRef<HTMLParagraphElement | null>(null);

  // Completes login exactly the way the pre-MFA code always did (audit log,
  // "remember" flag, tab-session marker, resolve environment, redirect) —
  // extracted so both the no-MFA path (handleSubmit) and the post-challenge
  // path (submitMfaCode) call the IDENTICAL sequence instead of two
  // hand-copied versions that could drift.
  const completeLogin = async () => {
    setView("preparing");
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
    // Ativa qualquer vínculo de cliente ainda `invited` ANTES de resolver o
    // ambiente — autenticar com sucesso pela primeira vez É a aceitação do
    // convite neste modelo (sem token de convite separado). Sem isto, um
    // cliente recém-convidado seria mandado direto pra /acesso-pendente
    // aqui mesmo, sem nunca passar pelo guard do portal onde essa ativação
    // também roda. Fail-open: nunca bloquear o login por isto.
    try {
      await acceptPendingInvites();
    } catch {
      /* segue mesmo assim */
    }
    const env = await resolveUserEnvironment(supabase, sessionData.session.user.id);
    navigate({ to: env.redirectTo });
  };

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) {
        setView("login");
        return;
      }
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
      setView("preparing");
      const env = await resolveUserEnvironment(supabase, data.session.user.id);
      navigate({ to: env.redirectTo });
    });
  }, [navigate]);

  // Move focus to the error message on submit failure so screen-reader
  // users (and keyboard users who just tabbed past it) aren't left with no
  // indication anything happened.
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);
  useEffect(() => {
    if (mfaError) mfaErrorRef.current?.focus();
  }, [mfaError]);

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

    await completeLogin();
    setLoading(false);
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

  if (view === "checking" || view === "preparing") {
    return <PreparingEnvironmentScreen />;
  }

  return (
    <AuthCardShell>
      {view === "login" && (
        <>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Bem-vindo</h1>
          <p className="mt-1 text-sm text-muted-foreground">Acesse sua conta para continuar.</p>
          <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-4">
            <div>
              <label
                htmlFor="login-email"
                className="mb-1.5 block text-xs font-medium text-muted-foreground"
              >
                E-mail
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  id="login-email"
                  type="email"
                  required
                  autoComplete="email"
                  autoFocus
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  aria-invalid={error ? "true" : "false"}
                  className={`${inputBase} pl-10 pr-3`}
                />
              </div>
            </div>
            <div>
              <label
                htmlFor="login-password"
                className="mb-1.5 block text-xs font-medium text-muted-foreground"
              >
                Senha
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  id="login-password"
                  type={showPassword ? "text" : "password"}
                  required
                  autoComplete="current-password"
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

            <div className="flex items-center justify-between">
              <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-input accent-[var(--brand)]"
                />
                Manter conectado
              </label>
              <button
                type="button"
                onClick={() => {
                  setForgotEmail(email);
                  setView("forgot");
                }}
                className="text-xs font-medium text-foreground underline underline-offset-2 hover:text-[var(--brand)]"
              >
                Esqueci minha senha
              </button>
            </div>

            {error && (
              <p
                ref={errorRef}
                tabIndex={-1}
                role="alert"
                className="text-xs text-destructive outline-none"
              >
                {error}
              </p>
            )}

            <button type="submit" disabled={loading} className={primaryButtonBase}>
              <span className="relative inline-flex items-center gap-1.5">
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
                    Entrando…
                  </>
                ) : (
                  <>
                    Entrar
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </span>
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
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Esqueci minha senha
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Informe seu e-mail e enviaremos um link para redefinir sua senha.
          </p>
          <form onSubmit={handleForgotSubmit} noValidate className="mt-6 space-y-4">
            <div>
              <label
                htmlFor="forgot-email"
                className="mb-1.5 block text-xs font-medium text-muted-foreground"
              >
                Seu e-mail
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  id="forgot-email"
                  type="email"
                  required
                  autoComplete="email"
                  autoFocus
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  className={`${inputBase} pl-10 pr-3`}
                />
              </div>
            </div>
            <button type="submit" disabled={forgotLoading} className={primaryButtonBase}>
              {forgotLoading ? (
                <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
              ) : (
                "Enviar instruções"
              )}
            </button>
          </form>
        </>
      )}

      {view === "mfa-challenge" && (
        <>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Verificação em duas etapas
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Digite o código de 6 dígitos do seu app autenticador.
          </p>
          <form onSubmit={submitMfaCode} noValidate className="mt-6 space-y-4">
            <div>
              <label
                htmlFor="mfa-code"
                className="mb-1.5 block text-xs font-medium text-muted-foreground"
              >
                Código de verificação
              </label>
              <input
                id="mfa-code"
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                placeholder="000000"
                aria-invalid={mfaError ? "true" : "false"}
                className={`${inputBase} px-3 text-center font-mono text-lg tracking-[0.4em]`}
              />
            </div>

            {mfaError && (
              <p
                ref={mfaErrorRef}
                tabIndex={-1}
                role="alert"
                className="text-xs text-destructive outline-none"
              >
                {mfaError}
              </p>
            )}

            <button
              type="submit"
              disabled={mfaBusy || mfaCode.length !== 6}
              className={primaryButtonBase}
            >
              {mfaBusy ? (
                <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
              ) : (
                "Verificar"
              )}
            </button>
          </form>
        </>
      )}

      {view === "forgot-sent" && (
        <div className="py-2 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500">
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
            className="mt-6 inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-xs font-medium text-foreground transition-colors hover:bg-muted"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Voltar para login
          </button>
        </div>
      )}

      <p className="mt-7 text-center text-[11px] leading-relaxed text-muted-foreground/70">
        Acesso seguro para equipe e clientes.
      </p>
    </AuthCardShell>
  );
}
