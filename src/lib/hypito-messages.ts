/**
 * Schema tipado e versionado das respostas estruturadas do Hypito —
 * importável tanto pelo backend (`hypito-conversation.server.ts`,
 * `hypito-chat.functions.ts`, que MONTAM o payload) quanto pelo
 * frontend (`HypitoMessageCards.tsx`, que só LÊ e escolhe o componente
 * visual certo). Por isso este arquivo é puro — sem Supabase, sem React,
 * sem `.server.ts` — só tipos e helpers determinísticos.
 *
 * Princípio central (pedido, seção 2): o backend nunca produz HTML/JSX/
 * rota crua — só dado estruturado + `textFallback` legível. O frontend
 * decide o componente visual a partir de `kind`. Nenhuma `action` aqui
 * carrega uma URL arbitrária — só uma `HypitoEntityRef` (tipo+id+nome) ou
 * um filtro estruturado fechado; quem transforma isso em navegação real é
 * sempre o frontend, usando o router e as convenções já existentes
 * (`ChatSection.tsx`), nunca uma string de rota vinda do backend.
 */

export const HYPITO_MESSAGE_VERSION = 1 as const;

export type HypitoEntityType = "task" | "campaign" | "project" | "meeting" | "user" | "client";

/** Referência estruturada a uma entidade real — nunca uma rota. Todo
 * dado aqui já passou por checagem de permissão no momento em que a
 * resposta foi montada (pedido, seção 4: "permissão já validada no
 * momento da resposta"); o destino ainda revalida ao abrir, porque o
 * acesso pode ter mudado entre o envio da mensagem e o clique. */
export type HypitoEntityRef = {
  type: HypitoEntityType;
  id: string;
  name: string;
  /** Metadados mínimos pra navegação/exibição (nunca dado sensível) —
   * ex.: `{ scope: "campanha", scopeId: "..." }` numa tarefa, pra abrir
   * ela dentro da campanha certa sem depender de um índice local ainda
   * não atualizado logo após a criação. */
  meta?: Record<string, string | number | boolean | null>;
};

export type HypitoPriority = "Urgente" | "Alta" | "Normal" | "Baixa";

/** Registro FECHADO de ações — o modelo/backend só pode escolher um
 * destes ids, nunca inventar um novo ou embutir uma URL/função (pedido,
 * seção 18: "não aceitar ação não registrada"). */
export type HypitoActionId =
  | "open_task"
  | "open_campaign"
  | "open_project"
  | "open_meeting"
  | "open_user"
  | "open_client"
  | "open_filtered_tasks"
  | "open_agenda"
  | "confirm_task_creation"
  | "edit_task_draft"
  | "cancel_pending_action"
  | "retry_query";

export type HypitoActionVariant = "primary" | "secondary" | "destructive" | "link";

export type HypitoTaskFilterKind = "hoje" | "atrasada" | "semana" | "campanha" | "projeto";

export type HypitoAction = {
  id: HypitoActionId;
  label: string;
  variant: HypitoActionVariant;
  /** Alvo de navegação — obrigatório pras ações `open_*` de entidade
   * única (task/campaign/project/meeting/user/client). */
  entity?: HypitoEntityRef;
  /** Filtro estruturado pra `open_filtered_tasks`/`open_agenda` — nunca
   * uma query string crua. */
  filter?: { kind: HypitoTaskFilterKind; scopeId?: string };
  /** Obrigatório pras ações que mexem numa ação pendente
   * (`confirm_task_creation`/`edit_task_draft`/`cancel_pending_action`). */
  pendingActionId?: string;
};

/** Estado visual do card — precisa sobreviver no histórico mesmo depois
 * de resolvido (pedido, seção 20: "não remover silenciosamente cards
 * antigos"). */
export type HypitoMessageState =
  | "default"
  | "loading"
  | "success"
  | "cancelled"
  | "expired"
  | "unavailable"
  | "error"
  | "no_permission";

type HypitoMessageBase = {
  version: typeof HYPITO_MESSAGE_VERSION;
  /** Texto simples equivalente — usado por clientes antigos, busca,
   * histórico, notificações e como fallback se o payload for inválido/
   * de versão desconhecida (pedido, seção 2/19). SEMPRE preenchido. */
  textFallback: string;
  title?: string;
  state: HypitoMessageState;
  /** ISO — geralmente igual a `created_at` da mensagem, guardado à parte
   * pra não depender de reler a linha do banco na hora de exibir. */
  timestamp: string;
  actions: HypitoAction[];
};

export type TaskDraftData = {
  title: string;
  assignee: HypitoEntityRef | null;
  /** `true` quando o responsável sugerido é o próprio autor do pedido
   * (default explícito — pedido, seção 9 — nunca fica "não definido"
   * silenciosamente sem essa sinalização). */
  assigneeIsRequester: boolean;
  scope: HypitoEntityRef | null;
  dueAtIso: string | null;
  priority: HypitoPriority;
  description: string | null;
};

export type TaskCreatedData = {
  task: HypitoEntityRef;
  assignee: HypitoEntityRef | null;
  assigneeIsRequester: boolean;
  scope: HypitoEntityRef | null;
  dueAtIso: string | null;
  priority: HypitoPriority;
};

export type TaskListItem = {
  task: HypitoEntityRef;
  status: string;
  dueDateIso?: string;
  priority?: string;
  assignees: string[];
};

export type TaskListData = {
  items: TaskListItem[];
  total: number;
  emptyMessage: string;
  viewAllFilter?: { kind: HypitoTaskFilterKind; scopeId?: string };
};

export type ScopeSummaryData = {
  entity: HypitoEntityRef;
  status?: string;
  openTasks: number;
  overdueTasks: number;
  pendingApprovals: number;
  nextDueTask: { title: string; dueDateIso: string; task?: HypitoEntityRef } | null;
  attentionNote: string | null;
};

export type MeetingListItem = {
  meeting: HypitoEntityRef;
  whenIso: string;
  durationMin: number;
  hasLink: boolean;
};

export type MeetingDayGroup = {
  dateIso: string;
  label: string;
  items: MeetingListItem[];
};

export type AgendaSummaryData = {
  periodLabel: string;
  total: number;
  groups: MeetingDayGroup[];
};

export type EntityChoiceOption = {
  ref: HypitoEntityRef;
  context?: string;
};

export type EntityChoiceData = {
  entityType: HypitoEntityType;
  query: string;
  options: EntityChoiceOption[];
};

export type FriendlyErrorData = {
  message: string;
  whatWasNotChanged?: string;
  canRetry: boolean;
};

export type SuccessData = {
  message: string;
  entity: HypitoEntityRef | null;
};

export type HypitoMessage =
  | (HypitoMessageBase & { kind: "text" })
  | (HypitoMessageBase & { kind: "task_draft"; pendingActionId: string; data: TaskDraftData })
  | (HypitoMessageBase & { kind: "task_created"; data: TaskCreatedData })
  | (HypitoMessageBase & { kind: "task_list"; data: TaskListData })
  | (HypitoMessageBase & { kind: "campaign_summary"; data: ScopeSummaryData })
  | (HypitoMessageBase & { kind: "project_summary"; data: ScopeSummaryData })
  | (HypitoMessageBase & { kind: "agenda_summary"; data: AgendaSummaryData })
  | (HypitoMessageBase & { kind: "entity_choice"; data: EntityChoiceData })
  | (HypitoMessageBase & { kind: "friendly_error"; data: FriendlyErrorData })
  | (HypitoMessageBase & { kind: "success"; data: SuccessData });

/** Valida (de forma superficial, mas suficiente) que um valor lido do
 * banco é um `HypitoMessage` desta versão — payload de versão
 * desconhecida ou malformado nunca quebra o render, só cai pro texto
 * simples (pedido, seção 19: "payload inválido usa textFallback").
 * Nunca confia cegamente no que foi persistido pelo cliente/servidor
 * anterior. */
export function parseHypitoMessage(value: unknown): HypitoMessage | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (v.version !== HYPITO_MESSAGE_VERSION) return null;
  if (typeof v.kind !== "string") return null;
  if (typeof v.textFallback !== "string") return null;
  if (typeof v.state !== "string") return null;
  if (typeof v.timestamp !== "string") return null;
  if (!Array.isArray(v.actions)) return null;
  if (v.kind !== "text" && (!v.data || typeof v.data !== "object")) return null;
  return v as unknown as HypitoMessage;
}
