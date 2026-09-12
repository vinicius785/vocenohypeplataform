/**
 * Camada central de erros do Hypito — todo erro que pode chegar até o
 * Chat passa por aqui antes. Nenhum texto de exceção crua (nome de
 * tabela, schema, SQL, stack trace) chega ao usuário — só uma mensagem
 * segura e amigável, escolhida por CÓDIGO estável, nunca pela string do
 * erro original.
 *
 * Uso: `throw new HypitoError("entity_not_found", "campanha")` nos
 * pontos que já sabem exatamente o que aconteceu (mensagem segura desde
 * a origem); qualquer OUTRO erro (Supabase, rede, bug) é pego por
 * `toSafeReply`, que nunca repassa `err.message` pro usuário.
 */

export type HypitoErrorCode =
  | "permission_denied"
  | "entity_not_found"
  | "entity_ambiguous"
  | "missing_field"
  | "action_expired"
  | "action_not_found"
  | "action_already_resolved"
  | "persistence_unavailable"
  | "tool_unavailable"
  | "unknown";

const SAFE_MESSAGE: Record<HypitoErrorCode, string> = {
  permission_denied: "Você não tem permissão para essa consulta.",
  entity_not_found: "Não encontrei isso. Quer tentar com outro nome?",
  entity_ambiguous: "Encontrei mais de uma opção parecida — qual delas?",
  missing_field: "Preciso de mais uma informação antes de continuar.",
  action_expired: "Essa confirmação expirou. Posso preparar de novo, se quiser.",
  action_not_found: "Não encontrei essa ação pendente.",
  action_already_resolved: "Essa ação já foi confirmada, cancelada ou expirou.",
  persistence_unavailable: "Não consegui preparar essa ação agora. Nenhuma alteração foi feita.",
  tool_unavailable: "Não consegui consultar essa informação agora. Tente novamente em instantes.",
  unknown: "Não consegui processar isso agora. Tente novamente em instantes.",
};

/** Erro "de negócio" do Hypito — a mensagem já é segura de mostrar
 * (definida pelo próprio código que lançou, não pelo Supabase/driver). */
export class HypitoError extends Error {
  code: HypitoErrorCode;
  constructor(code: HypitoErrorCode, message?: string) {
    super(message ?? SAFE_MESSAGE[code]);
    this.code = code;
  }
}

let seq = 0;
function correlationId(): string {
  seq = (seq + 1) % 100000;
  return `hyp_${Date.now().toString(36)}_${seq.toString(36)}`;
}

/** Registra a causa técnica SÓ no log do servidor (nunca no que volta
 * pro Chat) — inclui um correlation id pra cruzar com o report do
 * usuário sem precisar guardar o texto bruto em nenhuma tabela lida
 * pelo cliente. */
export function logHypitoError(
  scope: string,
  err: unknown,
  context: Record<string, unknown> = {},
): string {
  const id = correlationId();
  const cause = err instanceof Error ? err.message : String(err);
  console.error(`[hypito:${scope}] ${id}`, { cause, ...context });
  return id;
}

/** Converte QUALQUER erro capturado num texto seguro pro Chat. Erros
 * `HypitoError` já têm mensagem aprovada; qualquer outro (Supabase,
 * timeout, bug) vira uma mensagem genérica por categoria, e a causa real
 * só existe no log do servidor (correlation id incluso). */
export function toSafeReply(
  scope: string,
  err: unknown,
  context?: Record<string, unknown>,
): string {
  if (err instanceof HypitoError) return err.message;
  logHypitoError(scope, err, context);
  return SAFE_MESSAGE.unknown;
}
