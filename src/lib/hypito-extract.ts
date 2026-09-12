/**
 * Extração heurística de campos de comandos de criação (tarefa/lembrete)
 * — puro, testável, determinístico. NÃO é NLP de verdade: reconhece os
 * padrões de frase descritos no pedido ("crie uma tarefa para X...",
 * "me lembre de X amanhã às Hh") via regras/regex. Sem IA aprovada nesta
 * plataforma, esta é a "arquitetura compatível... com templates e
 * comandos determinísticos" pedida pra quando não há um provedor.
 *
 * Nunca decide sozinho — tudo aqui vira um rascunho que ainda passa por
 * validação de permissão/existência e por confirmação explícita do
 * usuário (`hypito-actions.server.ts`).
 */
import { zonedWallTimeToUtcMs } from "@/lib/hypito-window";

const WEEKDAYS = [
  "domingo",
  "segunda",
  "terca",
  "terça",
  "quarta",
  "quinta",
  "sexta",
  "sabado",
  "sábado",
];
const WEEKDAY_INDEX: Record<string, number> = {
  domingo: 0,
  segunda: 1,
  terca: 2,
  terça: 2,
  quarta: 3,
  quinta: 4,
  sexta: 5,
  sabado: 6,
  sábado: 6,
};

function norm(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export type ExtractedDateTime = { dateIso: string; hour: number; minute: number } | null;

/** Resolve "hoje"/"amanhã"/"sexta"/"sexta-feira" + "às 10h"/"às 14:30" a
 * partir de `now` (America/Sao_Paulo) — nunca usa o fuso do processo. */
export function extractDateTime(text: string, now: Date = new Date()): ExtractedDateTime {
  const t = norm(text);
  const timeMatch = t.match(/\b(\d{1,2})[h:](\d{2})?\b/);
  const hour = timeMatch ? Number(timeMatch[1]) : 9;
  const minute = timeMatch?.[2] ? Number(timeMatch[2]) : 0;
  if (hour > 23 || minute > 59) return null;

  const todayIso = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(now);
  const addDays = (iso: string, days: number) => {
    const d = new Date(`${iso}T00:00:00`);
    d.setDate(d.getDate() + days);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  if (t.includes("amanha")) return { dateIso: addDays(todayIso, 1), hour, minute };
  if (t.includes("hoje")) return { dateIso: todayIso, hour, minute };

  for (const w of WEEKDAYS) {
    if (t.includes(w)) {
      const target = WEEKDAY_INDEX[w];
      const currentDow = new Date(`${todayIso}T12:00:00`).getDay();
      let diff = target - currentDow;
      if (diff <= 0) diff += 7;
      return { dateIso: addDays(todayIso, diff), hour, minute };
    }
  }

  if (timeMatch) return { dateIso: todayIso, hour, minute };
  return null;
}

export function extractedDateTimeToUtcMs(dt: NonNullable<ExtractedDateTime>): number {
  return zonedWallTimeToUtcMs(dt.dateIso, dt.hour, dt.minute, "America/Sao_Paulo");
}

/** Nome próprio depois de "para X" — 1 a 3 palavras capitalizadas.
 * Heurística de linguagem natural em português, não garante acerto pra
 * frases fora do padrão dos exemplos do pedido. */
export function extractAssigneeName(rawText: string): string | null {
  const m = rawText.match(/\bpara\s+([A-ZÀ-Ú][\wÀ-ÿ]*(?:\s+[A-ZÀ-Ú][\wÀ-ÿ]*){0,2})/);
  if (!m) return null;
  // Evita capturar "para a campanha X"/"para o projeto X" como nome de pessoa.
  const candidate = m[1].trim();
  if (/^(a|o|as|os)\b/i.test(candidate)) return null;
  return candidate;
}

export function extractScopeName(
  rawText: string,
): { scope: "projeto" | "campanha"; name: string } | null {
  const campanha = rawText.match(/campanha\s+([A-ZÀ-Ú][\wÀ-ÿ]*(?:\s+[A-ZÀ-Ú][\wÀ-ÿ]*){0,3})/);
  if (campanha) return { scope: "campanha", name: campanha[1].trim() };
  const projeto = rawText.match(/projeto\s+([A-ZÀ-Ú][\wÀ-ÿ]*(?:\s+[A-ZÀ-Ú][\wÀ-ÿ]*){0,3})/);
  if (projeto) return { scope: "projeto", name: projeto[1].trim() };
  return null;
}

export function extractPriority(text: string): "Urgente" | "Alta" | "Normal" | "Baixa" | null {
  const t = norm(text);
  if (t.includes("urgente")) return "Urgente";
  if (t.includes("alta prioridade") || t.includes("prioridade alta")) return "Alta";
  if (t.includes("baixa prioridade") || t.includes("prioridade baixa")) return "Baixa";
  return null;
}

/** Título = a frase sem o prefixo de comando, sem o trecho "para X", sem
 * o trecho de escopo e sem o trecho de data/hora — o que sobrar é a
 * ação em si ("cobrar as métricas da campanha Jackery" vira só "cobrar
 * as métricas", já que a campanha some do resto do texto). Nunca fica
 * vazio: cai pro texto bruto se a extração não sobrar nada útil (nunca
 * silenciosamente cria uma tarefa "em branco"). */
export function extractTitle(rawText: string): string {
  let t = rawText
    .replace(/^(hypito,?\s*)/i, "")
    .replace(/\b(crie?|criar|cria)\s+(uma\s+)?(tarefa|lembrete)\b/i, "")
    .replace(/\bme\s+(lembre|avise)\s*(de)?/i, "")
    .replace(/\bpara\s+[A-ZÀ-Ú][\wÀ-ÿ]*(?:\s+[A-ZÀ-Ú][\wÀ-ÿ]*){0,2}/, "")
    .replace(/\b(da|do)\s+(campanha|projeto)\s+[A-ZÀ-Ú][\wÀ-ÿ]*(?:\s+[A-ZÀ-Ú][\wÀ-ÿ]*){0,3}/i, "")
    .replace(/\b(amanha|amanhã|hoje)\b/gi, "")
    .replace(new RegExp(`\\b(${WEEKDAYS.join("|")})(-feira)?\\b`, "gi"), "")
    .replace(/\bàs?\s*\d{1,2}[h:]\d{0,2}\b/gi, "")
    .replace(/\b\d{1,2}h\d{0,2}\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/[?.!]+$/g, "")
    .trim();
  t = t.replace(/^(de|que|pra)\s+/i, "").trim();
  if (!t) return rawText.trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}
