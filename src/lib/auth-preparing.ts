/**
 * Utilitários puros por trás da transição "Preparando seu ambiente" —
 * extraídos pra serem testáveis sem DOM (este repositório só roda testes
 * em `environment: "node"`).
 */

/** Garante uma duração mínima visual (evita flash de loading por poucos
 * ms) sem nunca atrasar além do necessário quando o trabalho real já
 * demorou mais que o mínimo. */
export async function withMinimumDuration<T>(work: Promise<T>, minMs: number): Promise<T> {
  const [result] = await Promise.all([work, new Promise((resolve) => setTimeout(resolve, minMs))]);
  return result;
}

export class PreparingTimeoutError extends Error {
  constructor() {
    super("Preparing environment timed out");
    this.name = "PreparingTimeoutError";
  }
}

/** Corre `work` contra um limite de tempo — nunca deixa a preparação
 * ficar presa em loading infinito. Rejeita com `PreparingTimeoutError`
 * (nunca vaza o erro técnico original pro texto exibido ao usuário — ver
 * `AuthAccessErrorCard`, que sempre mostra a mesma copy genérica pra
 * timeout). */
export async function withTimeout<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new PreparingTimeoutError()), timeoutMs);
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}
