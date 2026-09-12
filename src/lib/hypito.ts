/**
 * Identidade central do Hypito — assistente/bot oficial da plataforma.
 *
 * Decisão de arquitetura (documentada na migration
 * `20260911190000_hypito_weekly_report.sql`): o Hypito NÃO é uma linha em
 * `profiles`/`auth.users`. `chat_messages.author_id` é `uuid` sem foreign
 * key, e o Chat já denormaliza `author_name`/`author_photo` na própria
 * mensagem (nunca faz join em `profiles` pra renderizar quem mandou —
 * ver `mapMessage` em `chat-store.ts`) — então um UUID fixo + nome/foto
 * fixos bastam pra ele aparecer como autor real, sem precisar de conta.
 *
 * Isso também é o que garante, de graça, todas as restrições do pedido:
 * sem login/senha (não existe conta), nunca aparece em seletor de
 * responsável/colaborador (esses seletores listam `profiles`, nunca este
 * arquivo), não conta em métrica de "membros ativos" (mesma razão), e não
 * pode ser "excluído" por ninguém — não há linha de usuário pra apagar.
 *
 * Nunca fixar este ID diretamente em componentes de UI — sempre importar
 * daqui, pra ter um único lugar de verdade.
 */

/** UUID fixo, só desta identidade — nunca corresponde a uma linha real de
 * `profiles`/`auth.users`. Gerado uma única vez; não regenerar. Os últimos
 * 12 dígitos hex são o ASCII de "Hypito" (48 79 70 69 74 6f), só pra ficar
 * reconhecível em uma query/log — não tem nenhum outro significado. */
export const HYPITO_AUTHOR_ID = "00000000-0000-4000-a000-48797069746f";

export const HYPITO_NAME = "Hypito";

/** Selo/descrição de presença — nunca um status humano ("online",
 * "ausente"). Usado tanto no Chat quanto em qualquer lugar que precise
 * descrever a conta pra leitor de tela. */
export const HYPITO_TAGLINE = "Assistente da Você no Hype";
export const HYPITO_BADGE_LABEL = "Assistente";

export const HYPITO_AVATAR_URL = "/hypito-avatar.png";

/** Único canal onde o Hypito publica hoje — resolvido pelo `slug` estável
 * de `chat_channels` (nunca pelo nome visível, que pode ser renomeado).
 * Ver coluna `slug` adicionada na migration do Hypito. */
export const HYPITO_REPORT_CHANNEL_SLUG = "geral";

/** Workspace único desta instalação — a tabela/; chave já são desenhadas
 * pra múltiplos workspaces (`hypito_report_settings.workspace_id`,
 * `hypito_report_runs.workspace_id`), mas nada no código hoje lista mais
 * de um. Usar esta constante em vez de fixar `"default"` espalhado. */
export const DEFAULT_WORKSPACE_ID = "default";

/** `true` quando `authorId` é a identidade do Hypito — usado pelo Chat
 * pra decidir se mostra o selo "Assistente" ao lado do nome. */
export function isHypitoAuthorId(authorId: string | null | undefined): boolean {
  return authorId === HYPITO_AUTHOR_ID;
}

/** Chave de idempotência do relatório semanal — uma execução "real" (não
 * prévia) por workspace e por semana. Formato pedido:
 * `weekly-report:{workspaceId}:{weekStart}`. */
export function weeklyReportIdempotencyKey(workspaceId: string, weekStartIso: string): string {
  return `weekly-report:${workspaceId}:${weekStartIso}`;
}
