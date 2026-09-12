/**
 * Motor de conteúdo do relatório semanal do Hypito — 100% determinístico
 * (sem IA: o projeto não tem nenhuma integração de LLM aprovada hoje, ver
 * `hypito-weekly-report.server.ts`), puro (sem Supabase, sem I/O), então
 * totalmente testável com dados sintéticos.
 *
 * Regra de segurança (pedido, seção 8): o Hypito nunca compara pessoas,
 * nunca ranqueia, nunca julga. Cada `PersonEvidence` gera NO MÁXIMO um
 * insight, escolhido por prioridade de evidência (risco > aprovação
 * pendente > próxima ação > reconhecimento > neutro) — nunca por volume
 * de tarefas isolado, nunca citando outra pessoa.
 */
import type { ChatMention } from "@/lib/chat-store";

export type LinkedRef = { label: string; href: string };

export type RiskItem = {
  title: string;
  detail?: string;
  dueDateIso?: string;
  responsibleName?: string;
  link?: LinkedRef;
};

export type NextWeekItem = {
  title: string;
  whenLabel: string;
  link?: LinkedRef;
};

export type TaskRef = { title: string; dueDateIso?: string; link?: LinkedRef };

export type PersonEvidence = {
  userId: string;
  name: string;
  completedThisWeek: TaskRef[];
  overdueOpen: TaskRef[];
  dueNext7Days: TaskRef[];
  awaitingApproval: TaskRef[];
};

export type WeeklyReportMetrics = {
  tasksCompleted: number;
  tasksCreated: number;
  tasksOpen: number;
  tasksOverdue: number;
  meetingsHeld: number;
};

export type WeeklyReportData = {
  weekStartIso: string;
  weekLabelPt: string;
  generatedAtIso: string;
  metrics: WeeklyReportMetrics;
  highlights: string[];
  risks: RiskItem[];
  nextWeek: NextWeekItem[];
  people: PersonEvidence[];
  /** Nomes de fontes que não puderam ser consolidadas nesta execução —
   * nunca preenchidas com zero/inventado, o bloco correspondente some ou
   * fica marcado como indisponível (pedido, seção 16). */
  unavailableSources: string[];
};

const NEUTRAL_FALLBACK = "Sem pendências críticas identificadas para a próxima semana.";

/** Frases proibidas — nunca devem aparecer em nenhum texto gerado.
 * Usado tanto como referência de redação quanto em teste automatizado
 * (`hypito-insights.test.ts`) que varre toda saída gerada. */
export const FORBIDDEN_INSIGHT_PATTERNS: RegExp[] = [
  /produziu menos/i,
  /prejudicando o time/i,
  /prejudica(ndo)? a equipe/i,
  /est[áa] prejudicando/i,
  /menos produtiv[oa]/i,
  /mais produtiv[oa]/i,
  /melhor (que|do que)/i,
  /pior (que|do que)/i,
  /comparad[oa] (a|com)/i,
  /ranking/i,
  /em \d+[ºo°] lugar/i,
  /culpa de/i,
  /respons[aá]vel pelo atraso/i,
  /n[aã]o (fez|entregou|cumpriu) (nada|o suficiente)/i,
];

function formatDatePt(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long" });
}

/** Um insight por pessoa, escolhido por prioridade de evidência — nunca
 * por contagem bruta de tarefas isolada (pedido: "recomendações baseadas
 * apenas em volume de tarefas" é proibido). Reconhece avanço quando
 * relevante, mas a AÇÃO sugerida sempre vem do que está em aberto, não
 * do que já foi feito. */
export function generateInsightText(p: PersonEvidence): string {
  if (p.overdueOpen.length > 0) {
    const first = p.overdueOpen[0];
    const countLabel =
      p.overdueOpen.length === 1
        ? "1 tarefa em atraso"
        : `${p.overdueOpen.length} tarefas em atraso`;
    return `Atenção ao prazo: existe(m) ${countLabel}, incluindo "${first.title}". Priorizá-la(s) pode reduzir o risco de atraso em cadeia.`;
  }
  if (p.awaitingApproval.length > 0) {
    const first = p.awaitingApproval[0];
    const countLabel =
      p.awaitingApproval.length === 1 ? "1 pendência" : `${p.awaitingApproval.length} pendências`;
    return `Existe(m) ${countLabel} aguardando aprovação, incluindo "${first.title}". Resolvê-la(s) pode destravar a entrega relacionada.`;
  }
  if (p.dueNext7Days.length > 0) {
    const first = p.dueNext7Days[0];
    const when = first.dueDateIso ? formatDatePt(first.dueDateIso) : "em breve";
    const ack =
      p.completedThisWeek.length > 0
        ? `Bom avanço nesta semana (${p.completedThisWeek.length} conclu${p.completedThisWeek.length === 1 ? "ída" : "ídas"}). `
        : "";
    return `${ack}A próxima ação sugerida é avançar em "${first.title}", com prazo em ${when}.`;
  }
  if (p.completedThisWeek.length > 0) {
    const n = p.completedThisWeek.length;
    return `Bom avanço em ${n} tarefa${n === 1 ? "" : "s"} concluída${n === 1 ? "" : "s"} nesta semana. ${NEUTRAL_FALLBACK}`;
  }
  return NEUTRAL_FALLBACK;
}

function bulletList(lines: string[]): string {
  return lines.map((l) => `• ${l}`).join("\n");
}

function riskLine(r: RiskItem): string {
  const parts = [r.title];
  if (r.detail) parts.push(r.detail);
  if (r.dueDateIso) parts.push(`prazo: ${formatDatePt(r.dueDateIso)}`);
  if (r.responsibleName) parts.push(`responsável: ${r.responsibleName}`);
  const linkSuffix = r.link ? ` → ${r.link.href}` : "";
  return `${parts.join(" — ")}${linkSuffix}`;
}

function nextWeekLine(n: NextWeekItem): string {
  const linkSuffix = n.link ? ` → ${n.link.href}` : "";
  return `${n.title} (${n.whenLabel})${linkSuffix}`;
}

/** Rotação fixa de encerramentos — a escolha é determinística (derivada
 * de `weekStartIso`), não aleatória: reprocessar a mesma semana (retry)
 * produz sempre o mesmo texto, requisito de idempotência. */
const CLOSINGS = [
  "Boa semana pra todo mundo! Qualquer dúvida sobre os números, é só chamar.",
  "Seguimos por aqui torcendo pelas entregas da semana. Até a próxima sexta!",
  "Obrigado pelo esforço desta semana — qualquer ajuste no relatório, me avisem.",
  "Bom fim de semana, time! Nos vemos no próximo resumo.",
];

function pickClosing(weekStartIso: string): string {
  let hash = 0;
  for (let i = 0; i < weekStartIso.length; i++) hash = (hash * 31 + weekStartIso.charCodeAt(i)) | 0;
  const idx = Math.abs(hash) % CLOSINGS.length;
  return CLOSINGS[idx];
}

export type RenderedReport = { text: string; mentions: ChatMention[] };

/**
 * Monta o texto final + a lista de `ChatMention`s. Só a seção "Insights
 * do time" gera menções reais (`@Nome`) — outras seções citam nome em
 * texto simples, pra nunca duplicar notificação da mesma pessoa por dois
 * lugares diferentes da mesma mensagem (pedido: no máximo uma notificação
 * por pessoa por relatório).
 */
export function renderWeeklyReportMessage(
  data: WeeklyReportData,
  opts: { mentionUsers: boolean } = { mentionUsers: true },
): RenderedReport {
  const lines: string[] = [];

  lines.push(
    `Boa tarde, time! Aqui é o Hypito 👋 Separei o resumo da nossa semana (${data.weekLabelPt}).`,
  );
  lines.push("");

  lines.push("📊 Resumo da semana");
  const resumo: string[] = [];
  if (data.metrics.tasksCompleted > 0)
    resumo.push(`${data.metrics.tasksCompleted} tarefas concluídas`);
  if (data.metrics.meetingsHeld > 0)
    resumo.push(`${data.metrics.meetingsHeld} reuniões realizadas`);
  if (data.metrics.tasksCreated > 0)
    resumo.push(`${data.metrics.tasksCreated} tarefas novas criadas`);
  if (resumo.length === 0) {
    lines.push("Nenhuma movimentação importante foi identificada nesta semana.");
  } else {
    lines.push(bulletList(resumo));
  }
  lines.push("");

  if (data.highlights.length > 0) {
    lines.push("✅ Destaques");
    lines.push(bulletList(data.highlights.slice(0, 3)));
    lines.push("");
  }

  if (data.risks.length > 0) {
    lines.push("⚠️ Pontos de atenção");
    lines.push(bulletList(data.risks.slice(0, 3).map(riskLine)));
    lines.push("");
  }

  if (data.nextWeek.length > 0) {
    lines.push("📅 Próxima semana");
    lines.push(bulletList(data.nextWeek.map(nextWeekLine)));
    lines.push("");
  }

  const mentions: ChatMention[] = [];
  const peopleWithSomethingToSay = data.people;
  if (peopleWithSomethingToSay.length > 0) {
    lines.push("💡 Insights do time");
    const seenUserIds = new Set<string>();
    for (const person of peopleWithSomethingToSay) {
      if (seenUserIds.has(person.userId)) continue; // nunca duplica menção da mesma pessoa
      seenUserIds.add(person.userId);
      const insight = generateInsightText(person);
      if (opts.mentionUsers) {
        lines.push(`@${person.name} — ${insight}`);
        mentions.push({ kind: "user", id: person.userId, label: person.name });
      } else {
        lines.push(`${person.name} — ${insight}`);
      }
    }
    lines.push("");
  }

  if (data.unavailableSources.length > 0) {
    lines.push(`(Fontes não consolidadas nesta execução: ${data.unavailableSources.join(", ")}.)`);
    lines.push("");
  }

  lines.push(pickClosing(data.weekStartIso));

  return { text: lines.join("\n").trim(), mentions };
}
