/**
 * Interpretação de intenção do Hypito — puro (sem I/O), determinístico
 * (regras/palavras-chave), testável isoladamente. Não existe integração
 * de IA aprovada nesta plataforma (confirmado por busca em todo o repo
 * na fase anterior desta feature) — por pedido explícito, "se não houver
 * integração de IA aprovada: criar arquitetura compatível... utilizar
 * templates e comandos determinísticos nesta primeira versão". Se um
 * provedor for aprovado no futuro, ele entra SÓ como uma etapa de
 * classificação adicional antes deste parser, nunca substituindo a
 * resolução de dados/permissões que continua 100% determinística.
 */
import { computeReportWindow } from "@/lib/hypito-window";

export type DateRangeIntent =
  | { kind: "today" }
  | { kind: "tomorrow" }
  | { kind: "this_week" }
  | { kind: "next_week" }
  | { kind: "none" };

export type Intent =
  | { type: "greeting" }
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
  | { type: "unknown"; raw: string };

function norm(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

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

/** Extrai um trecho após uma palavra-gatilho ("projeto X", "campanha X")
 * — heurística simples de comando, não NLP de verdade. */
function afterKeyword(text: string, ...keywords: string[]): string | null {
  for (const kw of keywords) {
    const idx = text.indexOf(kw);
    if (idx >= 0) {
      const rest = text.slice(idx + kw.length).trim();
      if (rest) return rest.replace(/[?.!]+$/g, "").trim();
    }
  }
  return null;
}

export function parseIntent(rawText: string): Intent {
  const text = norm(rawText);
  if (!text) return { type: "unknown", raw: rawText };

  if (/^(oi|ola|olá|opa|e ai|eai)\b/.test(text)) return { type: "greeting" };

  if (
    has(
      text,
      "criar uma tarefa",
      "criar tarefa",
      "crie uma tarefa",
      "cria uma tarefa",
      "crie tarefa",
    )
  ) {
    return { type: "create_task", raw: rawText };
  }
  if (
    has(
      text,
      "me lembre",
      "me avise",
      "criar um lembrete",
      "criar lembrete",
      "crie um lembrete",
      "cria um lembrete",
    )
  ) {
    return { type: "create_reminder", raw: rawText };
  }

  if (has(text, "atrasad")) return { type: "overdue_tasks" };

  if (
    has(text, "proxima reuniao", "próxima reunião", "proximo compromisso", "próximo compromisso")
  ) {
    return { type: "next_meeting" };
  }
  if (has(text, "reuni") || has(text, "agenda", "compromisso")) {
    return { type: "my_meetings", range: extractRange(text) };
  }

  if (has(text, "aprovaca", "aprovação", "aprovações", "aguardando aprovacao")) {
    return { type: "pending_approvals" };
  }

  if (has(text, "campanhas") && has(text, "atencao", "atenção", "risco", "parada")) {
    return { type: "campaigns_attention" };
  }

  const projectQuery = afterKeyword(text, "resuma o projeto", "resumo do projeto", "projeto ");
  if (has(text, "projeto") && projectQuery) {
    return { type: "project_summary", query: projectQuery };
  }
  const campaignQuery = afterKeyword(text, "resuma a campanha", "resumo da campanha", "campanha ");
  if (has(text, "campanha") && campaignQuery) {
    return { type: "campaign_summary", query: campaignQuery };
  }

  // "o que o Lucas precisa entregar esta semana" / "tarefas da Ana"
  const personMatch = rawText.match(
    /(?:o que\s+(?:o|a)\s+([A-ZÀ-Ú][\wÀ-ÿ]*)\s+(?:precisa|tem|deve)|tarefas d[ao]\s+([A-ZÀ-Ú][\wÀ-ÿ]*))/i,
  );
  if (personMatch) {
    return { type: "person_tasks", personQuery: (personMatch[1] ?? personMatch[2] ?? "").trim() };
  }

  if (has(text, "vence", "vencendo", "prazo") && has(text, "semana")) {
    return { type: "upcoming_tasks", days: 7 };
  }

  if (has(text, "para hoje", "tenho hoje", "meu dia", "compromissos de hoje")) {
    return { type: "my_tasks", range: { kind: "today" } };
  }
  if (has(text, "tarefa") || has(text, "pendencia", "pendência")) {
    return { type: "my_tasks", range: extractRange(text) };
  }

  return { type: "unknown", raw: rawText };
}

/** Janela de datas real (America/Sao_Paulo) pro intent de data — usa a
 * mesma base de `hypito-window.ts` (nunca reimplementa fuso horário). */
export function resolveDateRange(
  range: DateRangeIntent,
  now: Date = new Date(),
): { start: Date; end: Date } | null {
  const window = computeReportWindow(now);
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
      return { start: window.periodStart, end: window.nextWeekEnd };
    case "next_week":
      return { start: window.next7DaysEnd, end: window.nextWeekEnd };
    case "none":
      return null;
  }
}
