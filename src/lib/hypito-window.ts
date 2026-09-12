/**
 * Cálculo do período do relatório semanal do Hypito — puro (sem Supabase,
 * sem I/O), importável tanto do servidor quanto de testes. Reaproveita
 * `timezone.ts` (já usado/testado em produção) pra tudo que é aritmética
 * de data em `America/Sao_Paulo`; a única peça nova aqui é converter uma
 * hora de parede num fuso pra o instante UTC correspondente, sem nunca
 * fixar manualmente um offset como "-03:00" — o deslocamento é sempre
 * derivado da própria IANA tz database pra aquela data específica, então
 * uma futura mudança de regra de fuso (o Brasil já teve DST no passado)
 * não quebra silenciosamente esta conta.
 */
import { startOfWeekIsoBrasilia, weekdayIndexInBrasilia, BRASILIA_TZ } from "@/lib/timezone";

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Instante UTC (em ms) correspondente à hora de parede
 * `isoDate T hour:minute:00` NO FUSO `timeZone` — sem hardcode de offset,
 * e sem depender do fuso do PROCESSO que roda este código (a versão
 * ingênua via `Date.toLocaleString` + `new Date(string)` quebra nisso,
 * porque `new Date(string)` reinterpreta a string no fuso do sistema, não
 * no fuso pedido). Técnica: chuta um instante UTC com essa hora, formata
 * esse instante NO FUSO ALVO via `Intl.DateTimeFormat` (nunca via
 * `Date` — só leitura de componentes), descobre o deslocamento
 * resultante e corrige o chute por ele. Funciona pra qualquer regra de
 * DST/offset vigente na data, em qualquer fuso do processo. */
export function zonedWallTimeToUtcMs(
  isoDate: string,
  hour: number,
  minute: number,
  timeZone: string,
): number {
  const guess = new Date(`${isoDate}T${pad(hour)}:${pad(minute)}:00.000Z`).getTime();
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts: Record<string, string> = {};
  for (const part of dtf.formatToParts(guess)) parts[part.type] = part.value;
  const hourPart = Number(parts.hour) % 24; // Intl pode devolver "24" pra meia-noite
  const asUtcIfSameWallClock = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    hourPart,
    Number(parts.minute),
    Number(parts.second),
  );
  const offsetMs = asUtcIfSameWallClock - guess;
  return guess - offsetMs;
}

export type ReportWindow = {
  /** "YYYY-MM-DD" da segunda-feira da semana — também a chave de
   * idempotência (`weekly-report:{workspaceId}:{weekStart}`). */
  weekStartIso: string;
  /** Segunda-feira 00:00 em America/Sao_Paulo, como instante UTC. */
  periodStart: Date;
  /** Momento da geração (agora) — fim do período, por definição do
   * pedido ("sexta-feira da mesma semana, no momento da geração"). */
  periodEnd: Date;
  /** Início/fim dos "próximos 7 dias" a partir de `periodEnd`. */
  next7DaysStart: Date;
  next7DaysEnd: Date;
  /** Fim da semana seguinte (pra "campanhas/projetos que exigem ação na
   * semana seguinte"). */
  nextWeekEnd: Date;
};

export function computeReportWindow(now: Date = new Date()): ReportWindow {
  const weekStartIso = startOfWeekIsoBrasilia(now);
  const periodStartMs = zonedWallTimeToUtcMs(weekStartIso, 0, 0, BRASILIA_TZ);
  const next7DaysEnd = new Date(now.getTime() + 7 * 86_400_000);
  const nextWeekEnd = new Date(now.getTime() + 14 * 86_400_000);
  return {
    weekStartIso,
    periodStart: new Date(periodStartMs),
    periodEnd: now,
    next7DaysStart: now,
    next7DaysEnd,
    nextWeekEnd,
  };
}

/** `true` quando `date` cai dentro de [start, end) — usado em todos os
 * filtros de "aconteceu nesta semana" pra nunca misturar dado de semana
 * anterior (exceto pendências em aberto, que são consultadas à parte). */
export function isWithin(date: Date | null | undefined, start: Date, end: Date): boolean {
  if (!date || Number.isNaN(date.getTime())) return false;
  return date.getTime() >= start.getTime() && date.getTime() < end.getTime();
}

/** Hoje é o dia configurado (`weekday`, 0=domingo..6=sábado) em
 * `America/Sao_Paulo`? Usado como cinto-e-suspensório dentro da rota de
 * cron — o agendamento de verdade já vem do `schedule` do Vercel Cron,
 * isto só evita publicar se a configuração do dia mudar e o cron externo
 * ficar desalinhado por algum tempo. */
export function isConfiguredWeekdayNow(weekday: number, now: Date = new Date()): boolean {
  return weekdayIndexInBrasilia(now) === weekday;
}
