/**
 * Lógica pura do "Registrar follow-up" — estado do formulário, validação
 * inline, montagem do payload e o efeito imediato no lead. Sem React; a tela
 * (`FollowUpDialog`) só desenha. Nada aqui muda regra de negócio: o payload
 * enviado a `registerFollowUp` tem exatamente o formato de antes (e a "Sem
 * próxima ação" continua sendo "não enviar nada de próxima ação").
 */
import type { Lead } from "@/lib/comercial";
import type { InteractionOutcome, InteractionType } from "@/lib/commercial-interactions.functions";
import { formatDateToIso } from "@/lib/utils";

export type FollowUpInput = {
  interactionType: InteractionType;
  occurredAt: string;
  summary: string;
  outcome?: InteractionOutcome;
  nextActionDescription?: string;
  nextActionAt?: string;
};

export const SUMMARY_MAX = 2000;
export const NEXT_ACTION_MAX = 300;
/** Folga para o relógio da máquina/servidor: "agora" não conta como futuro. */
const FUTURE_TOLERANCE_MS = 5 * 60_000;

/** Opções de "o que precisa acontecer" — só preenchem o texto livre
 * (`nextActionDescription`); "Outra…" abre o campo de texto. */
export const NEXT_ACTION_OPTIONS = [
  "Cobrar retorno",
  "Enviar proposta",
  "Agendar reunião",
  "Ligar novamente",
  "Enviar mensagem",
  "Enviar apresentação comercial",
] as const;
export const DEFAULT_NEXT_ACTION = "Cobrar retorno";

/**
 * Padrão inteligente de próxima ação por resultado do contato (só vale
 * enquanto a pessoa não mexeu na próxima ação): `null` = sem próxima ação;
 * resultado sem entrada aqui não muda nada.
 */
export const OUTCOME_NEXT_ACTION: Partial<Record<InteractionOutcome, string | null>> = {
  aguardando_retorno: "Cobrar retorno",
  nao_respondeu: "Cobrar retorno",
  proposta_solicitada: "Enviar proposta",
  interessado: "Agendar reunião",
  sem_interesse: null,
};

export type FollowUpFormState = {
  interactionType: InteractionType;
  /** "YYYY-MM-DD" (data local) */
  occurredDate: string;
  /** "HH:MM" */
  occurredTime: string;
  outcome: InteractionOutcome | "";
  summary: string;
  noNextAction: boolean;
  nextActionDescription: string;
  /** "" enquanto não escolhida */
  nextDate: string;
  nextTime: string;
};

const pad = (n: number) => String(n).padStart(2, "0");
export const hhmm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** Hora sugerida para a próxima ação: hoje → próxima hora cheia; outro dia → 09:00. */
export function defaultNextActionTime(date: string, now: Date = new Date()): string {
  if (date === formatDateToIso(now)) return `${pad(Math.min(now.getHours() + 1, 23))}:00`;
  return "09:00";
}

const addDaysLocal = (base: Date, days: number): string => {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return formatDateToIso(d);
};

/** Atalhos de data da próxima ação (data local ISO). */
export function quickNextDates(now: Date = new Date()): { label: string; date: string }[] {
  return [
    { label: "Hoje", date: formatDateToIso(now) },
    { label: "Amanhã", date: addDaysLocal(now, 1) },
  ];
}

/** O lead já tem uma próxima ação combinada ainda por vir? */
export function hasPendingNextAction(
  lead: Pick<Lead, "nextActionAt"> | undefined,
  now: Date = new Date(),
): boolean {
  return !!lead?.nextActionAt && lead.nextActionAt > now.getTime();
}

/**
 * Estado inicial: WhatsApp, "Agora" e — para o registro ser rápido — já com
 * a próxima ação mais comum ("Cobrar retorno", amanhã às 09:00). Se o lead JÁ
 * tem uma próxima ação por vir, o padrão é NÃO mexer nela ("Sem próxima ação"
 * = mantém a atual), para um registro apressado nunca sobrescrevê-la.
 */
export function initialFollowUpState(
  now: Date = new Date(),
  lead?: Pick<Lead, "nextActionAt">,
): FollowUpFormState {
  const keep = hasPendingNextAction(lead, now);
  return {
    interactionType: "whatsapp",
    occurredDate: formatDateToIso(now),
    occurredTime: hhmm(now),
    outcome: "",
    summary: "",
    noNextAction: keep,
    nextActionDescription: keep ? "" : DEFAULT_NEXT_ACTION,
    nextDate: keep ? "" : addDaysLocal(now, 1),
    nextTime: "09:00",
  };
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Data + hora locais → ISO (UTC), como o `datetime-local` de antes. `null` se inválido. */
export function localDateTimeToIso(date: string, time: string): string | null {
  if (!date || !TIME_RE.test(time)) return null;
  const d = new Date(`${date}T${time}:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export type FollowUpErrors = Partial<
  Record<"summary" | "occurredAt" | "nextActionDescription" | "nextDate" | "nextTime", string>
>;

export type FollowUpValidation = {
  errors: FollowUpErrors;
  /** Avisos que NÃO bloqueiam o salvamento. */
  warnings: { nextActionPast?: string };
  valid: boolean;
};

export function validateFollowUp(
  state: FollowUpFormState,
  now: Date = new Date(),
): FollowUpValidation {
  const errors: FollowUpErrors = {};
  const warnings: FollowUpValidation["warnings"] = {};

  if (!state.summary.trim()) errors.summary = "Descreva o que foi conversado ou combinado.";

  const occurred = localDateTimeToIso(state.occurredDate, state.occurredTime);
  if (!occurred) errors.occurredAt = "Informe a data e a hora do contato.";
  else if (Date.parse(occurred) > now.getTime() + FUTURE_TOLERANCE_MS) {
    errors.occurredAt = "O contato não pode estar no futuro.";
  }

  if (!state.noNextAction) {
    if (!state.nextActionDescription.trim()) {
      errors.nextActionDescription = "Diga o que precisa acontecer.";
    }
    if (!state.nextDate) errors.nextDate = "Escolha a data.";
    if (!TIME_RE.test(state.nextTime)) errors.nextTime = "Escolha a hora.";
    const next = localDateTimeToIso(state.nextDate, state.nextTime);
    if (next && Date.parse(next) < now.getTime()) {
      warnings.nextActionPast = "Essa data e hora já passaram — a ação vai aparecer como vencida.";
    }
  }

  return { errors, warnings, valid: Object.keys(errors).length === 0 };
}

/** Payload no formato de sempre; "Sem próxima ação" → nenhum campo de próxima ação. */
export function buildFollowUpInput(state: FollowUpFormState): FollowUpInput | null {
  const occurredAt = localDateTimeToIso(state.occurredDate, state.occurredTime);
  if (!occurredAt) return null;
  const nextAt = state.noNextAction ? null : localDateTimeToIso(state.nextDate, state.nextTime);
  return {
    interactionType: state.interactionType,
    occurredAt,
    summary: state.summary.trim(),
    outcome: state.outcome || undefined,
    nextActionDescription:
      !state.noNextAction && state.nextActionDescription.trim()
        ? state.nextActionDescription.trim()
        : undefined,
    nextActionAt: nextAt ?? undefined,
  };
}

/** Há algo digitado/escolhido que se perderia ao fechar? Os padrões (WhatsApp,
 * momento da abertura, próxima ação sugerida) não contam; mexer neles
 * (`changedDefaults`) conta. */
export function isFollowUpDirty(state: FollowUpFormState, changedDefaults = false): boolean {
  return state.summary.trim().length > 0 || state.outcome !== "" || changedDefaults;
}

/** Próxima ação sugerida pelo resultado, já como mudança de estado; `null` se o
 * resultado não sugere nada. */
export function suggestNextFromOutcome(
  outcome: InteractionOutcome,
  now: Date = new Date(),
): Pick<FollowUpFormState, "noNextAction" | "nextActionDescription" | "nextDate"> | null {
  if (!(outcome in OUTCOME_NEXT_ACTION)) return null;
  const text = OUTCOME_NEXT_ACTION[outcome];
  if (text === null || text === undefined) {
    return { noNextAction: true, nextActionDescription: "", nextDate: "" };
  }
  return { noNextAction: false, nextActionDescription: text, nextDate: addDaysLocal(now, 1) };
}

/**
 * O que o servidor faz no `leads` ao registrar o follow-up, replicado no
 * cliente para a ficha e o card refletirem NA HORA (a releitura confirma
 * depois): `last_contact_at` só avança; a próxima ação só muda quando o
 * follow-up trouxe uma.
 */
export function applyFollowUpToLead(lead: Lead, input: FollowUpInput): Lead {
  const occurred = Date.parse(input.occurredAt);
  const next: Lead = {
    ...lead,
    lastContactAt:
      Number.isNaN(occurred) || (lead.lastContactAt !== undefined && lead.lastContactAt >= occurred)
        ? lead.lastContactAt
        : occurred,
  };
  if (input.nextActionAt !== undefined) {
    const at = Date.parse(input.nextActionAt);
    next.nextActionAt = Number.isNaN(at) ? undefined : at;
    next.nextActionDescription = input.nextActionDescription || undefined;
  }
  return next;
}
