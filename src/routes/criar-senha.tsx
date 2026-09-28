import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowRight, Eye, EyeOff, Lock, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { resolveUserEnvironment } from "@/lib/user-environment.server";
import { LoginScreenShell } from "@/components/auth/LoginScreenShell";
import { AuthPreparingCard, type PreparingStep } from "@/components/auth/AuthPreparingCard";
import { AuthInvalidInviteCard } from "@/components/auth/AuthInvalidInviteCard";
import { AuthAccessErrorCard } from "@/components/auth/AuthAccessErrorCard";
import { withMinimumDuration, withTimeout } from "@/lib/auth-preparing";
import {
  authInputBase,
  authPrimaryButtonBase,
  authLabelBase,
  authSecondaryLinkBase,
  authIconMuted,
} from "@/components/auth/auth-form-styles";

const PREPARING_MIN_MS = 400;
const PREPARING_TIMEOUT_MS = 15_000;
const MIN_PASSWORD_LENGTH = 8;

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

type Status = "checking" | "ready" | "invalid-invite" | "error" | "submitting" | "success";

function CriarSenhaPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status>("checking");
  const [preparingStep, setPreparingStep] = useState<PreparingStep>("verificando");
  const [userId, setUserId] = useState<string | null>(null);
  const [orgName, setOrgName] = useState<string | null>(null);
  const [orgNameLoading, setOrgNameLoading] = useState(true);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkInvite = async () => {
    setStatus("checking");
    setPreparingStep("verificando");
    try {
      await withTimeout(
        withMinimumDuration(
          (async () => {
            const { data: sessionData } = await supabase.auth.getSession();
            if (!sessionData.session) {
              // Sessão ausente = o link de convite/recuperação nunca
              // autenticou (expirado, já usado, ou inválido) — nunca um
              // formulário quebrado, mostra o estado próprio.
              setStatus("invalid-invite");
              return;
            }
            const uid = sessionData.session.user.id;
            setPreparingStep("perfil");
            const env = await resolveUserEnvironment(supabase, uid);

            // Defensive branch-by-environment (see module doc): an
            // internal user somehow landing here belongs on the team's
            // own first-access flow, never this client-shaped form.
            if (env.type === "internal") {
              navigate({ to: "/primeiro-acesso" });
              return;
            }
            if (env.type !== "client") {
              // pending/suspended/multiple-without-a-resolved-client-org:
              // nothing for this screen to do — send back through the
              // normal resolver path so the user lands wherever they
              // actually belong.
              navigate({ to: env.redirectTo });
              return;
            }

            setUserId(uid);
            setStatus("ready");
            setOrgNameLoading(true);
            const { data: org } = await supabase
              .from("organizations")
              .select("name")
              .eq("id", env.organizationId)
              .maybeSingle();
            setOrgName(org?.name ?? null);
            setOrgNameLoading(false);
          })(),
          PREPARING_MIN_MS,
        ),
        PREPARING_TIMEOUT_MS,
      );
    } catch (err) {
      console.error("[criar-senha] falha ao validar convite", err);
      setStatus("error");
    }
  };

  useEffect(() => {
    void checkInvite();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleBackToLogin = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`A senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`);
      return;
    }
    if (password !== confirmPassword) {
      setError("As senhas não conferem.");
      return;
    }
    if (!userId) return;

    setStatus("submitting");
    try {
      const { error: passErr } = await supabase.auth.updateUser({ password });
      if (passErr) throw passErr;

      const { error: profErr } = await supabase
        .from("profiles")
        .update({ must_change_password: false })
        .eq("id", userId);
      if (profErr) throw profErr;

      // Transição suave pro mesmo card de "Preparando seu ambiente" em vez
      // de uma página de sucesso separada — o formulário nunca mais é
      // mostrado depois daqui.
      setStatus("success");
      setPreparingStep("acesso");
      const env = await withTimeout(
        withMinimumDuration(resolveUserEnvironment(supabase, userId), PREPARING_MIN_MS),
        PREPARING_TIMEOUT_MS,
      );
      navigate({ to: env.redirectTo });
    } catch (err) {
      // Preserva a senha digitada (nunca apaga em caso de falha) e volta
      // pro formulário em vez de ficar preso no card de sucesso.
      setStatus("ready");
      setError(err instanceof Error ? err.message : "Erro ao criar senha.");
    }
  };

  if (status === "checking" || status === "success") {
    return (
      <LoginScreenShell>
        <AuthPreparingCard step={preparingStep} />
      </LoginScreenShell>
    );
  }

  if (status === "invalid-invite") {
    return (
      <LoginScreenShell>
        <AuthInvalidInviteCard onBackToLogin={() => navigate({ to: "/" })} />
      </LoginScreenShell>
    );
  }

  if (status === "error") {
    return (
      <LoginScreenShell>
        <AuthAccessErrorCard
          kind="timeout"
          onRetry={() => void checkInvite()}
          onSignOut={() => void handleBackToLogin()}
        />
      </LoginScreenShell>
    );
  }

  const submitting = status === "submitting";
  const tooShort = password.length > 0 && password.length < MIN_PASSWORD_LENGTH;
  const mismatch = confirmPassword.length > 0 && password !== confirmPassword;
  const canSubmit =
    password.length >= MIN_PASSWORD_LENGTH && confirmPassword.length > 0 && !mismatch;

  return (
    <LoginScreenShell eyebrow="Primeiro acesso">
      <h1 className="text-xl font-semibold tracking-tight text-[#111111]">Crie sua senha</h1>
      <p className="mt-1 text-sm text-[#6b6862]">
        Você foi convidado para acessar o Portal do Cliente da Você no Hype
        {orgNameLoading ? (
          <span className="ml-1 inline-block h-3 w-24 animate-pulse rounded bg-[#e2e0dc] align-middle" />
        ) : orgName ? (
          ` em nome de ${orgName}.`
        ) : (
          "."
        )}
      </p>
      <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-5">
        <div>
          <label htmlFor="new-password" className={authLabelBase}>
            Nova senha
          </label>
          <div className="relative">
            <Lock
              className={`pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 ${authIconMuted}`}
            />
            <input
              id="new-password"
              type={showPassword ? "text" : "password"}
              required
              autoComplete="new-password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={tooShort ? "true" : "false"}
              aria-describedby="password-requirements"
              className={`${authInputBase} pl-11 pr-11`}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
              className={`absolute right-4 top-1/2 -translate-y-1/2 transition-colors hover:text-[#111111] ${authIconMuted}`}
            >
              {showPassword ? (
                <EyeOff className="h-[18px] w-[18px]" />
              ) : (
                <Eye className="h-[18px] w-[18px]" />
              )}
            </button>
          </div>
        </div>
        <div>
          <label htmlFor="confirm-password" className={authLabelBase}>
            Confirmar nova senha
          </label>
          <div className="relative">
            <Lock
              className={`pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 ${authIconMuted}`}
            />
            <input
              id="confirm-password"
              type={showPassword ? "text" : "password"}
              required
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              aria-invalid={mismatch ? "true" : "false"}
              className={`${authInputBase} pl-11 pr-4`}
            />
          </div>
        </div>

        <ul id="password-requirements" className="space-y-1 text-xs text-[#6b6862]">
          <li className={password.length >= MIN_PASSWORD_LENGTH ? "text-emerald-600" : undefined}>
            Pelo menos {MIN_PASSWORD_LENGTH} caracteres
          </li>
          <li className={confirmPassword.length > 0 && !mismatch ? "text-emerald-600" : undefined}>
            As senhas coincidem
          </li>
        </ul>

        {error && (
          <p role="alert" className="text-xs text-red-600">
            {error}
          </p>
        )}

        <button type="submit" disabled={submitting || !canSubmit} className={authPrimaryButtonBase}>
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
              Criando sua senha…
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
          className={`w-full text-center ${authSecondaryLinkBase}`}
        >
          Voltar para o login
        </button>
      </form>
    </LoginScreenShell>
  );
}
