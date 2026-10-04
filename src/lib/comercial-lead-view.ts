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

/** "Vencida há Xd", "Hoje às HH:mm", "Amanhã", ou a data curta — sempre
 * junto da descrição quando existir. Fonte única: o card e o drawer leem
 * daqui, então nunca divergem. */
export function nextActionDisplay(lead: Lead): NextActionDisplay {
  if (!lead.nextActionAt) return null;
  const at = new Date(lead.nextActionAt);
  const now = new Date();
  const desc = lead.nextActionDescription ? ` · ${lead.nextActionDescription}` : "";

  if (lead.nextActionAt < now.getTime()) {
    const days = Math.max(1, Math.ceil((now.getTime() - lead.nextActionAt) / 86_400_000));
    return { tone: "red", text: `Vencida há ${days}d${desc}` };
  }
  if (isSameCalendarDay(at, now)) {
    const hh = at.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    return { tone: "amber", text: `Hoje às ${hh}${desc}` };
  }
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (isSameCalendarDay(at, tomorrow)) {
    return { tone: "neutral", text: `Amanhã${desc}` };
  }
  return { tone: "neutral", text: `${fmtShortDate(lead.nextActionAt)}${desc}` };
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
