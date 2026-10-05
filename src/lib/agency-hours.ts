/** Horário de funcionamento da agência — a REGRA vive no banco
 * (`public.business_seconds_between`, migration `20261005100000_business_seconds_between.sql`):
 * toda métrica de tempo de resposta/SLA conta só este intervalo; fora dele o relógio não avança.
 * Este arquivo só espelha os valores para textos da interface; `agency-hours.test.ts` falha se
 * eles divergirem do SQL. NUNCA recalcular tempo de resposta no front-end. */
export const AGENCY_HOURS = {
  timeZone: "America/Sao_Paulo",
  open: "09:00",
  close: "19:00",
} as const;

/** "das 09:00 às 19:00 (horário de Brasília)". */
export const AGENCY_HOURS_LABEL = `das ${AGENCY_HOURS.open} às ${AGENCY_HOURS.close} (horário de Brasília)`;
