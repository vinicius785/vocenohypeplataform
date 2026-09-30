/** Placeholder contextual do composer — extraído como função pura pra ser
 * testável sem depender de DOM (este repositório só roda testes em
 * `environment: "node"`, sem `@testing-library/react`). Regra: nunca um
 * texto genérico quando o nome da conversa está disponível; thread sempre
 * usa seu próprio placeholder fixo, independente do nome da conversa. */
export function computeComposerPlaceholder(input: {
  replyToId?: string;
  conversationLabel?: string;
  /** true só dentro do `ChatV2ThreadPanel` — onde o `replyToId` é sempre a
   * mensagem raiz da thread, e faz sentido um placeholder fixo. Uma
   * resposta inline na timeline principal (item 9 do pedido) também usa
   * `replyToId`, mas ali o placeholder contextual ("Mensagem para X")
   * continua fazendo mais sentido, já que a resposta some do texto (o
   * contexto já aparece no banner "Respondendo a X" acima do composer). */
  isThread?: boolean;
}): string {
  if (input.replyToId && input.isThread) return "Responder nesta thread";
  if (input.conversationLabel) return `Mensagem para ${input.conversationLabel}`;
  return "Escreva uma mensagem…";
}
