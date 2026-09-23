/**
 * Única função de normalização de palavra em português usada em TODO o
 * Termo — importação do dicionário, seleção da palavra diária, entrada
 * de teclado (físico e virtual), validação, comparação e testes. Nunca
 * duplicada/reimplementada de forma ligeiramente diferente em outro
 * arquivo (correção explícita desta rodada: evita qualquer divergência
 * de comportamento entre onde a palavra é validada e onde é comparada).
 *
 * Passos, nessa ordem:
 * 1. remove espaços (início/fim e internos);
 * 2. converte pra maiúsculas;
 * 3. decompõe em Unicode NFD (separa letra base de marca diacrítica);
 * 4. remove as marcas diacríticas (acentos, cedilha);
 * 5. mantém só A–Z (descarta qualquer outro caractere restante).
 */
export function normalizePortugueseWord(value: string): string {
  return value
    .replace(/\s+/g, "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Z]/g, "");
}
