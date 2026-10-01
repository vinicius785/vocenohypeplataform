/**
 * Correção de segurança (auditoria): funções do Portal do Cliente
 * (`portal-auth.functions.ts`, `cliente-link.functions.ts`) faziam
 * `throw new Error(error.message)` com o texto cru de erro do
 * Postgres/PostgREST — nomes de coluna, de constraint, às vezes de
 * tabela — que uma server function do TanStack Start propaga de volta
 * pro código que chamou, ou seja, pode chegar ao console/erro visível de
 * uma sessão do portal (cliente externo, confiança menor que o time
 * interno). O erro real continua logado no servidor (`console.error`,
 * nunca enviado ao cliente); quem usa esta função recebe só uma
 * mensagem genérica seguinte.
 */
export function throwSafeDbError(error: { message: string }, context?: string): never {
  console.error(context ? `[portal] ${context}:` : "[portal] erro de banco:", error.message);
  throw new Error("Não foi possível completar esta operação. Tente novamente em instantes.");
}
