/**
 * Isolamento de falhas por conexão e decisão de `last_synced_at`, em funções puras.
 *
 * Distinção pedida (cada passo tem um significado diferente):
 * - ciclo executado   → o runner rodou (trava adquirida); NÃO implica sincronização;
 * - sincronização ok  → `ok` da conexão (token válido e listagem/envio concluídos);
 * - falha temporária  → `transient` (Google/rede instáveis; conexão preservada);
 * - autorização inválida → `reauth_required` (precisa reconectar);
 * - falha interna     → `failed` (exceção isolada; as outras conexões continuam).
 */

export type ConnectionResult =
  | "ok"
  /** Conexão válida, mas nada a fazer neste passo (sem reuniões para enviar, ou todas em backoff). */
  | "skipped"
  /** Sucesso PARCIAL: a conexão funcionou e parte das reuniões falhou (cada uma registra o erro). */
  | "partial"
  | "reauth_required"
  | "transient"
  | "failed";

export type ConnectionSummary = {
  total: number;
  ok: number;
  skipped: number;
  partial: number;
  reauthRequired: number;
  transient: number;
  failed: number;
};

/** Roda `handler` para cada conexão; uma exceção vira `failed` só dessa conexão. */
export async function processEachConnection<C extends { user_id: string }>(
  connections: C[],
  handler: (connection: C) => Promise<ConnectionResult>,
  onError?: (errorName: string) => void,
): Promise<Map<string, ConnectionResult>> {
  const outcomes = new Map<string, ConnectionResult>();
  for (const connection of connections) {
    try {
      outcomes.set(connection.user_id, await handler(connection));
    } catch (err) {
      // Só o nome do erro: a mensagem pode carregar URL/dados.
      onError?.(err instanceof Error ? err.name : "UnknownError");
      outcomes.set(connection.user_id, "failed");
    }
  }
  return outcomes;
}

export function summarizeOutcomes(outcomes: Map<string, ConnectionResult>): ConnectionSummary {
  const s: ConnectionSummary = {
    total: outcomes.size,
    ok: 0,
    skipped: 0,
    partial: 0,
    reauthRequired: 0,
    transient: 0,
    failed: 0,
  };
  for (const r of outcomes.values()) {
    if (r === "ok") s.ok++;
    else if (r === "skipped") s.skipped++;
    else if (r === "partial") s.partial++;
    else if (r === "reauth_required") s.reauthRequired++;
    else if (r === "transient") s.transient++;
    else s.failed++;
  }
  return s;
}

/**
 * Conexões cujo `last_synced_at` pode avançar: a importação (que valida o token e lista o
 * calendário) deu `ok` E o envio terminou `ok`, `partial` (parte das reuniões falhou, cada uma com
 * seu erro registrado) ou `skipped` (nada a enviar). Falha TOTAL do envio não avança. Qualquer outra
 * combinação — falha, falha temporária, autorização inválida, ausência no resultado — mantém o
 * valor anterior, para a tela nunca mostrar "sincronizado agora" numa conexão quebrada.
 */
export function connectionsToMarkSynced(
  outbound: Map<string, ConnectionResult>,
  inbound: Map<string, ConnectionResult>,
): string[] {
  const ids: string[] = [];
  for (const [userId, inboundResult] of inbound) {
    const outboundResult = outbound.get(userId);
    if (inboundResult !== "ok") continue;
    if (outboundResult === "ok" || outboundResult === "skipped" || outboundResult === "partial") {
      ids.push(userId);
    }
  }
  return ids;
}

/**
 * Resultado do envio de uma conexão a partir da contagem de reuniões tentadas:
 * - nada tentado → `skipped`;
 * - todas ok → `ok` (sucesso total);
 * - algumas falharam → `partial` (sucesso parcial);
 * - todas as tentadas falharam → `transient` (falha total: NÃO é sincronização bem-sucedida).
 */
export function outboundResultFor(counts: { synced: number; failed: number }): ConnectionResult {
  if (counts.synced + counts.failed === 0) return "skipped";
  if (counts.failed === 0) return "ok";
  return counts.synced > 0 ? "partial" : "transient";
}
