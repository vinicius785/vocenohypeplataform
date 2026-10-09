import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

/** AES-256-GCM para o token do Instagram em repouso. A chave deriva do App Secret (HKDF): girar o
 * segredo invalida os tokens guardados e exige reconectar, nunca expõe o token. */
const key = (secret: string) =>
  Buffer.from(hkdfSync("sha256", secret, "vnh-instagram", "token-encryption-v1", 32));

export function encryptToken(plain: string, secret: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(secret), iv);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return `v1.${Buffer.concat([iv, c.getAuthTag(), ct]).toString("base64url")}`;
}

/** Devolve `null` (nunca lança com o conteúdo) se o valor foi adulterado ou o segredo mudou. */
export function decryptToken(enc: string, secret: string): string | null {
  try {
    if (!enc.startsWith("v1.")) return null;
    const raw = Buffer.from(enc.slice(3), "base64url");
    if (raw.length < 29) return null;
    const d = createDecipheriv("aes-256-gcm", key(secret), raw.subarray(0, 12));
    d.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}
