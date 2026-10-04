import { timingSafeEqual } from "node:crypto";

/** Compara um segredo recebido com o esperado em tempo constante: `!==` vaza
 * quantos caracteres iniciais batem via tempo de resposta — teórico, mas
 * trivial de evitar. Usado pelos crons (`Authorization: Bearer $CRON_SECRET`)
 * e pelo webhook de leads (`X-Webhook-Secret`). Quem chama garante que
 * `expected` não é vazio (os dois casos já checam que o segredo está
 * configurado antes de comparar). */
export function secretsMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
