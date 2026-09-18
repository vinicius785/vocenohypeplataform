import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ShieldCheck, ShieldAlert, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { checkMfaVerifyRateLimit } from "@/lib/mfa.functions";
import { logMfaEnrolled, logMfaUnenrolled } from "@/lib/audit-log.functions";
import { SettingsCard } from "./settings-shared";

const GENERIC_RATE_LIMIT_MESSAGE = "Muitas tentativas. Tente novamente em alguns minutos.";

type EnrollState = {
  factorId: string;
  qrCodeDataUri: string;
  secret: string;
} | null;

/**
 * Section 1 of Phase 3 part 2 (see CLAUDE.md): enrollment UI for Supabase
 * Auth's native MFA (`supabase.auth.mfa.*`), available to ANY authenticated
 * user (team or client) — the `isAdmin` prop only adds a recommendation
 * banner, it never gates the feature itself.
 *
 * This is unrelated to the password-vault TOTP already in
 * `SegurancaSection.tsx` (`VaultTotpEnroll`, backed by
 * `vault-totp.functions.ts`) — that feature gates access to the shared
 * password vault; this one gates the user's own login.
 */
export function MfaEnrollCard({ isAdmin }: { isAdmin: boolean }) {
  const checkVerifyRateLimitFn = useServerFn(checkMfaVerifyRateLimit);
  const logEnrolledFn = useServerFn(logMfaEnrolled);
  const logUnenrolledFn = useServerFn(logMfaUnenrolled);

  const [loading, setLoading] = useState(true);
  const [verifiedFactorId, setVerifiedFactorId] = useState<string | null>(null);
  const [enroll, setEnroll] = useState<EnrollState>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unenrollBusy, setUnenrollBusy] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error: err } = await supabase.auth.mfa.listFactors();
      if (err) throw err;
      const totp = data?.totp?.find((f) => f.status === "verified");
      setVerifiedFactorId(totp?.id ?? null);
    } catch {
      // Best-effort status read — leave the card in its "not enrolled"
      // state on failure rather than blocking the whole settings page.
      setVerifiedFactorId(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const startEnroll = async () => {
    setError(null);
    setBusy(true);
    try {
      const { data, error: err } = await supabase.auth.mfa.enroll({ factorType: "totp" });
      if (err) throw err;
      // `totp.qr_code` is raw SVG markup, not a full data URI — the SDK's
      // own docs comment says to prepend `data:image/svg+xml;utf-8,` before
      // using it as an <img> src (verified against the installed
      // `@supabase/auth-js` types, not assumed from memory).
      setEnroll({
        factorId: data.id,
        qrCodeDataUri: `data:image/svg+xml;utf-8,${encodeURIComponent(data.totp.qr_code)}`,
        secret: data.totp.secret,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível iniciar a ativação.");
    } finally {
      setBusy(false);
    }
  };

  const confirmEnroll = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!enroll) return;
    setError(null);
    setBusy(true);
    try {
      const { allowed } = await checkVerifyRateLimitFn().catch(() => ({ allowed: true }));
      if (!allowed) {
        setError(GENERIC_RATE_LIMIT_MESSAGE);
        setBusy(false);
        return;
      }
      const { data: challenge, error: challengeErr } = await supabase.auth.mfa.challenge({
        factorId: enroll.factorId,
      });
      if (challengeErr) throw challengeErr;
      const { error: verifyErr } = await supabase.auth.mfa.verify({
        factorId: enroll.factorId,
        challengeId: challenge.id,
        code,
      });
      if (verifyErr) throw verifyErr;

      logEnrolledFn().catch(() => {
        /* best-effort audit log only */
      });
      toast.success("Autenticação em duas etapas ativada com sucesso.");
      setEnroll(null);
      setCode("");
      await refresh();
    } catch (err) {
      // Same challenge stays open for a retry — a wrong code shouldn't
      // force restarting enrollment (new QR code, new secret) from scratch.
      setError(
        err instanceof Error && err.message
          ? "Código inválido. Confira o app autenticador e tente novamente."
          : "Código inválido. Tente novamente.",
      );
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    if (!verifiedFactorId) return;
    if (
      !window.confirm(
        "Desativar a autenticação em duas etapas? Você voltará a entrar só com e-mail e senha.",
      )
    )
      return;
    setUnenrollBusy(true);
    setError(null);
    try {
      const { error: err } = await supabase.auth.mfa.unenroll({ factorId: verifiedFactorId });
      if (err) throw err;
      logUnenrolledFn().catch(() => {
        /* best-effort audit log only */
      });
      toast.success("Autenticação em duas etapas desativada.");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível desativar.");
    } finally {
      setUnenrollBusy(false);
    }
  };

  return (
    <SettingsCard title="Autenticação em duas etapas">
      <p className="text-xs text-muted-foreground">
        Adicione uma segunda etapa (código de 6 dígitos de um app autenticador) ao entrar na
        plataforma, além do e-mail e senha.
      </p>
      {isAdmin && !verifiedFactorId && (
        <p className="mt-2 flex items-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-700 dark:text-amber-400">
          <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
          Recomendado para administradores.
        </p>
      )}

      {loading && <p className="mt-3 text-xs text-muted-foreground">Carregando...</p>}

      {!loading && verifiedFactorId && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            Ativo — sua conta pede um código a cada novo login.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={unenrollBusy}
            onClick={() => void disable()}
          >
            {unenrollBusy ? "Desativando..." : "Desativar"}
          </Button>
        </div>
      )}

      {!loading && !verifiedFactorId && !enroll && (
        <div className="mt-3">
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={startEnroll}>
            {busy ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Gerando...
              </>
            ) : (
              "Ativar autenticação em duas etapas"
            )}
          </Button>
        </div>
      )}

      {!loading && !verifiedFactorId && enroll && (
        <form onSubmit={confirmEnroll} className="mt-3 space-y-3">
          <div className="flex flex-col items-start gap-3 sm:flex-row">
            <img
              src={enroll.qrCodeDataUri}
              alt="QR code para configurar o autenticador"
              className="h-36 w-36 shrink-0 rounded-md border border-border bg-white p-1"
            />
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">
                Escaneie o QR code com um app autenticador (Google Authenticator, Authy...). Não
                consegue escanear? Digite esta chave manualmente:
              </p>
              <code className="block w-fit rounded bg-muted px-2 py-1 font-mono text-xs">
                {enroll.secret}
              </code>
            </div>
          </div>
          <label className="block space-y-1">
            <span className="text-xs font-medium">Código de 6 dígitos</span>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000"
              className="h-9 w-40 rounded-md border border-input bg-background px-3 text-center font-mono text-sm tracking-[0.3em] outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex items-center gap-2">
            <Button type="submit" size="sm" disabled={busy || code.length !== 6}>
              {busy ? "Confirmando..." : "Confirmar"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setEnroll(null);
                setCode("");
                setError(null);
              }}
            >
              Cancelar
            </Button>
          </div>
        </form>
      )}

      {error && !enroll && <p className="mt-2 text-xs text-destructive">{error}</p>}
    </SettingsCard>
  );
}
