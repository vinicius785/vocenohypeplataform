/** Helpers de data/hora explicitamente em horário de Brasília — nunca
 * dependem do fuso do navegador/OS (que pode não ser Brasília, mesmo pra
 * usuários no Brasil com o relógio do sistema mal configurado). Mesma
 * técnica já usada (isoladamente) em `google-calendar.functions.ts` e
 * `TimeTrackingPanel.tsx`, centralizada aqui pra reuso. */

export const BRASILIA_TZ = "America/Sao_Paulo";

/** "YYYY-MM-DD" — data de hoje (ou de `date`) em Brasília. */
export function todayIsoInBrasilia(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: BRASILIA_TZ }).format(date);
}

/** "HH:MM" — hora atual (ou de `date`) em Brasília. */
export function nowHHMMInBrasilia(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: BRASILIA_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

/** Hora corrente (0-23) em Brasília. */
export function currentHourInBrasilia(date: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: BRASILIA_TZ,
    hour: "2-digit",
    hour12: false,
  }).formatToParts(date);
  return Number(parts.find((p) => p.type === "hour")?.value ?? "0");
}
