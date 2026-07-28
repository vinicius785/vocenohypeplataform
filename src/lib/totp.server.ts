/**
 * Minimal RFC 6238 (TOTP) implementation using Node's built-in `crypto` —
 * intentionally dependency-free so it doesn't need an allowlist exception in
 * `bunfig.toml`'s supply-chain guard. Server-only: never import this from a
 * `*.functions.ts` file at the top level (dynamic-import it inside the
 * handler instead), same rule as `client.server.ts`.
 */
import { createHmac, randomBytes } from "node:crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const STEP_SECONDS = 30;
const CODE_DIGITS = 6;

function base32Encode(bytes: Buffer): string {
  let bits = "";
  for (const b of bytes) bits += b.toString(2).padStart(8, "0");
  let out = "";
  for (let i = 0; i + 5 <= bits.length; i += 5) {
    out += BASE32_ALPHABET[parseInt(bits.slice(i, i + 5), 2)];
  }
  return out;
}

function base32Decode(secret: string): Buffer {
  const clean = secret.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = "";
  for (const c of clean) {
    const idx = BASE32_ALPHABET.indexOf(c);
    if (idx === -1) continue;
    bits += idx.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

function hotp(secretBytes: Buffer, counter: number): string {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac("sha1", secretBytes).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(code % 10 ** CODE_DIGITS).padStart(CODE_DIGITS, "0");
}

/** Verifies a 6-digit code against a base32 secret, tolerating clock drift of `windowSteps` * 30s either way. */
export function verifyTotpCode(secretBase32: string, code: string, windowSteps = 1): boolean {
  const clean = code.replace(/\D/g, "");
  if (clean.length !== CODE_DIGITS) return false;
  const secretBytes = base32Decode(secretBase32);
  const counter = Math.floor(Date.now() / 1000 / STEP_SECONDS);
  for (let delta = -windowSteps; delta <= windowSteps; delta++) {
    if (hotp(secretBytes, counter + delta) === clean) return true;
  }
  return false;
}
