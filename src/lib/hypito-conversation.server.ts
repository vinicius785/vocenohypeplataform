/**
 * Motor da conversa do Hypito — recebe o texto de UM usuário autenticado
 * (nunca confia em nada além do `userId` real da sessão pra permissão),
 * interpreta a intenção (`hypito-nlu.ts`, determinístico), despacha pra
 * uma ferramenta de consulta (`hypito-tools.server.ts`) ou pra uma
 * preparação de ação (`hypito-actions.server.ts`), e devolve o texto de
 * resposta + (quando aplicável) o id da confirmação pendente pra anexar
 * na mensagem.
 *
 * Etapa determinística SEMPRE primeiro (pedido, seção 11) — não há
 * integração de IA aprovada nesta plataforma, então a "redação" também é
 * por template aqui, não por modelo.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { parseIntent, resolveDateRange } from "@/lib/hypito-nlu";
import { loadUserAccess } from "@/lib/hypito-permissions.server";
import {
  getMyTasks,
  getOverdueTasks,
  getUpcomingTasks,
  getMyMeetings,
  getNextMeeting,
  getPendingApprovals,
  getPersonTasks,
  getProjectSummary,
  getCampaignSummary,
  resolvePersonByName,
  type TaskSummary,
  type MeetingSummary,
} from "@/lib/hypito-tools.server";
import { prepareTaskCreation, prepareReminderCreation } from "@/lib/hypito-actions.server";
import { fetchTeamDirectory } from "@/lib/hypito-data.server";

type DB = SupabaseClient<Database>;

export type ConversationReply = { text: string; pendingActionId?: string };

function fmtDate(iso?: string): string {
  if (!iso) return "sem prazo";
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}
function fmtTime(iso?: string): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function renderTaskList(result: { items: TaskSummary[]; total: number }, emptyMsg: string): string {
  if (result.items.length === 0) return emptyMsg;
  const lines = result.items.map((t) => `• ${t.title} — ${fmtDate(t.dueDateIso)} → ${t.link.href}`);
  const suffix =
    result.total > result.items.length
      ? `\n\n${result.total - result.items.length} outra(s) não mostrada(s) — "Ver todas" em breve.`
      : "";
  return `Encontrei ${result.total}:\n${lines.join("\n")}${suffix}`;
}

function renderMeetingList(
  result: { items: MeetingSummary[]; total: number },
  emptyMsg: string,
): string {
  if (result.items.length === 0) return emptyMsg;
  const lines = result.items.map(
    (m) => `• ${m.titulo} — ${fmtDate(m.whenIso)} às ${fmtTime(m.whenIso)} → ${m.link.href}`,
  );
  return `Encontrei ${result.total}:\n${lines.join("\n")}`;
}

/** Ponto único de entrada — usado por `hypito-chat.functions.ts`
 * (mensagem digitada) e reaproveitável por qualquer outro gatilho futuro
 * que precise da mesma interpretação. */
export async function handleUserMessage(
  db: DB,
  requesterId: string,
  rawText: string,
): Promise<ConversationReply> {
  const access = await loadUserAccess(db, requesterId);
  const people = await fetchTeamDirectory(db);
  const me = people.find((p) => p.id === requesterId);
  const myName = me?.name ?? "";

  const intent = parseIntent(rawText);

  try {
    switch (intent.type) {
      case "greeting":
        return { text: "Olá! Pode me perguntar sobre tarefas, agenda, projetos ou campanhas." };

      case "my_tasks": {
        const range = resolveDateRange(intent.range);
        const result = await getMyTasks(db, access, myName, range ?? undefined);
        return { text: renderTaskList(result, "Nada pendente por aqui. Bom trabalho.") };
      }

      case "overdue_tasks": {
        const result = await getOverdueTasks(db, access, myName);
        return { text: renderTaskList(result, "Nenhuma tarefa atrasada. 🎉") };
      }

      case "upcoming_tasks": {
        const result = await getUpcomingTasks(db, access, myName, intent.days);
        return { text: renderTaskList(result, "Nada vencendo nos próximos dias.") };
      }

      case "pending_approvals": {
        const result = await getPendingApprovals(db, access, myName);
        return { text: renderTaskList(result, "Sem aprovações aguardando você.") };
      }

      case "next_meeting": {
        const meeting = await getNextMeeting(db, access, requesterId);
        if (!meeting) return { text: "Não encontrei nenhuma reunião futura na sua agenda." };
        return {
          text: `Sua próxima reunião: ${meeting.titulo} em ${fmtDate(meeting.whenIso)} às ${fmtTime(meeting.whenIso)} → ${meeting.link.href}`,
        };
      }

      case "my_meetings": {
        const range = resolveDateRange(intent.range) ?? undefined;
        const result = await getMyMeetings(db, access, requesterId, range);
        return { text: renderMeetingList(result, "Nenhuma reunião encontrada nesse período.") };
      }

      case "project_summary": {
        const summary = await getProjectSummary(db, access, intent.query);
        if (!summary) return { text: `Não encontrei um projeto chamado "${intent.query}".` };
        return {
          text: `${summary.name}: ${summary.openTasks} tarefas abertas, ${summary.overdueTasks} atrasadas, ${summary.completedTasks} concluídas → ${summary.link.href}`,
        };
      }

      case "campaign_summary": {
        const summary = await getCampaignSummary(db, access, intent.query);
        if (!summary) return { text: `Não encontrei uma campanha chamada "${intent.query}".` };
        return {
          text: `${summary.name}: ${summary.openTasks} tarefas abertas, ${summary.overdueTasks} atrasadas, ${summary.completedTasks} concluídas → ${summary.link.href}`,
        };
      }

      case "campaigns_attention":
        return {
          text: "Ainda não consigo consolidar quais campanhas precisam de atenção nesta primeira versão — posso resumir uma campanha específica se você me disser o nome.",
        };

      case "person_tasks": {
        const person = await resolvePersonByName(db, intent.personQuery);
        if (person === "ambiguous") {
          return {
            text: `Existe mais de uma pessoa chamada "${intent.personQuery}" — pode informar o nome completo?`,
          };
        }
        if (!person) return { text: `Não encontrei "${intent.personQuery}" no time.` };
        const result = await getPersonTasks(db, access, person.name);
        return { text: renderTaskList(result, `${person.name} não tem tarefas em aberto.`) };
      }

      case "create_task": {
        const { pendingActionId, draft } = await prepareTaskCreation(
          db,
          access,
          requesterId,
          intent.raw,
        );
        const lines = [
          "Criar tarefa",
          `Título: ${draft.title}`,
          `Responsável: ${draft.assigneeName ?? "não definido"}`,
          `Projeto/campanha: ${draft.scopeName ?? "não definido"}`,
          `Prazo: ${draft.dueAtIso ? `${fmtDate(draft.dueAtIso)} às ${fmtTime(draft.dueAtIso)}` : "sem prazo"}`,
          `Prioridade: ${draft.priority}`,
        ];
        if (draft.warnings.length > 0) lines.push("", ...draft.warnings.map((w) => `⚠️ ${w}`));
        lines.push("", "Confirmar criação | Editar | Cancelar");
        return { text: lines.join("\n"), pendingActionId };
      }

      case "create_reminder": {
        const { pendingActionId, draft } = await prepareReminderCreation(
          db,
          requesterId,
          intent.raw,
        );
        const lines = [
          "Criar lembrete",
          `Título: ${draft.title}`,
          `Quando: ${draft.remindAtIso ? `${fmtDate(draft.remindAtIso)} às ${fmtTime(draft.remindAtIso)}` : "não definido"}`,
        ];
        if (draft.warnings.length > 0) lines.push("", ...draft.warnings.map((w) => `⚠️ ${w}`));
        lines.push("", "Confirmar lembrete | Editar | Cancelar");
        return { text: lines.join("\n"), pendingActionId };
      }

      case "unknown":
      default:
        return {
          text: 'Não entendi. Tente algo como "o que tenho para hoje?", "quais tarefas estão atrasadas?" ou "criar uma tarefa".',
        };
    }
  } catch (err) {
    // Erros de PERMISSÃO são seguros de mostrar (é exatamente o que a
    // pessoa precisa saber). Qualquer outro erro (schema, conexão, bug)
    // fica só no log do servidor — nunca repassado cru pro chat (pedido,
    // seção 22: "não registrar/expor conteúdo interno desnecessário").
    const message = err instanceof Error ? err.message : String(err);
    if (message.toLowerCase().includes("permissão")) return { text: message };
    console.error("[hypito] falha ao processar mensagem", err);
    return { text: "Não consegui processar essa consulta agora. Tente novamente em instantes." };
  }
}
