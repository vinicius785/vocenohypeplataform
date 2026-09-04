/** Helpers de data/hora explicitamente em horário de Brasília — nunca
 * dependem do fuso do navegador/OS (que pode não ser Brasília, mesmo pra
 * usuários no Brasil com o relógio do sistema mal configurado). Mesma
 * técnica já usada (isoladamente) em `google-calendar.functions.ts` e
 * `TimeTrackingPanel.tsx`, centralizada aqui pra reuso. */

import { parseIsoDateLocal, formatDateToIso } from "@/lib/utils";

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

/** Dia da semana (0=domingo..6=sábado) de `date` em Brasília. */
export function weekdayIndexInBrasilia(date: Date = new Date()): number {
  const weekdayName = new Intl.DateTimeFormat("en-US", {
    timeZone: BRASILIA_TZ,
    weekday: "long",
  }).format(date);
  const order = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return order.indexOf(weekdayName);
}

function addDaysIso(iso: string, days: number): string {
  const d = parseIsoDateLocal(iso);
  d.setDate(d.getDate() + days);
  return formatDateToIso(d);
}

/** "YYYY-MM-DD" da segunda-feira (00:00) da semana que contém `date`, em
 * Brasília — só aritmética de data (Y-M-D) a partir daí, nunca `Date`
 * sensível ao fuso do navegador. */
export function startOfWeekIsoBrasilia(date: Date = new Date()): string {
  const todayIso = todayIsoInBrasilia(date);
  const dow = weekdayIndexInBrasilia(date); // 0=dom..6=sáb
  const diffToMonday = dow === 0 ? -6 : 1 - dow;
  return addDaysIso(todayIso, diffToMonday);
}

/** Semana atual (segunda a domingo) em Brasília — "esta semana" pro
 * bloco "Entregas da Semana" (sempre fixo, sem seletor de período). */
export function currentWeekRangeBrasilia(date: Date = new Date()): { from: string; to: string } {
  const from = startOfWeekIsoBrasilia(date);
  return { from, to: addDaysIso(from, 6) };
}

/** Semana imediatamente anterior à de `date` (segunda a domingo), em
 * Brasília — pra comparação "vs. semana anterior". */
export function previousWeekRangeBrasilia(date: Date = new Date()): { from: string; to: string } {
  const from = addDaysIso(startOfWeekIsoBrasilia(date), -7);
  return { from, to: addDaysIso(from, 6) };
}
