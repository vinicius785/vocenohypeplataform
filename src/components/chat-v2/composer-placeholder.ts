/** Placeholder contextual do composer — extraído como função pura pra ser
 * testável sem depender de DOM (este repositório só roda testes em
 * `environment: "node"`, sem `@testing-library/react`). Regra: nunca um
 * texto genérico quando o nome da conversa está disponível; thread sempre
 * usa seu próprio placeholder fixo, independente do nome da conversa. */
export function computeComposerPlaceholder(input: {
  replyToId?: string;
  conversationLabel?: string;
}): string {
  if (input.replyToId) return "Responder nesta thread";
  if (input.conversationLabel) return `Mensagem para ${input.conversationLabel}`;
  return "Escreva uma mensagem…";
}
