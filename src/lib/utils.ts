import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * `new Date("2026-08-05")` parses as UTC midnight, which renders as the
 * previous day in timezones behind UTC (e.g. Brazil) — parse date-only
 * ISO strings as local time instead.
 */
export function formatIsoDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1).toLocaleDateString("pt-BR");
}

/** Mesmo cuidado de fuso de `formatIsoDate`, na direção contrária: parseia
 * uma data-only ISO string como meia-noite local (nunca UTC). */
export function parseIsoDateLocal(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

/** Formata um `Date` como `YYYY-MM-DD` usando os componentes locais —
 * nunca `.toISOString()`, que converte pra UTC e pode voltar o dia
 * anterior em fusos atrás de UTC (ex. Brasil à noite). */
export function formatDateToIso(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
