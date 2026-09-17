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
 * Toda resposta é um `HypitoMessage` estruturado (`hypito-messages.ts`)
 * — nunca HTML/JSX/rota crua. O `textFallback` de cada payload é sempre
 * um resumo legível equivalente, usado pra busca/notificações/histórico/
 * clientes antigos e como rede de segurança se o payload não for
 * reconhecido pelo frontend.
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
  listAssigneeCandidates,
  listScopeCandidates,
  type TaskSummary,
  type MeetingSummary,
  type ScopeSummaryResult,
  type ListResult,
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
import {
  HYPITO_MESSAGE_VERSION,
  type HypitoMessage,
  type HypitoEntityRef,
  type HypitoAction,
  type TaskListItem,
} from "@/lib/hypito-messages";

type DB = SupabaseClient<Database>;

export type ConversationReply = { payload: HypitoMessage };

function fmtDate(iso?: string | null): string {
  if (!iso) return "sem prazo";
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}
function fmtTime(iso?: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}
function nowIso(): string {
  return new Date().toISOString();
}

function textMessage(text: string): ConversationReply {
  return {
    payload: {
      version: HYPITO_MESSAGE_VERSION,
      kind: "text",
      textFallback: text,
      state: "default",
      timestamp: nowIso(),
      actions: [],
    },
  };
}

function taskRef(t: TaskSummary): HypitoEntityRef {
  return {
    type: "task",
    id: t.id,
    name: t.title,
    meta: { scope: t.scope, scopeId: t.scopeId ?? null },
  };
}

function scopeRef(scope: "projeto" | "campanha", id: string, name: string): HypitoEntityRef {
  return { type: scope === "projeto" ? "project" : "campaign", id, name };
}

/** Card de lista de tarefas (pedido, seção 15) — nunca uma bolha por
 * tarefa. `viewAllAction`, quando presente, é a única forma de "ver
 * mais" (sempre uma entidade real — campanha/projeto —, nunca uma rota
 * de filtro inventada que não existe hoje na plataforma). */
function taskListMessage(
  result: ListResult<TaskSummary>,
  title: string,
  emptyMessage: string,
  viewAllAction?: HypitoAction,
): ConversationReply {
  if (result.items.length === 0) return textMessage(emptyMessage);
  const items: TaskListItem[] = result.items.map((t) => ({
    task: taskRef(t),
    status: t.status,
    dueDateIso: t.dueDateIso,
    priority: t.priority,
    assignees: t.assignees,
  }));
  const lines = result.items.map((t) => `• ${t.title} — ${fmtDate(t.dueDateIso)}`);
  const suffix =
    result.total > result.items.length
      ? `\n\n${result.total - result.items.length} outra(s) não mostrada(s).`
      : "";
  const textFallback = `${title}\n${lines.join("\n")}${suffix}`;
  const actions: HypitoAction[] = [];
  if (viewAllAction && result.total > result.items.length) actions.push(viewAllAction);
  return {
    payload: {
      version: HYPITO_MESSAGE_VERSION,
      kind: "task_list",
      title,
      textFallback,
      state: "default",
      timestamp: nowIso(),
      actions,
      data: { items, total: result.total, emptyMessage },
    },
  };
}

function agendaMessage(
  result: ListResult<MeetingSummary>,
  periodLabel: string,
  emptyMessage: string,
): ConversationReply {
  if (result.items.length === 0) return textMessage(emptyMessage);
  const byDay = new Map<string, MeetingSummary[]>();
  for (const m of result.items) {
    if (!m.whenIso) continue;
    const dateIso = m.whenIso.slice(0, 10);
    const list = byDay.get(dateIso) ?? [];
    list.push(m);
    byDay.set(dateIso, list);
  }
  const dayKeys = [...byDay.keys()].sort();
  const groups = dayKeys.map((dateIso) => {
    const items = (byDay.get(dateIso) ?? []).sort((a, b) =>
      (a.whenIso ?? "").localeCompare(b.whenIso ?? ""),
    );
    const label = new Date(`${dateIso}T12:00:00`).toLocaleDateString("pt-BR", {
      weekday: "long",
      day: "2-digit",
      month: "long",
    });
    return {
      dateIso,
      label: label.charAt(0).toUpperCase() + label.slice(1),
      items: items.map((m) => ({
        meeting: { type: "meeting" as const, id: m.id, name: m.titulo },
        whenIso: m.whenIso!,
        durationMin: m.durationMin,
        hasLink: Boolean(m.local && /^https?:\/\//i.test(m.local)),
      })),
    };
  });
  const textLines = groups.flatMap((g) => [
    g.label,
    ...g.items.map((it) => `${fmtTime(it.whenIso)} — ${it.meeting.name}`),
  ]);
  const suffix =
    result.total > result.items.length
      ? `\n\n${result.total - result.items.length} outra(s) não mostrada(s).`
      : "";
  const textFallback = `${periodLabel}\n${result.total} compromisso(s) encontrado(s)\n${textLines.join("\n")}${suffix}`;
  const actions: HypitoAction[] =
    result.total > result.items.length
      ? [{ id: "open_agenda", label: "Abrir agenda completa", variant: "link" }]
      : [];
  return {
    payload: {
      version: HYPITO_MESSAGE_VERSION,
      kind: "agenda_summary",
      title: periodLabel,
      textFallback,
      state: "default",
      timestamp: nowIso(),
      actions,
      data: { periodLabel, total: result.total, groups },
    },
  };
}

function scopeSummaryMessage(
  scope: "projeto" | "campanha",
  s: ScopeSummaryResult,
): ConversationReply {
  const scopeLabel = scope === "projeto" ? "o projeto" : "a campanha";
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
  const attentionNote =
    s.pendingApprovals > 0 ? `${s.pendingApprovals} conteúdo(s) aguardam aprovação.` : null;
  const entity = scopeRef(scope, s.id, s.name);
  const actions: HypitoAction[] = [
    {
      id: scope === "projeto" ? "open_project" : "open_campaign",
      label: scope === "projeto" ? "Abrir projeto" : "Abrir campanha",
      variant: "primary",
      entity,
    },
  ];
  return {
    payload: {
      version: HYPITO_MESSAGE_VERSION,
      kind: scope === "projeto" ? "project_summary" : "campaign_summary",
      title: s.name,
      textFallback: lines.join("\n"),
      state: "default",
      timestamp: nowIso(),
      actions,
      data: {
        entity,
        openTasks: s.openTasks,
        overdueTasks: s.overdueTasks,
        pendingApprovals: s.pendingApprovals,
        nextDueTask: s.nextDueTask
          ? {
              title: s.nextDueTask.title,
              dueDateIso: s.nextDueTask.dueDateIso,
              task: {
                type: "task",
                id: s.nextDueTask.id,
                name: s.nextDueTask.title,
                meta: { scope, scopeId: s.id },
              },
            }
          : null,
        attentionNote,
      },
    },
  };
}

function entityChoiceMessage(
  entityType: "campanha" | "projeto" | "pessoa",
  query: string,
  candidates: PendingClarificationCandidate[],
): ConversationReply {
  const typeMap = { campanha: "campaign", projeto: "project", pessoa: "user" } as const;
  const label = { campanha: "a campanha", projeto: "o projeto", pessoa: "a pessoa" }[entityType];
  const textFallback =
    candidates.length === 1
      ? `Encontrei ${label} ${candidates[0].name}. É essa?`
      : `Encontrei mais de uma opção parecida: ${candidates.map((c) => c.name).join(", ")}. Qual delas?`;
  return {
    payload: {
      version: HYPITO_MESSAGE_VERSION,
      kind: "entity_choice",
      textFallback,
      state: "default",
      timestamp: nowIso(),
      actions: [],
      data: {
        entityType: typeMap[entityType],
        query,
        options: candidates.map((c) => ({
          ref: { type: typeMap[entityType], id: c.id, name: c.name },
        })),
      },
    },
  };
}

function toCandidates<T extends EntityCandidate>(
  list: ScoredCandidate<T>[],
): PendingClarificationCandidate[] {
  return list.map((c) => ({ id: c.entity.id, name: c.entity.name, score: c.score }));
}

function taskDraftMessage(draft: HypitoDraft, pendingActionId: string): ConversationReply {
  const assignee: HypitoEntityRef | null = draft.assigneeId
    ? { type: "user", id: draft.assigneeId, name: draft.assigneeName ?? "" }
    : null;
  const scope: HypitoEntityRef | null =
    draft.scope && draft.scopeId
      ? scopeRef(draft.scope, draft.scopeId, draft.scopeName ?? "")
      : null;
  const lines = [
    "Criar tarefa",
    `Título: ${draft.title}`,
    `Responsável: ${draft.assigneeIsRequester ? "você" : (draft.assigneeName ?? "não definido")}`,
    `Projeto/campanha: ${draft.scopeName ?? "sem projeto/campanha"}`,
    `Prazo: ${draft.dueAtIso ? `${fmtDate(draft.dueAtIso)} às ${fmtTime(draft.dueAtIso)}` : "sem prazo"}`,
    `Prioridade: ${draft.priority}`,
  ];
  return {
    payload: {
      version: HYPITO_MESSAGE_VERSION,
      kind: "task_draft",
      title: "Criar tarefa",
      textFallback: lines.join("\n"),
      state: "default",
      timestamp: nowIso(),
      pendingActionId,
      actions: [
        {
          id: "confirm_task_creation",
          label: "Confirmar criação",
          variant: "primary",
          pendingActionId,
        },
        { id: "edit_task_draft", label: "Editar", variant: "secondary", pendingActionId },
        { id: "cancel_pending_action", label: "Cancelar", variant: "destructive", pendingActionId },
      ],
      data: {
        title: draft.title ?? "",
        assignee,
        assigneeIsRequester: draft.assigneeIsRequester ?? false,
        scope,
        dueAtIso: draft.dueAtIso,
        priority: draft.priority,
        description: null,
      },
    },
  };
}

function emptyDraft(kind: "create_task" | "create_reminder"): HypitoDraft {
  return {
    kind,
    title: null,
    assigneeName: null,
    assigneeId: null,
    assigneeIsRequester: false,
    scope: null,
    scopeId: null,
    scopeName: null,
    dueAtIso: null,
    priority: "Normal",
    askedAssigneeAndDate: false,
    scopeAsked: false,
    assigneeAsked: false,
    dueDateAsked: false,
    dueDateConfirmed: false,
    sourceMessage: null,
  };
}

/** Card de seletor de projeto/campanha (pedido, seção 1) — recentes vêm
 * dos últimos escopos usados pelo próprio requester em pedidos anteriores
 * ao Hypito (`hypito_action_log`), nunca inventados. */
async function scopePickerMessage(
  db: DB,
  access: UserAccess,
  requesterId: string,
): Promise<ConversationReply> {
  const [{ projects, campaigns }, { data: recentLog }] = await Promise.all([
    listScopeCandidates(db, access),
    db
      .from("hypito_action_log")
      .select("detail")
      .eq("user_id", requesterId)
      .eq("kind", "create_task")
      .order("created_at", { ascending: false })
      .limit(10),
  ]);
  const recentIds = new Set<string>();
  const recent: { ref: HypitoEntityRef; clientName?: string }[] = [];
  for (const row of recentLog ?? []) {
    const d = row.detail as { scopeId?: string } | null;
    if (!d?.scopeId || recentIds.has(d.scopeId)) continue;
    const match =
      projects.find((p) => p.id === d.scopeId) ?? campaigns.find((c) => c.id === d.scopeId) ?? null;
    if (!match) continue;
    const isProject = projects.some((p) => p.id === d.scopeId);
    recentIds.add(d.scopeId);
    recent.push({
      ref: { type: isProject ? "project" : "campaign", id: match.id, name: match.name },
      clientName: "clientName" in match ? match.clientName : undefined,
    });
    if (recent.length >= 3) break;
  }
  return {
    payload: {
      version: HYPITO_MESSAGE_VERSION,
      kind: "scope_picker",
      title: "Projeto ou campanha",
      textFallback: "Qual projeto ou campanha?",
      state: "default",
      timestamp: nowIso(),
      actions: [],
      data: {
        recent,
        projects: projects.map((p) => ({ ref: { type: "project", id: p.id, name: p.name } })),
        campaigns: campaigns.map((c) => ({
          ref: { type: "campaign", id: c.id, name: c.name },
          clientName: c.clientName,
        })),
      },
    },
  };
}

/** Card de seletor de responsável (pedido, seção 1) — sempre inclui o
 * próprio solicitante como uma opção explícita (nunca um default
 * silencioso, pedido: "não definir automaticamente sem confirmação"). */
async function assigneePickerMessage(
  db: DB,
  access: UserAccess,
  requesterId: string,
  requesterName: string,
  scope: HypitoEntityRef | null,
): Promise<ConversationReply> {
  const candidates = await listAssigneeCandidates(db, access, requesterId, requesterName);
  return {
    payload: {
      version: HYPITO_MESSAGE_VERSION,
      kind: "assignee_picker",
      title: "Responsável",
      textFallback: "Quem será o responsável?",
      state: "default",
      timestamp: nowIso(),
      actions: [],
      data: {
        scope,
        options: candidates.map((c) => ({
          ref: { type: "user", id: c.id, name: c.name },
          role: c.role,
          availability: c.availability,
        })),
      },
    },
  };
}

function fmtLongDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

/** Card de prazo (pedido, seção 1) — se o texto original já trazia uma
 * pista de data, mostra a interpretação pra confirmação explícita antes
 * de aceitar ("Entendi 'próxima sexta' como 25/09/2026. Está correto?");
 * sem pista nenhuma, abre direto no calendário. */
function datePickerMessage(
  interpretedIso: string | null,
  interpretedLabel: string | null,
): ConversationReply {
  const textFallback = interpretedIso
    ? `Entendi como ${fmtLongDate(interpretedIso)}. Está correto?`
    : "Qual o prazo?";
  return {
    payload: {
      version: HYPITO_MESSAGE_VERSION,
      kind: "date_picker",
      title: "Prazo",
      textFallback,
      state: "default",
      timestamp: nowIso(),
      actions: [],
      data: { interpretedIso, interpretedLabel },
    },
  };
}

/** Tenta resolver o nome de escopo (campanha/projeto) contra os dois
 * tipos quando não há palavra-gatilho explícita ("Cobrar as métricas da
 * Jackery") — pedido, seção 8. Nunca decide sozinho em caso de
 * ambiguidade real entre TIPOS diferentes: prioriza o resultado com
 * maior confiança entre campanha e projeto. */
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

/** Continua um rascunho de tarefa até ter o mínimo (só o título é
 * obrigatório) ou até precisar perguntar responsável/prazo UMA única
 * vez. Nunca monta a confirmação sem título real. Quando o usuário não
 * dá um responsável e a plataforma não tem um "dono" mais específico pra
 * sugerir, o padrão vira o PRÓPRIO solicitante — nunca fica em
 * "responsável: não definido" sem isso ficar explícito no card (pedido,
 * seção 9). */
async function advanceTaskDraft(
  db: DB,
  requesterId: string,
  requesterName: string,
  access: UserAccess,
  draft: HypitoDraft,
  rawText: string,
): Promise<ConversationReply> {
  const skip = SKIP_WORDS.some((w) => rawText.toLowerCase().includes(w));

  if (!draft.title) {
    // NUNCA cai pro texto bruto do comando — se `extractTitle` não achou
    // nada de conteúdo real, pergunta em vez de usar o comando como
    // título (pedido, seção 3: "o comando nunca deve ser reutilizado
    // como conteúdo do campo solicitado").
    draft.title = extractTitle(rawText);
    if (!draft.title) {
      await saveContext(db, requesterId, stateWithDraft(draft, "title"));
      return textMessage("Claro. O que precisa ser feito?");
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
      return entityChoiceMessage("pessoa", draft.assigneeName, candidates);
    }
    if (lookup.kind === "resolved") {
      draft.assigneeId = lookup.entity.id;
      draft.assigneeName = lookup.entity.name;
    } else {
      // Nome dado mas não encontrado — segue sem travar, avisando com
      // transparência (o card final mostra "não definido").
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
      return entityChoiceMessage(draft.scope, draft.scopeName, candidates);
    }
    if (lookup.kind === "resolved") {
      draft.scopeId = lookup.entity.id;
      draft.scopeName = lookup.entity.name;
    } else {
      draft.scope = null;
      draft.scopeName = null;
    }
  }

  void skip; // campos abaixo agora são obrigatórios (pedido, seção 1) — não há mais "pular"

  // Projeto/campanha, responsável e prazo são todos obrigatórios (pedido,
  // seção 1) — cada um vira um picker próprio, perguntado UM de cada vez
  // (pedido, seção "conduzir uma pergunta de cada vez"), nunca combinados
  // numa única pergunta de texto como no fluxo antigo.
  if (!draft.scopeId) {
    if (draft.scopeAsked) {
      // Já perguntamos e ainda não veio resposta estruturada (ex.: texto
      // livre ambíguo que não bateu com nada) — repergunta com o mesmo
      // seletor em vez de travar a conversa.
    }
    draft.scopeAsked = true;
    await saveContext(db, requesterId, stateWithDraft(draft, "scope"));
    return scopePickerMessage(db, access, requesterId);
  }

  if (!draft.assigneeId) {
    draft.assigneeAsked = true;
    const scopeEntity = scopeRef(draft.scope!, draft.scopeId, draft.scopeName ?? "");
    await saveContext(db, requesterId, stateWithDraft(draft, "assignee"));
    return assigneePickerMessage(db, access, requesterId, requesterName, scopeEntity);
  }

  if (draft.dueAtIso && !draft.dueDateConfirmed) {
    await saveContext(db, requesterId, stateWithDraft(draft, "date_confirm"));
    return datePickerMessage(draft.dueAtIso, fmtLongDate(draft.dueAtIso));
  }
  if (!draft.dueAtIso) {
    draft.dueDateAsked = true;
    await saveContext(db, requesterId, stateWithDraft(draft, "date"));
    return datePickerMessage(null, null);
  }

  draft.assigneeIsRequester = draft.assigneeId === requesterId;

  const actionDraft: ActionTaskDraft = {
    title: draft.title,
    assigneeName: draft.assigneeName,
    assigneeId: draft.assigneeId,
    assigneeIsRequester: draft.assigneeIsRequester,
    scope: draft.scope,
    scopeId: draft.scopeId,
    scopeName: draft.scopeName,
    dueAtIso: draft.dueAtIso,
    priority: draft.priority,
    sourceMessage: draft.sourceMessage ?? null,
  };
  const pendingActionId = await createPendingAction(db, requesterId, "create_task", actionDraft);
  await clearContext(db, requesterId);
  return taskDraftMessage(draft, pendingActionId);
}

async function advanceReminderDraft(
  db: DB,
  requesterId: string,
  draft: { title: string | null; dueAtIso: string | null },
  rawText: string,
): Promise<ConversationReply> {
  if (!draft.title) {
    draft.title = extractTitle(rawText);
    if (!draft.title) {
      await saveContext(db, requesterId, {
        ...emptyStateBase(),
        draft: { ...emptyDraft("create_reminder"), title: null },
        awaitingField: "title",
      });
      return textMessage("Claro. Do que você quer que eu lembre?");
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
    return textMessage("Para quando devo te avisar?");
  }

  const pendingActionId = await createPendingAction(db, requesterId, "create_reminder", {
    title: draft.title,
    remindAtIso: draft.dueAtIso,
    relatedKind: "none",
    relatedId: null,
    relatedLink: null,
  });
  await clearContext(db, requesterId);
  return {
    payload: {
      version: HYPITO_MESSAGE_VERSION,
      kind: "task_draft",
      title: "Criar lembrete",
      textFallback: `Criar lembrete\nTítulo: ${draft.title}\nQuando: ${fmtDate(draft.dueAtIso)} às ${fmtTime(draft.dueAtIso)}`,
      state: "default",
      timestamp: nowIso(),
      pendingActionId,
      actions: [
        {
          id: "confirm_task_creation",
          label: "Confirmar criação",
          variant: "primary",
          pendingActionId,
        },
        { id: "cancel_pending_action", label: "Cancelar", variant: "destructive", pendingActionId },
      ],
      data: {
        title: draft.title,
        assignee: null,
        assigneeIsRequester: false,
        scope: null,
        dueAtIso: draft.dueAtIso,
        priority: "Normal",
        description: null,
      },
    },
  };
}

function emptyStateBase(): HypitoConversationState {
  return {
    lastIntent: null,
    lastEntity: null,
    pendingClarification: null,
    draft: null,
    awaitingField: null,
    updatedAt: nowIso(),
  };
}
function stateWithDraft(
  draft: HypitoDraft,
  awaitingField: NonNullable<HypitoConversationState["awaitingField"]>,
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
      return textMessage("Olá! Pode me perguntar sobre tarefas, agenda, projetos ou campanhas.");

    case "help":
      return textMessage(
        'Posso consultar suas tarefas, agenda, projetos e campanhas, e ajudar a criar tarefas e lembretes. É só perguntar, por exemplo: "o que tenho para hoje?" ou "criar uma tarefa".',
      );

    case "cancel":
      return textMessage("Não tem nada pendente pra cancelar agora.");

    case "my_tasks": {
      const range = resolveDateRange(intent.range);
      const result = await getMyTasks(db, access, myName, range ?? undefined);
      return taskListMessage(result, "Suas tarefas", "Nada pendente por aqui. Bom trabalho.");
    }

    case "overdue_tasks": {
      if (state.lastEntity) {
        const result = await getScopedTasks(
          db,
          state.lastEntity.type,
          state.lastEntity.id,
          "overdue",
        );
        return taskListMessage(
          result,
          `Tarefas atrasadas em ${state.lastEntity.name}`,
          `Nenhuma tarefa atrasada em ${state.lastEntity.name}.`,
          {
            id: state.lastEntity.type === "campanha" ? "open_campaign" : "open_project",
            label: `Abrir ${state.lastEntity.type}`,
            variant: "link",
            entity: scopeRef(state.lastEntity.type, state.lastEntity.id, state.lastEntity.name),
          },
        );
      }
      const result = await getOverdueTasks(db, access, myName);
      return taskListMessage(result, "Tarefas atrasadas", "Nenhuma tarefa atrasada. 🎉");
    }

    case "upcoming_tasks": {
      if (state.lastEntity) {
        const result = await getScopedTasks(
          db,
          state.lastEntity.type,
          state.lastEntity.id,
          "upcoming",
        );
        return taskListMessage(
          result,
          `Próximos 7 dias em ${state.lastEntity.name}`,
          `Nada vencendo nos próximos dias em ${state.lastEntity.name}.`,
        );
      }
      const result = await getUpcomingTasks(db, access, myName, intent.days);
      return taskListMessage(result, "Próximos 7 dias", "Nada vencendo nos próximos dias.");
    }

    case "pending_approvals": {
      if (state.lastEntity) {
        const result = await getScopedTasks(
          db,
          state.lastEntity.type,
          state.lastEntity.id,
          "pending_approval",
        );
        return taskListMessage(
          result,
          `Aprovações pendentes em ${state.lastEntity.name}`,
          `Sem aprovações pendentes em ${state.lastEntity.name}.`,
        );
      }
      const result = await getPendingApprovals(db, access, myName);
      return taskListMessage(result, "Aprovações pendentes", "Sem aprovações aguardando você.");
    }

    case "next_meeting": {
      const meeting = await getNextMeeting(db, access, requesterId);
      if (!meeting) return textMessage("Não encontrei nenhuma reunião futura na sua agenda.");
      return agendaMessage(
        { items: [meeting], total: 1 },
        "Próxima reunião",
        "Sem reuniões futuras.",
      );
    }

    case "my_meetings": {
      const range = resolveDateRange(intent.range) ?? undefined;
      const periodLabel =
        intent.range.kind === "next_week"
          ? "Agenda da próxima semana"
          : intent.range.kind === "this_week"
            ? "Agenda desta semana"
            : intent.range.kind === "today"
              ? "Agenda de hoje"
              : intent.range.kind === "tomorrow"
                ? "Agenda de amanhã"
                : "Sua agenda";
      const result = await getMyMeetings(db, access, requesterId, range);
      return agendaMessage(result, periodLabel, "Nenhuma reunião encontrada nesse período.");
    }

    case "project_summary":
    case "campaign_summary": {
      const scope = intent.type === "project_summary" ? "projeto" : "campanha";
      const query = intent.query;
      const lookup =
        scope === "projeto"
          ? await resolveProject(db, access, query)
          : await resolveCampaign(db, access, query);
      if (lookup.kind === "not_found") {
        return textMessage(
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
        return entityChoiceMessage(scope, query, candidates);
      }
      const summary = await summarizeScope(db, scope, lookup.entity);
      await saveContext(db, requesterId, {
        ...emptyStateBase(),
        lastEntity: { type: scope, id: summary.id, name: summary.name },
        lastIntent: intent.type,
      });
      return scopeSummaryMessage(scope, summary);
    }

    case "campaigns_attention":
      return textMessage(
        "Ainda não consigo consolidar quais campanhas precisam de atenção nesta versão — posso resumir uma campanha específica se você me disser o nome.",
      );

    case "person_tasks": {
      const lookup = await resolvePersonByName(db, intent.personQuery);
      if (lookup.kind === "not_found")
        return textMessage(`Não encontrei "${intent.personQuery}" no time.`);
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
        return entityChoiceMessage("pessoa", intent.personQuery, candidates);
      }
      const result = await getPersonTasks(db, access, lookup.entity.name);
      return taskListMessage(
        result,
        `Tarefas de ${lookup.entity.name}`,
        `${lookup.entity.name} não tem tarefas em aberto.`,
      );
    }

    case "create_task":
      return advanceTaskDraft(
        db,
        requesterId,
        myName,
        access,
        emptyDraft("create_task"),
        intent.raw,
      );

    case "create_reminder":
      return advanceReminderDraft(db, requesterId, { title: null, dueAtIso: null }, intent.raw);

    case "unknown":
    default:
      return textMessage(
        'Não entendi. Tente algo como "o que tenho para hoje?", "quais tarefas estão atrasadas?" ou "criar uma tarefa".',
      );
  }
}

async function continueClarification(
  db: DB,
  requesterId: string,
  requesterName: string,
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
    return textMessage(
      "Ainda não consegui identificar qual das opções — pode escrever o nome completo?",
    );
  }
  if (!resolved) {
    await clearContext(db, requesterId);
    return textMessage("Sem problema. Em que mais posso ajudar?");
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
      return scopeSummaryMessage(scope, summary);
    }
    case "person_tasks": {
      const result = await getPersonTasks(db, access, resolved.name);
      await clearContext(db, requesterId);
      return taskListMessage(
        result,
        `Tarefas de ${resolved.name}`,
        `${resolved.name} não tem tarefas em aberto.`,
      );
    }
    case "task_assignee": {
      const draft = state.draft ?? emptyDraft("create_task");
      draft.assigneeId = resolved.id;
      draft.assigneeName = resolved.name;
      return advanceTaskDraft(db, requesterId, requesterName, access, draft, "");
    }
  }
}

async function continueDraft(
  db: DB,
  requesterId: string,
  requesterName: string,
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
  return advanceTaskDraft(db, requesterId, requesterName, access, draft, rawText);
}

/** Clique estruturado num dos pickers do rascunho de tarefa (responsável/
 * escopo/prazo) — nunca reprocessa o valor como texto livre (evita tratar
 * um clique certo como uma resposta ambígua). Usado por
 * `hypito-chat.functions.ts` quando o frontend chama
 * `onPickAssignee`/`onPickScope`/`onPickDate`. */
export type PickedFieldValue =
  | { field: "scope"; type: "project" | "campaign"; id: string; name: string }
  | { field: "assignee"; id: string; name: string }
  | { field: "date"; iso: string }
  | { field: "date_confirm"; confirmed: boolean };

export async function continuePickedField(
  db: DB,
  requesterId: string,
  value: PickedFieldValue,
): Promise<ConversationReply> {
  try {
    const access = await loadUserAccess(db, requesterId);
    const people = await fetchTeamDirectory(db);
    const me = people.find((p) => p.id === requesterId);
    const myName = me?.name ?? "";
    const state = await loadContext(db, requesterId);
    const draft = state.draft ?? emptyDraft("create_task");

    if (value.field === "scope") {
      draft.scope = value.type === "project" ? "projeto" : "campanha";
      draft.scopeId = value.id;
      draft.scopeName = value.name;
    } else if (value.field === "assignee") {
      draft.assigneeId = value.id;
      draft.assigneeName = value.name;
    } else if (value.field === "date") {
      draft.dueAtIso = value.iso;
      draft.dueDateConfirmed = true;
    } else if (value.field === "date_confirm") {
      if (value.confirmed) {
        draft.dueDateConfirmed = true;
      } else {
        draft.dueAtIso = null;
        draft.dueDateConfirmed = false;
      }
    }
    return await advanceTaskDraft(db, requesterId, myName, access, draft, "");
  } catch (err) {
    const message =
      err instanceof HypitoError
        ? err.message
        : toSafeReply("continuePickedField", err, { requesterId });
    return textMessage(message);
  }
}

/** Semeia um rascunho de tarefa a partir de uma mensagem do chat (pedido,
 * seção 5: menu "Criar tarefa" e `@Hypito` num canal vinculado) — usa o
 * texto da mensagem como sugestão de título, menções `user` já presentes
 * como candidatos a responsável, e o escopo vinculado ao canal (quando
 * houver) como sugestão — mas SEMPRE passa pelos mesmos pickers/prévia de
 * confirmação, nunca pula a etapa de confirmação por vir de uma mensagem. */
export async function seedTaskDraftFromMessage(
  db: DB,
  requesterId: string,
  message: {
    id: string;
    convoId: string;
    channelName: string;
    authorName: string;
    text: string;
    createdAtIso: string;
    mentionedUserIds?: string[];
  },
  scopeHint?: { type: "project" | "campaign"; id: string; name: string } | null,
): Promise<ConversationReply> {
  try {
    const access = await loadUserAccess(db, requesterId);
    const people = await fetchTeamDirectory(db);
    const me = people.find((p) => p.id === requesterId);
    const myName = me?.name ?? "";

    const draft = emptyDraft("create_task");
    draft.title = extractTitle(message.text) ?? message.text.slice(0, 120).trim() ?? null;
    draft.sourceMessage = {
      messageId: message.id,
      convoId: message.convoId,
      channelName: message.channelName,
      authorName: message.authorName,
      excerpt: message.text.slice(0, 240),
      createdAtIso: message.createdAtIso,
    };
    if (message.mentionedUserIds && message.mentionedUserIds.length > 0) {
      const mentioned = people.find((p) => p.id === message.mentionedUserIds![0]);
      if (mentioned) {
        draft.assigneeId = mentioned.id;
        draft.assigneeName = mentioned.name;
      }
    }
    if (scopeHint) {
      draft.scope = scopeHint.type === "project" ? "projeto" : "campanha";
      draft.scopeId = scopeHint.id;
      draft.scopeName = scopeHint.name;
    }
    await clearContext(db, requesterId);
    return await advanceTaskDraft(db, requesterId, myName, access, draft, "");
  } catch (err) {
    const errMessage =
      err instanceof HypitoError
        ? err.message
        : toSafeReply("seedTaskDraftFromMessage", err, { requesterId });
    return textMessage(errMessage);
  }
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
      return textMessage("Ok, cancelei. Em que mais posso ajudar?");
    }

    if (state.awaitingField && state.draft) {
      return await continueDraft(db, requesterId, myName, access, state, rawText);
    }
    if (state.pendingClarification) {
      return await continueClarification(db, requesterId, myName, access, state, rawText);
    }

    const { intent } = classify(rawText);
    return await dispatchFreshIntent(db, requesterId, access, myName, state, intent, rawText);
  } catch (err) {
    const message =
      err instanceof HypitoError
        ? err.message
        : toSafeReply("handleUserMessage", err, { requesterId });
    return textMessage(message);
  }
}
