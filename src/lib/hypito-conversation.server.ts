/**
 * Motor da conversa do Hypito — orquestra as camadas descritas no pedido
 * (seção 2): classifica intenção (`hypito-nlu.ts`), extrai campos
 * (`hypito-extract.ts`), resolve entidades contra dados reais
 * (`hypito-tools.server.ts` + `hypito-entity-resolver.ts`), recupera e
 * persiste o contexto da conversa (`hypito-context.server.ts`), escolhe
 * a ferramenta certa, valida permissão (dentro de cada ferramenta) e só
 * então consulta ou prepara uma ação (`hypito-actions.server.ts`) —
 * nunca confirma uma mutação sozinho.
 *
 * Sempre no contexto do usuário autenticado da sessão real — nunca de
 * algo que o texto da mensagem afirma (pedido, seção 4: "o usuário nunca
 * deve conseguir ampliar seu acesso pedindo isso ao Hypito").
 *
 * Etapa determinística sempre primeiro (pedido, seção 5/11) — não há
 * integração de IA aprovada nesta plataforma (confirmado por busca em
 * todo o repo), então a "redação" também é por template aqui, não por
 * modelo.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { classify, parseIntent, resolveDateRange, type Intent } from "@/lib/hypito-nlu";
import { loadUserAccess, type UserAccess } from "@/lib/hypito-permissions.server";
import {
  getMyTasks,
  getOverdueTasks,
  getUpcomingTasks,
  getMyMeetings,
  getNextMeeting,
  getPendingApprovals,
  getPersonTasks,
  getScopedTasks,
  resolveCampaign,
  resolveProject,
  resolvePersonByName,
  summarizeScope,
  type TaskSummary,
  type MeetingSummary,
  type ScopeSummaryResult,
  type EntityLookup,
} from "@/lib/hypito-tools.server";
import {
  extractAssigneeName,
  extractBareEntityCandidate,
  extractDateTime,
  extractedDateTimeToUtcMs,
  extractPriority,
  extractScopeName,
  extractTitle,
} from "@/lib/hypito-extract";
import {
  createPendingAction,
  type TaskDraft as ActionTaskDraft,
} from "@/lib/hypito-actions.server";
import { fetchTeamDirectory } from "@/lib/hypito-data.server";
import {
  loadContext,
  saveContext,
  clearContext,
  type HypitoConversationState,
  type HypitoDraft,
  type PendingClarificationCandidate,
} from "@/lib/hypito-context.server";
import {
  resolveFollowUp,
  type ScoredCandidate,
  type EntityCandidate,
} from "@/lib/hypito-entity-resolver";
import { HypitoError, toSafeReply } from "@/lib/hypito-errors";

type DB = SupabaseClient<Database>;

export type ConversationReply = { text: string; pendingActionId?: string };

function fmtDate(iso?: string | null): string {
  if (!iso) return "sem prazo";
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}
function fmtTime(iso?: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}
function reply(text: string): ConversationReply {
  return { text };
}

function renderTaskList(result: { items: TaskSummary[]; total: number }, emptyMsg: string): string {
  if (result.items.length === 0) return emptyMsg;
  const lines = result.items.map((t) => `• ${t.title} — ${fmtDate(t.dueDateIso)} → ${t.link.href}`);
  const suffix =
    result.total > result.items.length
      ? `\n\n${result.total - result.items.length} outra(s) não mostrada(s).`
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

function renderScopeSummary(scopeLabel: string, s: ScopeSummaryResult): string {
  const parts: string[] = [];
  if (s.openTasks > 0)
    parts.push(
      `${s.openTasks} tarefa${s.openTasks === 1 ? "" : "s"} aberta${s.openTasks === 1 ? "" : "s"}`,
    );
  if (s.overdueTasks > 0)
    parts.push(`${s.overdueTasks} atrasada${s.overdueTasks === 1 ? "" : "s"}`);
  if (s.pendingApprovals > 0) parts.push(`${s.pendingApprovals} aguardando aprovação`);
  const body = parts.length > 0 ? parts.join(", ") : "sem tarefas em aberto no momento";
  const lines = [`Encontrei ${scopeLabel} ${s.name}. ${body}.`];
  if (s.nextDueTask) {
    lines.push(
      `Próxima entrega: "${s.nextDueTask.title}" em ${fmtDate(s.nextDueTask.dueDateIso)}.`,
    );
  }
  lines.push(`→ ${s.link.href}`);
  return lines.join("\n");
}

function renderClarificationQuestion(
  entityLabel: string,
  candidates: PendingClarificationCandidate[],
): string {
  if (candidates.length === 1) {
    return `Encontrei ${entityLabel} ${candidates[0].name}. É essa?`;
  }
  const names = candidates.map((c) => c.name).join(", ");
  return `Encontrei mais de uma opção parecida: ${names}. Qual delas?`;
}

function toCandidates<T extends EntityCandidate>(
  list: ScoredCandidate<T>[],
): PendingClarificationCandidate[] {
  return list.map((c) => ({ id: c.entity.id, name: c.entity.name, score: c.score }));
}

function draftSummaryText(draft: HypitoDraft): string {
  const lines = [
    "Criar tarefa",
    `Título: ${draft.title}`,
    `Responsável: ${draft.assigneeName ?? "não definido"}`,
    `Projeto/campanha: ${draft.scopeName ?? "sem projeto/campanha"}`,
    `Prazo: ${draft.dueAtIso ? `${fmtDate(draft.dueAtIso)} às ${fmtTime(draft.dueAtIso)}` : "sem prazo"}`,
    `Prioridade: ${draft.priority}`,
  ];
  return lines.join("\n");
}

function reminderSummaryText(title: string, remindAtIso: string): string {
  return [
    "Criar lembrete",
    `Título: ${title}`,
    `Quando: ${fmtDate(remindAtIso)} às ${fmtTime(remindAtIso)}`,
  ].join("\n");
}

function emptyDraft(kind: "create_task" | "create_reminder"): HypitoDraft {
  return {
    kind,
    title: null,
    assigneeName: null,
    assigneeId: null,
    scope: null,
    scopeId: null,
    scopeName: null,
    dueAtIso: null,
    priority: "Normal",
    askedAssigneeAndDate: false,
  };
}

/** Tenta resolver o nome de escopo (campanha/projeto) contra os dois
 * tipos quando não há palavra-gatilho explícita ("Cobrar as métricas da
 * Jackery") — pedido, seção 10, exemplo de continuação. Nunca decide
 * sozinho em caso de ambiguidade real entre TIPOS diferentes: prioriza
 * o resultado com maior confiança entre campanha e projeto. */
async function resolveBareScope(
  db: DB,
  access: UserAccess,
  name: string,
): Promise<{ scope: "campanha" | "projeto"; lookup: EntityLookup<EntityCandidate> } | null> {
  const [campaignLookup, projectLookup] = await Promise.all([
    resolveCampaign(db, access, name).catch(() => ({ kind: "not_found" as const })),
    resolveProject(db, access, name).catch(() => ({ kind: "not_found" as const })),
  ]);
  if (campaignLookup.kind === "not_found" && projectLookup.kind === "not_found") return null;
  if (campaignLookup.kind !== "not_found" && projectLookup.kind === "not_found") {
    return { scope: "campanha", lookup: campaignLookup };
  }
  if (projectLookup.kind !== "not_found" && campaignLookup.kind === "not_found") {
    return { scope: "projeto", lookup: projectLookup };
  }
  // Ambos bateram algo — prioriza o mais forte (resolvido > ambíguo).
  if (campaignLookup.kind === "resolved") return { scope: "campanha", lookup: campaignLookup };
  if (projectLookup.kind === "resolved") return { scope: "projeto", lookup: projectLookup };
  return { scope: "campanha", lookup: campaignLookup };
}

/** Extrai o que der pra extrair de `rawText` e aplica só nos campos
 * AINDA vazios do rascunho (nunca sobrescreve algo já preenchido numa
 * rodada anterior). */
async function enrichDraftFromText(
  db: DB,
  access: UserAccess,
  draft: HypitoDraft,
  rawText: string,
): Promise<void> {
  if (!draft.assigneeName) {
    const name = extractAssigneeName(rawText);
    if (name) draft.assigneeName = name;
  }
  if (!draft.scopeName) {
    const explicit = extractScopeName(rawText);
    if (explicit) {
      draft.scope = explicit.scope;
      draft.scopeName = explicit.name;
    } else {
      const bare = extractBareEntityCandidate(rawText);
      if (bare) {
        const resolved = await resolveBareScope(db, access, bare);
        if (resolved && resolved.lookup.kind === "resolved") {
          draft.scope = resolved.scope;
          draft.scopeId = resolved.lookup.entity.id;
          draft.scopeName = resolved.lookup.entity.name;
          if (draft.title) {
            const stripped = draft.title
              .replace(
                new RegExp(
                  `\\b(?:da|do|na|no)\\s+${bare.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`,
                  "i",
                ),
                "",
              )
              .trim();
            if (stripped) draft.title = stripped;
          }
        }
      }
    }
  }
  if (!draft.dueAtIso) {
    const dt = extractDateTime(rawText);
    if (dt) draft.dueAtIso = new Date(extractedDateTimeToUtcMs(dt)).toISOString();
  }
  const priority = extractPriority(rawText);
  if (priority) draft.priority = priority;
}

const SKIP_WORDS = [
  "sem prazo",
  "sem responsavel",
  "sem responsável",
  "ninguem",
  "ninguém",
  "nao sei",
  "não sei",
];

/** Continua um rascunho de tarefa/lembrete até ter o mínimo (só o
 * título é obrigatório — pedido, seção 10) ou até precisar perguntar
 * responsável/prazo UMA única vez. Nunca monta a confirmação sem
 * título real. */
async function advanceTaskDraft(
  db: DB,
  requesterId: string,
  access: UserAccess,
  draft: HypitoDraft,
  rawText: string,
): Promise<ConversationReply> {
  const skip = SKIP_WORDS.some((w) => rawText.toLowerCase().includes(w));

  if (!draft.title) {
    // NUNCA cai pro texto bruto do comando — se `extractTitle` não achou
    // nada de conteúdo real, pergunta em vez de usar o comando como
    // título (pedido, seção 3/10: "o comando nunca deve ser reutilizado
    // como conteúdo do campo solicitado").
    draft.title = extractTitle(rawText);
    if (!draft.title) {
      await saveContext(db, requesterId, stateWithDraft(draft, "title"));
      return reply("Claro. O que precisa ser feito?");
    }
  }

  await enrichDraftFromText(db, access, draft, rawText);

  // Resolve nomes pendentes contra dados reais.
  if (draft.assigneeName && !draft.assigneeId) {
    const lookup = await resolvePersonByName(db, draft.assigneeName);
    if (lookup.kind === "ambiguous") {
      const candidates = toCandidates(lookup.candidates);
      await saveContext(db, requesterId, {
        ...emptyStateBase(),
        draft,
        pendingClarification: {
          entityType: "pessoa",
          query: draft.assigneeName,
          candidates,
          forIntent: "task_assignee",
        },
      });
      return reply(renderClarificationQuestion("a pessoa", candidates));
    }
    if (lookup.kind === "resolved") {
      draft.assigneeId = lookup.entity.id;
      draft.assigneeName = lookup.entity.name;
    } else {
      // Nome dado mas não encontrado — segue sem travar (pedido: "sem
      // responsável" é permitido), avisando com transparência.
      draft.assigneeName = null;
    }
  }
  if (draft.scopeName && !draft.scopeId && draft.scope) {
    const lookup =
      draft.scope === "campanha"
        ? await resolveCampaign(db, access, draft.scopeName)
        : await resolveProject(db, access, draft.scopeName);
    if (lookup.kind === "ambiguous") {
      const candidates = toCandidates(lookup.candidates);
      await saveContext(db, requesterId, {
        ...emptyStateBase(),
        draft,
        pendingClarification: {
          entityType: draft.scope,
          query: draft.scopeName,
          candidates,
          forIntent: draft.scope === "campanha" ? "campaign_summary" : "project_summary",
        },
      });
      return reply(
        renderClarificationQuestion(
          draft.scope === "campanha" ? "a campanha" : "o projeto",
          candidates,
        ),
      );
    }
    if (lookup.kind === "resolved") {
      draft.scopeId = lookup.entity.id;
      draft.scopeName = lookup.entity.name;
    } else {
      draft.scope = null;
      draft.scopeName = null;
    }
  }

  if (!draft.assigneeId && !draft.dueAtIso && !draft.askedAssigneeAndDate && !skip) {
    draft.askedAssigneeAndDate = true;
    await saveContext(db, requesterId, stateWithDraft(draft, "assignee_and_date"));
    return reply("Para quem e para quando?");
  }

  // Pronto — grava a confirmação pendente e limpa o contexto (a ação
  // agora vive em `hypito_pending_actions`, não precisa mais do rascunho
  // em memória de conversa).
  const actionDraft: ActionTaskDraft = {
    title: draft.title,
    assigneeName: draft.assigneeName,
    assigneeId: draft.assigneeId,
    scope: draft.scope,
    scopeId: draft.scopeId,
    scopeName: draft.scopeName,
    dueAtIso: draft.dueAtIso,
    priority: draft.priority,
  };
  const pendingActionId = await createPendingAction(db, requesterId, "create_task", actionDraft);
  await clearContext(db, requesterId);
  return { text: draftSummaryText(draft), pendingActionId };
}

async function advanceReminderDraft(
  db: DB,
  requesterId: string,
  draft: { title: string | null; dueAtIso: string | null },
  rawText: string,
): Promise<ConversationReply> {
  if (!draft.title) {
    // Mesmo cuidado do rascunho de tarefa: nunca cai pro texto bruto do
    // comando quando não sobra conteúdo real.
    draft.title = extractTitle(rawText);
    if (!draft.title) {
      await saveContext(db, requesterId, {
        ...emptyStateBase(),
        draft: { ...emptyDraft("create_reminder"), title: null },
        awaitingField: "title",
      });
      return reply("Claro. Do que você quer que eu lembre?");
    }
  }
  if (!draft.dueAtIso) {
    const dt = extractDateTime(rawText);
    if (dt) draft.dueAtIso = new Date(extractedDateTimeToUtcMs(dt)).toISOString();
  }
  if (!draft.dueAtIso) {
    await saveContext(db, requesterId, {
      ...emptyStateBase(),
      draft: { ...emptyDraft("create_reminder"), title: draft.title },
      awaitingField: "assignee_and_date",
    });
    return reply("Para quando devo te avisar?");
  }

  const pendingActionId = await createPendingAction(db, requesterId, "create_reminder", {
    title: draft.title,
    remindAtIso: draft.dueAtIso,
    relatedKind: "none",
    relatedId: null,
    relatedLink: null,
  });
  await clearContext(db, requesterId);
  return { text: reminderSummaryText(draft.title, draft.dueAtIso), pendingActionId };
}

function emptyStateBase(): HypitoConversationState {
  return {
    lastIntent: null,
    lastEntity: null,
    pendingClarification: null,
    draft: null,
    awaitingField: null,
    updatedAt: new Date().toISOString(),
  };
}
function stateWithDraft(
  draft: HypitoDraft,
  awaitingField: "title" | "assignee_and_date",
): HypitoConversationState {
  return { ...emptyStateBase(), draft, awaitingField };
}

async function dispatchFreshIntent(
  db: DB,
  requesterId: string,
  access: UserAccess,
  myName: string,
  state: HypitoConversationState,
  intent: Intent,
  rawText: string,
): Promise<ConversationReply> {
  switch (intent.type) {
    case "greeting":
      return reply("Olá! Pode me perguntar sobre tarefas, agenda, projetos ou campanhas.");

    case "help":
      return reply(
        'Posso consultar suas tarefas, agenda, projetos e campanhas, e ajudar a criar tarefas e lembretes. É só perguntar, por exemplo: "o que tenho para hoje?" ou "criar uma tarefa".',
      );

    case "cancel":
      return reply("Não tem nada pendente pra cancelar agora.");

    case "my_tasks": {
      const range = resolveDateRange(intent.range);
      const result = await getMyTasks(db, access, myName, range ?? undefined);
      return reply(renderTaskList(result, "Nada pendente por aqui. Bom trabalho."));
    }

    case "overdue_tasks": {
      if (state.lastEntity) {
        const result = await getScopedTasks(
          db,
          state.lastEntity.type,
          state.lastEntity.id,
          "overdue",
        );
        return reply(
          renderTaskList(result, `Nenhuma tarefa atrasada em ${state.lastEntity.name}.`),
        );
      }
      const result = await getOverdueTasks(db, access, myName);
      return reply(renderTaskList(result, "Nenhuma tarefa atrasada. 🎉"));
    }

    case "upcoming_tasks": {
      if (state.lastEntity) {
        const result = await getScopedTasks(
          db,
          state.lastEntity.type,
          state.lastEntity.id,
          "upcoming",
        );
        return reply(
          renderTaskList(result, `Nada vencendo nos próximos dias em ${state.lastEntity.name}.`),
        );
      }
      const result = await getUpcomingTasks(db, access, myName, intent.days);
      return reply(renderTaskList(result, "Nada vencendo nos próximos dias."));
    }

    case "pending_approvals": {
      if (state.lastEntity) {
        const result = await getScopedTasks(
          db,
          state.lastEntity.type,
          state.lastEntity.id,
          "pending_approval",
        );
        return reply(
          renderTaskList(result, `Sem aprovações pendentes em ${state.lastEntity.name}.`),
        );
      }
      const result = await getPendingApprovals(db, access, myName);
      return reply(renderTaskList(result, "Sem aprovações aguardando você."));
    }

    case "next_meeting": {
      const meeting = await getNextMeeting(db, access, requesterId);
      if (!meeting) return reply("Não encontrei nenhuma reunião futura na sua agenda.");
      return reply(
        `Sua próxima reunião: ${meeting.titulo} em ${fmtDate(meeting.whenIso)} às ${fmtTime(meeting.whenIso)} → ${meeting.link.href}`,
      );
    }

    case "my_meetings": {
      const range = resolveDateRange(intent.range) ?? undefined;
      const result = await getMyMeetings(db, access, requesterId, range);
      return reply(renderMeetingList(result, "Nenhuma reunião encontrada nesse período."));
    }

    case "project_summary":
    case "campaign_summary": {
      const scope = intent.type === "project_summary" ? "projeto" : "campanha";
      const query = intent.type === "project_summary" ? intent.query : intent.query;
      const lookup =
        scope === "projeto"
          ? await resolveProject(db, access, query)
          : await resolveCampaign(db, access, query);
      if (lookup.kind === "not_found") {
        return reply(
          `Não encontrei ${scope === "projeto" ? "um projeto chamado" : "uma campanha chamada"} "${query}". Quer tentar com outro nome?`,
        );
      }
      if (lookup.kind === "ambiguous") {
        const candidates = toCandidates(lookup.candidates);
        await saveContext(db, requesterId, {
          ...emptyStateBase(),
          pendingClarification: {
            entityType: scope,
            query,
            candidates,
            forIntent: scope === "projeto" ? "project_summary" : "campaign_summary",
          },
        });
        return reply(
          renderClarificationQuestion(scope === "projeto" ? "o projeto" : "a campanha", candidates),
        );
      }
      const summary = await summarizeScope(db, scope, lookup.entity);
      await saveContext(db, requesterId, {
        ...emptyStateBase(),
        lastEntity: { type: scope, id: summary.id, name: summary.name },
        lastIntent: intent.type,
      });
      return reply(renderScopeSummary(scope === "projeto" ? "o projeto" : "a campanha", summary));
    }

    case "campaigns_attention":
      return reply(
        "Ainda não consigo consolidar quais campanhas precisam de atenção nesta versão — posso resumir uma campanha específica se você me disser o nome.",
      );

    case "person_tasks": {
      const lookup = await resolvePersonByName(db, intent.personQuery);
      if (lookup.kind === "not_found")
        return reply(`Não encontrei "${intent.personQuery}" no time.`);
      if (lookup.kind === "ambiguous") {
        const candidates = toCandidates(lookup.candidates);
        await saveContext(db, requesterId, {
          ...emptyStateBase(),
          pendingClarification: {
            entityType: "pessoa",
            query: intent.personQuery,
            candidates,
            forIntent: "person_tasks",
          },
        });
        return reply(renderClarificationQuestion("a pessoa", candidates));
      }
      const result = await getPersonTasks(db, access, lookup.entity.name);
      return reply(renderTaskList(result, `${lookup.entity.name} não tem tarefas em aberto.`));
    }

    case "create_task":
      return advanceTaskDraft(db, requesterId, access, emptyDraft("create_task"), intent.raw);

    case "create_reminder":
      return advanceReminderDraft(db, requesterId, { title: null, dueAtIso: null }, intent.raw);

    case "unknown":
    default:
      return reply(
        'Não entendi. Tente algo como "o que tenho para hoje?", "quais tarefas estão atrasadas?" ou "criar uma tarefa".',
      );
  }
}

async function continueClarification(
  db: DB,
  requesterId: string,
  access: UserAccess,
  state: HypitoConversationState,
  rawText: string,
): Promise<ConversationReply> {
  const pc = state.pendingClarification!;
  const scored: ScoredCandidate<EntityCandidate>[] = pc.candidates.map((c) => ({
    entity: { id: c.id, name: c.name },
    score: c.score,
    reasons: [],
  }));
  const resolved = resolveFollowUp(rawText, scored);

  if (resolved === "ambiguous") {
    return reply("Ainda não consegui identificar qual das opções — pode escrever o nome completo?");
  }
  if (!resolved) {
    await clearContext(db, requesterId);
    return reply("Sem problema. Em que mais posso ajudar?");
  }

  switch (pc.forIntent) {
    case "campaign_summary":
    case "project_summary": {
      const scope = pc.forIntent === "campaign_summary" ? "campanha" : "projeto";
      const summary = await summarizeScope(db, scope, resolved);
      await saveContext(db, requesterId, {
        ...emptyStateBase(),
        lastEntity: { type: scope, id: resolved.id, name: resolved.name },
        lastIntent: pc.forIntent,
      });
      return reply(renderScopeSummary(scope === "projeto" ? "o projeto" : "a campanha", summary));
    }
    case "person_tasks": {
      const result = await getPersonTasks(db, access, resolved.name);
      await clearContext(db, requesterId);
      return reply(renderTaskList(result, `${resolved.name} não tem tarefas em aberto.`));
    }
    case "task_assignee": {
      const draft = state.draft ?? emptyDraft("create_task");
      draft.assigneeId = resolved.id;
      draft.assigneeName = resolved.name;
      return advanceTaskDraft(db, requesterId, access, draft, "");
    }
  }
}

async function continueDraft(
  db: DB,
  requesterId: string,
  access: UserAccess,
  state: HypitoConversationState,
  rawText: string,
): Promise<ConversationReply> {
  const draft = state.draft ?? emptyDraft("create_task");
  if (draft.kind === "create_reminder") {
    return advanceReminderDraft(
      db,
      requesterId,
      { title: draft.title, dueAtIso: draft.dueAtIso },
      rawText,
    );
  }
  return advanceTaskDraft(db, requesterId, access, draft, rawText);
}

/** Ponto único de entrada — usado por `hypito-chat.functions.ts`
 * (mensagem digitada). Sempre no contexto do `requesterId` real da
 * sessão autenticada. */
export async function handleUserMessage(
  db: DB,
  requesterId: string,
  rawText: string,
): Promise<ConversationReply> {
  try {
    const access = await loadUserAccess(db, requesterId);
    const people = await fetchTeamDirectory(db);
    const me = people.find((p) => p.id === requesterId);
    const myName = me?.name ?? "";

    const state = await loadContext(db, requesterId);

    // Cancelamento explícito sempre vence, seja qual for o estado
    // (pedido, seção 7: "cancelar contexto pendente quando o usuário
    // pedir" — nunca só por tempo ou automaticamente).
    if (parseIntent(rawText).type === "cancel" && (state.pendingClarification || state.draft)) {
      await clearContext(db, requesterId);
      return reply("Ok, cancelei. Em que mais posso ajudar?");
    }

    if (state.awaitingField && state.draft) {
      return await continueDraft(db, requesterId, access, state, rawText);
    }
    if (state.pendingClarification) {
      return await continueClarification(db, requesterId, access, state, rawText);
    }

    const { intent } = classify(rawText);
    return await dispatchFreshIntent(db, requesterId, access, myName, state, intent, rawText);
  } catch (err) {
    if (err instanceof HypitoError) return reply(err.message);
    return reply(toSafeReply("handleUserMessage", err, { requesterId }));
  }
}
