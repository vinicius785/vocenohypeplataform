/**
 * Camada de leitura do perfil do lead (drawer do Comercial) — funções puras,
 * sem React: o que o card e o drawer mostram sobre "próxima ação" e a linha
 * do tempo comercial unificada. Nada aqui escreve dado nem decide regra de
 * negócio (etapa, valor e histórico continuam sendo do motor, ver
 * `comercial-engine.ts`); só organiza para leitura o que já existe.
 */
import type {
  Lead,
  LeadHistoryEntry,
  OpportunityHistoryKind,
  PropostaSnapshot,
} from "@/lib/comercial";
import {
  INTERACTION_OUTCOME_LABEL,
  INTERACTION_TYPE_LABEL,
  type CommercialInteractionRow,
  type InteractionType,
} from "@/lib/commercial-interactions.functions";
import {
  deriveOpportunityNextStep,
  legacyStage,
  NO_CONTACT_ALERT_DAYS,
  type OpportunityStage,
} from "@/lib/comercial-engine";
import { BRASILIA_TZ, addDaysIso, todayIsoInBrasilia } from "@/lib/timezone";

// ---------------------------------------------------------------------------
// Próxima ação combinada (follow-up / reunião) — usada pelo card e pelo drawer
// ---------------------------------------------------------------------------

function fmtShortDate(ts: number): string {
  return new Date(ts).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function isSameCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export type NextActionDisplay = { tone: "red" | "amber" | "neutral"; text: string } | null;

/** Quando é a próxima ação combinada, em relação a agora — a base comum das
 * duas leituras (`nextActionDisplay` e `leadSituation`). */
type NextActionTiming =
  | { kind: "overdue"; tone: "red"; days: number }
  | { kind: "today"; tone: "amber"; time: string }
  | { kind: "tomorrow"; tone: "neutral" }
  | { kind: "date"; tone: "neutral"; date: string };

function nextActionTiming(
  nextActionAt: number | undefined,
  now: Date = new Date(),
): NextActionTiming | null {
  if (!nextActionAt) return null;
  const at = new Date(nextActionAt);
  if (nextActionAt < now.getTime()) {
    return {
      kind: "overdue",
      tone: "red",
      days: Math.max(1, Math.ceil((now.getTime() - nextActionAt) / 86_400_000)),
    };
  }
  if (isSameCalendarDay(at, now)) {
    return {
      kind: "today",
      tone: "amber",
      time: at.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
    };
  }
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (isSameCalendarDay(at, tomorrow)) return { kind: "tomorrow", tone: "neutral" };
  return { kind: "date", tone: "neutral", date: fmtShortDate(nextActionAt) };
}

/** "Vencida há Xd", "Hoje às HH:mm", "Amanhã", ou a data curta — sempre
 * junto da descrição quando existir. Usada no drawer e no diálogo de
 * follow-up (o card usa `leadSituation`, com frases mais naturais). */
export function nextActionDisplay(lead: Lead): NextActionDisplay {
  const timing = nextActionTiming(lead.nextActionAt);
  if (!timing) return null;
  const desc = lead.nextActionDescription ? ` · ${lead.nextActionDescription}` : "";
  switch (timing.kind) {
    case "overdue":
      return { tone: "red", text: `Vencida há ${timing.days}d${desc}` };
    case "today":
      return { tone: "amber", text: `Hoje às ${timing.time}${desc}` };
    case "tomorrow":
      return { tone: "neutral", text: `Amanhã${desc}` };
    case "date":
      return { tone: "neutral", text: `${timing.date}${desc}` };
  }
}

/** "Contato · Cargo" sem repetição: leads que chegam por webhook costumam ter o
 * mesmo texto nos dois campos ("Head of Growth / Digital · Head of Growth /
 * Digital") — nesse caso aparece uma vez só. */
export function contactSubline(contact?: string, role?: string): string {
  const parts = [contact?.trim(), role?.trim()].filter((p): p is string => !!p);
  if (parts.length === 2 && parts[0].toLowerCase() === parts[1].toLowerCase()) return parts[0];
  return parts.join(" · ");
}

// ---------------------------------------------------------------------------
// Situação comercial do lead no card do Kanban
// ---------------------------------------------------------------------------

export type LeadSituation = {
  /** Rótulo discreto antes do texto ("Próxima ação:"), quando faz sentido. */
  prefix?: string;
  text: string;
  /** `danger`/`warning` só para ação vencida/de hoje; o resto é texto neutro. */
  tone: "danger" | "warning" | "neutral" | "muted";
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * A UMA frase que o card mostra sobre o estado real do lead — a que responde
 * "o que preciso fazer?". Prioridade: (1) lead encerrado; (2) próxima ação
 * combinada; (3) aguardando o cliente; (4) tempo desde o último contato.
 * Só lê dados que o lead já tem (nada de interação/resultado, que vivem no
 * drawer).
 */
export function leadSituation(lead: Lead, now: Date = new Date()): LeadSituation {
  const step = deriveOpportunityNextStep(lead);

  if (step.stage === "GANHO") return { text: "Ganho", tone: "muted" };
  if (step.stage === "PERDIDO") {
    return { text: lead.lossReason ? `Perdido — ${lead.lossReason}` : "Perdido", tone: "muted" };
  }

  const timing = nextActionTiming(lead.nextActionAt, now);
  const lastContactDays =
    lead.lastContactAt === undefined
      ? null
      : Math.max(0, Math.floor((now.getTime() - lead.lastContactAt) / 86_400_000));

  if (timing) {
    const when =
      timing.kind === "overdue"
        ? `vencida há ${plural(timing.days, "dia", "dias")}`
        : timing.kind === "today"
          ? `hoje às ${timing.time}`
          : timing.kind === "tomorrow"
            ? "amanhã"
            : timing.date;
    const desc = lead.nextActionDescription?.trim();
    const tone = timing.tone === "red" ? "danger" : timing.tone === "amber" ? "warning" : "neutral";
    return desc
      ? { prefix: "Próxima ação:", text: `${desc} · ${when}`, tone }
      : { prefix: "Próxima ação", text: timing.kind === "date" ? `em ${when}` : when, tone };
  }

  if (step.actor === "CLIENTE") {
    return {
      text:
        lastContactDays !== null && lastContactDays >= NO_CONTACT_ALERT_DAYS
          ? `Aguardando retorno há ${plural(lastContactDays, "dia", "dias")}`
          : "Aguardando retorno",
      tone: "neutral",
    };
  }

  if (lastContactDays === null) return { text: "Nunca contatado", tone: "muted" };
  if (lastContactDays >= NO_CONTACT_ALERT_DAYS) {
    return { text: `Sem contato há ${plural(lastContactDays, "dia", "dias")}`, tone: "muted" };
  }
  if (lastContactDays === 0) return { text: "Contato hoje", tone: "neutral" };
  if (lastContactDays === 1) return { text: "Contato ontem", tone: "neutral" };
  return { text: `Contato há ${lastContactDays} dias`, tone: "neutral" };
}

// ---------------------------------------------------------------------------
// Linha do tempo comercial
// ---------------------------------------------------------------------------

/** Ícone/rótulo de cada tipo de item — as 5 primeiras são interações reais
 * (follow-ups registrados); as demais são eventos do funil gravados pelo
 * motor em `lead.history`. */
export type TimelineKind =
  | InteractionType
  | "stage_change"
  | "meeting"
  | "proposal"
  | "value_change"
  | "negotiation"
  | "won"
  | "lost"
  | "created";

export type TimelineItem = {
  id: string;
  /** Instante do fato (ms) — `occurred_at` do follow-up ou `createdAt` do evento. */
  at: number;
  /** `interaction` = contato real com o cliente; `event` = mudança no funil. */
  source: "interaction" | "event";
  kind: TimelineKind;
  title: string;
  text: string;
  author?: string;
  outcome?: string;
  nextAction?: { description: string; at: number };
  /** Etapa de destino de um evento de etapa (mudança, ganho, perdido) — alimenta a marca colorida. */
  toStage?: OpportunityStage;
};

const EVENT_TITLE: Record<OpportunityHistoryKind, string> = {
  created: "Oportunidade criada",
  stage_change: "Etapa alterada",
  value_change: "Valor alterado",
  proposal: "Proposta",
  meeting: "Reunião",
  negotiation: "Negociação",
  won: "Ganho",
  lost: "Perdido",
};

/** Etapa de destino de um evento do funil, quando houver (mudança de etapa, ganho, perdido). */
function timelineToStage(
  kind: OpportunityHistoryKind,
  h: LeadHistoryEntry,
): OpportunityStage | undefined {
  if (kind === "won") return "GANHO";
  if (kind === "lost") return "PERDIDO";
  if (kind === "stage_change" && h.toStage) return legacyStage(h.toStage);
  return undefined;
}

/** Qual tipo de evento do funil uma entrada de `lead.history` representa.
 * Entradas novas trazem `kind`; as antigas só têm `type` — `stage` e
 * `created` ainda são eventos do funil, já `edit` (edição técnica de campo)
 * não é fato comercial e fica só em "Alterações do lead" (auditoria). */
export function historyEventKind(h: LeadHistoryEntry): OpportunityHistoryKind | null {
  if (h.kind) return h.kind;
  if (h.type === "stage") return "stage_change";
  if (h.type === "created") return "created";
  return null;
}

/** Une follow-ups (contatos reais) e eventos do funil numa só linha do
 * tempo, do mais recente para o mais antigo. Nada é descartado dos dados de
 * origem: entradas de `history` que não são fato comercial simplesmente não
 * entram aqui (continuam em "Alterações do lead"). */
export function buildCommercialTimeline(input: {
  interactions: CommercialInteractionRow[];
  history: LeadHistoryEntry[] | undefined;
}): TimelineItem[] {
  const items: TimelineItem[] = [];

  for (const i of input.interactions) {
    const at = Date.parse(i.occurred_at);
    if (Number.isNaN(at)) continue;
    const nextAt = i.next_action_at ? Date.parse(i.next_action_at) : NaN;
    items.push({
      id: `i:${i.id}`,
      at,
      source: "interaction",
      kind: i.interaction_type,
      title: INTERACTION_TYPE_LABEL[i.interaction_type],
      text: i.summary,
      author: i.created_by_name || undefined,
      outcome: i.outcome ? INTERACTION_OUTCOME_LABEL[i.outcome] : undefined,
      nextAction: Number.isNaN(nextAt)
        ? undefined
        : { description: i.next_action_description ?? "", at: nextAt },
    });
  }

  for (const h of input.history ?? []) {
    const kind = historyEventKind(h);
    if (!kind) continue;
    items.push({
      id: `h:${h.id}`,
      at: h.createdAt,
      source: "event",
      kind,
      title: EVENT_TITLE[kind],
      text: h.text,
      toStage: timelineToStage(kind, h),
    });
  }

  // Estável: em empate de instante, a ordem de inserção (follow-ups antes
  // dos eventos) é preservada.
  return items
    .map((item, idx) => ({ item, idx }))
    .sort((a, b) => b.item.at - a.item.at || a.idx - b.idx)
    .map((x) => x.item);
}

/** "Hoje · 14:30", "Ontem · 09:10" ou "04/10/26 · 14:30" — sempre no
 * horário de Brasília (nunca o fuso do navegador). */
export function formatTimelineWhen(at: number, now: Date = new Date()): string {
  const date = new Date(at);
  const day = todayIsoInBrasilia(date);
  const today = todayIsoInBrasilia(now);
  const time = new Intl.DateTimeFormat("pt-BR", {
    timeZone: BRASILIA_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
  if (day === today) return `Hoje · ${time}`;
  if (day === addDaysIso(today, -1)) return `Ontem · ${time}`;
  const short = new Intl.DateTimeFormat("pt-BR", {
    timeZone: BRASILIA_TZ,
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  }).format(date);
  return `${short} · ${time}`;
}

// ---------------------------------------------------------------------------
// Proposta — margem exibida (mesma conta da aba Proposta e do resumo)
// ---------------------------------------------------------------------------

/** Margem da proposta salva: `preço final − custo total` em R$ e em % do
 * preço final (`null` quando o preço é 0). É a conta que o drawer já fazia
 * para o alerta de "margem abaixo do configurado" — só centralizada. */
export function propostaMargem(p: Pick<PropostaSnapshot, "precoFinal" | "custoTotal">): {
  reais: number;
  pct: number | null;
} {
  const reais = p.precoFinal - p.custoTotal;
  return { reais, pct: p.precoFinal > 0 ? reais / p.precoFinal : null };
}
