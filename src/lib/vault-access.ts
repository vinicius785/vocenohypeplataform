/**
 * Temporary vault access: a non-admin without the vault passphrase unlocks it
 * for 10 minutes by entering the current 6-digit code from an admin's Google
 * Authenticator app (see ConfiguracoesSection's SenhasTab for enrollment).
 *
 * Verification happens entirely server-side (`verifyVaultTotpAndUnlock` in
 * vault-totp.functions.ts), which already has service-role access to the
 * vault's master key — so a valid code unlocks immediately, with no other
 * admin needing to be online to approve anything.
 */
import { useServerFn } from "@tanstack/react-start";
import { verifyVaultTotpAndUnlock } from "./vault-totp.functions";
import { unlockVaultWithRawKey, base64ToBuffer } from "./vault-crypto";

export const GRANT_TTL_MS = 10 * 60 * 1000;

/** Hook returning a callback that verifies a TOTP code and, on success, unlocks the vault for 10 minutes. */
export function useVerifyVaultAccessCode(): (code: string) => Promise<void> {
  const verifyFn = useServerFn(verifyVaultTotpAndUnlock);
  return async (code: string) => {
    const { keyB64, expiresAt } = await verifyFn({ data: { code } });
    await unlockVaultWithRawKey(base64ToBuffer(keyB64), expiresAt);
  };
}
