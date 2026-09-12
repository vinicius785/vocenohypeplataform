/**
 * Interpretação de intenção do Hypito — puro (sem I/O), determinístico
 * (regras/palavras-chave + tolerância a erro de digitação via
 * `hypito-normalize.ts`), testável isoladamente. Não existe integração
 * de IA aprovada nesta plataforma (confirmado por busca em todo o repo
 * na fase anterior desta feature) — por pedido explícito, "se não houver
 * integração de IA aprovada: criar arquitetura compatível... utilizar
 * templates e comandos determinísticos nesta primeira versão". Se um
 * provedor for aprovado no futuro, ele entra SÓ como uma etapa de
 * classificação adicional antes deste parser, nunca substituindo a
 * resolução de dados/permissões que continua 100% determinística.
 *
 * Reconhecimento por PALAVRA (via `hasCloseToken`, tolerante a
 * digitação), não por frase inteira igual — "criar tarefs", "cria uma
 * tarefas", "criar tarefa" reconhecem a mesma intenção sem precisar de
 * uma lista crescente de frases fixas (pedido, seção 3/4).
 */
import { zonedWallTimeToUtcMs } from "@/lib/hypito-window";
import { startOfWeekIsoBrasilia, addDaysIso, BRASILIA_TZ } from "@/lib/timezone";
import { normalizeForMatch, stripStopwords, tokenize, hasCloseToken } from "@/lib/hypito-normalize";

export type DateRangeIntent =
  | { kind: "today" }
  | { kind: "tomorrow" }
  | { kind: "this_week" }
  | { kind: "next_week" }
  | { kind: "none" };

export type Intent =
  | { type: "greeting" }
  | { type: "help" }
  | { type: "my_tasks"; range: DateRangeIntent }
  | { type: "overdue_tasks" }
  | { type: "upcoming_tasks"; days: number }
  | { type: "next_meeting" }
  | { type: "my_meetings"; range: DateRangeIntent }
  | { type: "pending_approvals" }
  | { type: "campaigns_attention" }
  | { type: "project_summary"; query: string }
  | { type: "campaign_summary"; query: string }
  | { type: "person_tasks"; personQuery: string }
  | { type: "create_task"; raw: string }
  | { type: "create_reminder"; raw: string }
  | { type: "cancel" }
  | { type: "unknown"; raw: string };

/** Confiança da classificação — usada por quem consome pra decidir se
 * executa direto, pergunta "você quis dizer" ou faz uma pergunta aberta
 * (pedido, seção 4). Consultas por palavra-chave clara saem "high";
 * intents com pouca evidência textual saem "low". */
export type Confidence = "high" | "medium" | "low";

export type ClassifiedIntent = {
  intent: Intent;
  confidence: Confidence;
};

function has(text: string, ...words: string[]): boolean {
  return words.some((w) => text.includes(w));
}

/** "hoje"/"amanhã"/"esta semana"/"próxima semana" — sempre resolvido em
 * `America/Sao_Paulo` por quem consome o intent (`hypito-window.ts`),
 * nunca aqui (este arquivo não sabe a hora atual por design, pra ficar
 * puro e testável sem mockar relógio). */
function extractRange(text: string): DateRangeIntent {
  if (has(text, "proxima semana", "próxima semana")) return { kind: "next_week" };
  if (has(text, "esta semana", "essa semana")) return { kind: "this_week" };
  if (has(text, "amanha", "amanhã")) return { kind: "tomorrow" };
  if (has(text, "hoje")) return { kind: "today" };
  return { kind: "none" };
}

/** Extrai o termo de busca de uma entidade a partir da palavra-gatilho
 * ("campanha X", "projeto X") — remove a palavra-gatilho e as stopwords
 * ao redor ("do", "sobre", ...), sobrando só o nome de verdade. Corrige
 * o bug de "campanha do Poupatempo" virar uma busca por "do poupatempo"
 * em vez de "poupatempo". */
function afterKeyword(text: string, keyword: string): string | null {
  const idx = text.indexOf(keyword);
  if (idx < 0) return null;
  const rest = text
    .slice(idx + keyword.length)
    .replace(/[?.!]+$/g, "")
    .trim();
  if (!rest) return null;
  const stripped = stripStopwords(rest);
  return stripped || rest;
}

export function parseIntent(rawText: string): Intent {
  const text = normalizeForMatch(rawText);
  if (!text) return { type: "unknown", raw: rawText };
  const tokens = tokenize(rawText);

  if (/^(oi|ola|opa|eai)\b/.test(text) || /^(e ai|e aí)\b/.test(text)) return { type: "greeting" };
  if (hasCloseToken(tokens, "ajuda", "socorro") || has(text, "o que voce faz", "o que você faz")) {
    return { type: "help" };
  }
  if (hasCloseToken(tokens, "cancelar", "cancela") && tokens.length <= 3) {
    return { type: "cancel" };
  }

  // "criar/cria/crie [uma] tarefa[s]" — tolerante a "tarefs", "tarefaa",
  // etc. via distância de edição, não por lista de grafias.
  const hasCreateVerb = hasCloseToken(
    tokens,
    "criar",
    "crie",
    "cria",
    "adiciona",
    "adicionar",
    "marca",
    "marcar",
  );
  const hasTaskWord = hasCloseToken(tokens, "tarefa", "tarefas");
  const hasReminderWord = hasCloseToken(tokens, "lembrete", "lembretes");
  if (
    (hasCreateVerb && hasTaskWord) ||
    has(text, "preciso criar uma tarefa", "preciso de uma tarefa")
  ) {
    return { type: "create_task", raw: rawText };
  }
  if (has(text, "me lembre", "me avise") || (hasCreateVerb && hasReminderWord)) {
    return { type: "create_reminder", raw: rawText };
  }

  if (hasCloseToken(tokens, "atrasada", "atrasadas", "atrasado", "atrasados")) {
    return { type: "overdue_tasks" };
  }

  if (has(text, "proxima reuniao", "proximo compromisso")) {
    return { type: "next_meeting" };
  }
  if (hasCloseToken(tokens, "reuniao", "reunioes", "agenda", "compromisso", "compromissos")) {
    return { type: "my_meetings", range: extractRange(text) };
  }

  if (hasCloseToken(tokens, "aprovacao", "aprovacoes", "aprovando")) {
    return { type: "pending_approvals" };
  }

  if (
    hasCloseToken(tokens, "campanhas") &&
    hasCloseToken(tokens, "atencao", "risco", "parada", "paradas")
  ) {
    return { type: "campaigns_attention" };
  }

  if (hasCloseToken(tokens, "projeto", "projetos")) {
    const q = afterKeyword(text, "projeto");
    if (q) return { type: "project_summary", query: q };
  }
  if (hasCloseToken(tokens, "campanha", "campanhas")) {
    const q = afterKeyword(text, "campanha");
    if (q) return { type: "campaign_summary", query: q };
  }

  // "o que o Lucas precisa entregar esta semana" / "tarefas da Ana"
  const personMatch = rawText.match(
    /(?:o que\s+(?:o|a)\s+([A-ZÀ-Ú][\wÀ-ÿ]*)\s+(?:precisa|tem|deve)|tarefas d[ao]\s+([A-ZÀ-Ú][\wÀ-ÿ]*))/i,
  );
  if (personMatch) {
    return { type: "person_tasks", personQuery: (personMatch[1] ?? personMatch[2] ?? "").trim() };
  }

  if (hasCloseToken(tokens, "vence", "vencendo", "prazo") && hasCloseToken(tokens, "semana")) {
    return { type: "upcoming_tasks", days: 7 };
  }

  if (has(text, "para hoje", "tenho hoje", "meu dia")) {
    return { type: "my_tasks", range: { kind: "today" } };
  }
  if (hasTaskWord || hasCloseToken(tokens, "pendencia", "pendencias")) {
    return { type: "my_tasks", range: extractRange(text) };
  }

  return { type: "unknown", raw: rawText };
}

/** Confiança grosseira da classificação — não é probabilidade real, só
 * uma faixa (pedido, seção 4) pra decidir se executa direto, confirma
 * "você quis dizer" ou faz pergunta aberta. Consultas com palavra-chave
 * clara e sem ambiguidade textual saem "high"; criação de ação sai
 * "medium" (sempre confirmada de qualquer forma antes de escrever
 * qualquer dado); texto não reconhecido sai "low". */
export function classify(rawText: string): ClassifiedIntent {
  const intent = parseIntent(rawText);
  if (intent.type === "unknown") return { intent, confidence: "low" };
  if (intent.type === "create_task" || intent.type === "create_reminder") {
    return { intent, confidence: "medium" };
  }
  return { intent, confidence: "high" };
}

/** Início (segunda 00:00, inclusivo) e fim (segunda seguinte 00:00,
 * exclusivo) da semana de calendário que começa em `weekStartIso`, como
 * instantes UTC — sempre em `America/Sao_Paulo`, nunca no fuso do
 * processo. */
function weekRangeFrom(weekStartIso: string): { start: Date; end: Date } {
  const start = new Date(zonedWallTimeToUtcMs(weekStartIso, 0, 0, BRASILIA_TZ));
  const end = new Date(zonedWallTimeToUtcMs(addDaysIso(weekStartIso, 7), 0, 0, BRASILIA_TZ));
  return { start, end };
}

/** Janela de datas real (America/Sao_Paulo) pro intent de data.
 *
 * "esta semana"/"próxima semana" usam limites de CALENDÁRIO (segunda a
 * domingo), nunca "hoje + N dias" — antes disso, "próxima semana" pedida
 * num sábado (ex.: 12/09) reaproveitava `computeReportWindow` (pensado
 * pro relatório semanal, baseado em "agora + 7/14 dias") e devolvia
 * 19/09–26/09 em vez de segunda 14/09 a domingo 20/09, um bug real
 * observado em produção. "Próximos 7 dias" continua sendo um intent
 * separado (`upcoming_tasks`), nunca confundido com "próxima semana". */
export function resolveDateRange(
  range: DateRangeIntent,
  now: Date = new Date(),
): { start: Date; end: Date } | null {
  switch (range.kind) {
    case "today": {
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      const end = new Date(start.getTime() + 86_400_000);
      return { start, end };
    }
    case "tomorrow": {
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      start.setDate(start.getDate() + 1);
      const end = new Date(start.getTime() + 86_400_000);
      return { start, end };
    }
    case "this_week":
      return weekRangeFrom(startOfWeekIsoBrasilia(now));
    case "next_week":
      return weekRangeFrom(addDaysIso(startOfWeekIsoBrasilia(now), 7));
    case "none":
      return null;
  }
}
