/**
 * Client-side encryption for the "Senhas" vault (see ConfiguracoesSection).
 *
 * The vault's `config:senhas` entries sync to Supabase like everything else
 * in `shared-sync.ts` — so anyone with database access (not just the app's
 * own users) could otherwise read every stored password in plain text. This
 * module encrypts the sensitive field with AES-GCM using a single master key
 * that lives server-side (`vault_secret` table, only reachable through the
 * admin-gated `getVaultKey` server function — see vault.functions.ts). There
 * is no team passphrase to remember or leak: admins fetch the key on demand,
 * and everyone else only ever gets a time-boxed copy of it via a temporary
 * grant (see vault-access.ts). Either way the key only ever lives in memory
 * for the current tab — never in localStorage.
 */

let sessionKey: CryptoKey | null = null;
let expiryTimer: number | null = null;
let expiresAt: number | null = null;
const expiryListeners = new Set<() => void>();

export function isVaultUnlocked(): boolean {
  return sessionKey !== null;
}

/** Epoch ms when the current temporary grant expires, or null for an admin's permanent unlock. */
export function getVaultExpiry(): number | null {
  return expiresAt;
}

export function onVaultLocked(listener: () => void): () => void {
  expiryListeners.add(listener);
  return () => expiryListeners.delete(listener);
}

export function lockVault() {
  sessionKey = null;
  expiresAt = null;
  if (expiryTimer !== null) window.clearTimeout(expiryTimer);
  expiryTimer = null;
  expiryListeners.forEach((l) => l());
}

export function bufferToBase64(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}
export function base64ToBuffer(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

/**
 * Admin-only, permanent (for this tab) unlock: imports the master key fetched
 * from `getVaultKey` (vault.functions.ts). Extractable so it can be wrapped
 * and handed to someone granted temporary access (see vault-access.ts).
 */
export async function unlockVaultAsAdmin(keyB64: string): Promise<void> {
  sessionKey = await crypto.subtle.importKey(
    "raw",
    base64ToBuffer(keyB64),
    { name: "AES-GCM" },
    true,
    ["encrypt", "decrypt"],
  );
  expiresAt = null;
  if (expiryTimer !== null) window.clearTimeout(expiryTimer);
  expiryTimer = null;
}

/** Raw key bytes for the currently unlocked vault, to wrap for a temporary grant. */
export async function exportRawSessionKey(): Promise<ArrayBuffer> {
  if (!sessionKey) throw new Error("Cofre bloqueado.");
  return crypto.subtle.exportKey("raw", sessionKey);
}

/**
 * Unlocks the vault from raw key bytes handed over by an admin (temporary
 * grant), auto-locking when `expiresAtMs` is reached — even if this tab stays
 * open. Closing/reloading the tab loses access immediately either way, since
 * the key only ever lives in memory.
 */
export async function unlockVaultWithRawKey(raw: ArrayBuffer, expiresAtMs: number): Promise<void> {
  sessionKey = await crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
  expiresAt = expiresAtMs;
  if (expiryTimer !== null) window.clearTimeout(expiryTimer);
  const ms = Math.max(0, expiresAtMs - Date.now());
  expiryTimer = window.setTimeout(lockVault, ms);
}

export async function vaultEncrypt(plaintext: string): Promise<string> {
  if (!sessionKey) throw new Error("Cofre bloqueado.");
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, sessionKey, encoded);
  return `${bufferToBase64(iv.buffer)}.${bufferToBase64(cipher)}`;
}

export async function vaultDecrypt(ciphertext: string): Promise<string> {
  if (!sessionKey) throw new Error("Cofre bloqueado.");
  const [ivB64, cipherB64] = ciphertext.split(".");
  if (!ivB64 || !cipherB64) throw new Error("Formato inválido.");
  const iv = new Uint8Array(base64ToBuffer(ivB64));
  const cipher = base64ToBuffer(cipherB64);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, sessionKey, cipher);
  return new TextDecoder().decode(plain);
}
