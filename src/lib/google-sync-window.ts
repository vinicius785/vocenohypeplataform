/** Janela da importação de eventos do Google Agenda (Calendar → Plataforma).
 *
 * Antes eram 120 dias à frente: cada evento diário virava ~120 linhas em `reunioes`, e quem tinha
 * várias séries chegava a 1400+ linhas só de importados — peso inútil no banco e no navegador.
 * Agora: 2 dias para trás e 45 dias à frente (cobre agenda do mês corrente + próximo). Eventos
 * mais distantes entram sozinhos quando chegam dentro da janela. */
export const IMPORT_WINDOW_MS_BEFORE = 2 * 24 * 60 * 60_000;
export const IMPORT_WINDOW_DAYS_AFTER = 45;
export const IMPORT_WINDOW_MS_AFTER = IMPORT_WINDOW_DAYS_AFTER * 24 * 60 * 60_000;
/** Folga antes de apagar importados distantes (evita apagar/reimportar na borda da janela). */
export const IMPORT_PRUNE_MARGIN_DAYS = 7;

const WEEK_MS = 7 * 24 * 60 * 60_000;
const epochWeek = (now: number) => Math.floor(now / WEEK_MS);

/** O `timeMin/timeMax` da listagem fica CONGELADO dentro do `syncToken` do Google (a janela não
 * anda sozinha). Para a janela de 45 dias acompanhar o calendário, o token é guardado com a semana
 * em que foi criado ("<semana>|<token>") e descartado na semana seguinte — o que força uma
 * listagem completa nova (a dedupe por evento/etag evita duplicar e escritas à toa). Tokens antigos
 * (sem prefixo) também são descartados uma vez, o que aplica a janela nova na hora. */
export function encodeSyncToken(token: string, now = Date.now()): string {
  return `${epochWeek(now)}|${token}`;
}

export function decodeSyncToken(
  stored: string | null | undefined,
  now = Date.now(),
): string | null {
  if (!stored) return null;
  const sep = stored.indexOf("|");
  if (sep <= 0) return null;
  return stored.slice(0, sep) === String(epochWeek(now)) ? stored.slice(sep + 1) : null;
}

/** "YYYY-MM-DD" (Brasília) de `now + dias`. */
export function saoPauloDateAfter(days: number, now = Date.now()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(now + days * 24 * 60 * 60_000));
}

/** Data a partir da qual um evento importado do Google fica FORA da janela (não entra mais). */
export const importCutoffDate = (now = Date.now()) =>
  saoPauloDateAfter(IMPORT_WINDOW_DAYS_AFTER, now);

/** Importados do Google além desta data são apagados na limpeza (janela + folga). */
export const pruneCutoffDate = (now = Date.now()) =>
  saoPauloDateAfter(IMPORT_WINDOW_DAYS_AFTER + IMPORT_PRUNE_MARGIN_DAYS, now);
