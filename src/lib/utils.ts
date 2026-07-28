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
