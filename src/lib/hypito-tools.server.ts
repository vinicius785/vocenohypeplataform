/**
 * Ferramentas server-side do Hypito — camada de consulta com contrato
 * tipado (pedido, seção 17). Cada função:
 *  - recebe o usuário autenticado (`UserAccess`, resolvido a partir da
 *    sessão real — nunca de algo que o texto do usuário afirma),
 *  - valida permissão ANTES de tocar em qualquer dado,
 *  - devolve dado estruturado (nunca uma string solta),
 *  - limita quantidade de registros (`LIST_LIMIT`),
 *  - separa consulta (aqui) de mutação (`hypito-actions.server.ts`).
 *
 * Server-only — usa `supabaseAdmin` implicitamente via o client injetado.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  fetchAllTasks,
  fetchMeetings,
  fetchTeamDirectory,
  isMeetingParticipant,
  type ParsedTask,
  type ParsedMeeting,
} from "@/lib/hypito-data.server";
import { assertCan, type UserAccess } from "@/lib/hypito-permissions.server";
import type { LinkedRef } from "@/lib/hypito-insights";
import {
  resolveEntity,
  type EntityCandidate,
  type ScoredCandidate,
} from "@/lib/hypito-entity-resolver";

type DB = SupabaseClient<Database>;

const LIST_LIMIT = 5;

export type TaskSummary = {
  id: string;
  title: string;
  status: string;
  priority?: string;
  dueDateIso?: string;
  assignees: string[];
  link: LinkedRef;
  scope: "projeto" | "campanha" | "marketing";
  scopeId?: string;
};

export type MeetingSummary = {
  id: string;
  titulo: string;
  whenIso?: string;
  durationMin: number;
  local?: string;
  link: LinkedRef;
};

export type ListResult<T> = { items: T[]; total: number };

function toTaskSummary(t: ParsedTask): TaskSummary {
  return {
    id: t.id,
    title: t.title,
    status: t.status,
    priority: t.priority,
    dueDateIso: t.dueDate ? t.dueDate.toISOString() : undefined,
    assignees: t.assignees,
    link: t.link,
    scope: t.scope,
    scopeId: t.scopeId,
  };
}

function toMeetingSummary(m: ParsedMeeting): MeetingSummary {
  return {
    id: m.id,
    titulo: m.titulo,
    whenIso: m.when ? m.when.toISOString() : undefined,
    durationMin: m.durationMin,
    local: m.local,
    link: { label: "reunião", href: "/time?section=reunioes" },
  };
}

function limitList<T>(items: T[]): ListResult<T> {
  return { items: items.slice(0, LIST_LIMIT), total: items.length };
}

/** Resultado padrão de resolução de entidade — usado por campanha,
 * projeto e pessoa, pra tratar os três de forma igual em quem chama
 * (`hypito-conversation.server.ts`). */
export type EntityLookup<T extends EntityCandidate> =
  | { kind: "resolved"; entity: T }
  | { kind: "ambiguous"; candidates: ScoredCandidate<T>[] }
  | { kind: "not_found" };

/** Resolve um nome de pessoa (texto livre, possivelmente parcial,
 * com acento/hífen/maiúscula diferentes) contra o diretório real do
 * time — nunca aceita um id "inventado" pelo texto. Usa o mesmo
 * resolvedor genérico com pontuação de campanhas/projetos, então
 * "toni", "Tôni" ou um pequeno erro de digitação também resolvem. */
export async function resolvePersonByName(
  db: DB,
  nameQuery: string,
): Promise<EntityLookup<{ id: string; name: string }>> {
  const people = await fetchTeamDirectory(db);
  const result = resolveEntity(nameQuery, people);
  if (result.kind === "resolved") return { kind: "resolved", entity: result.match.entity };
  if (result.kind === "ambiguous") return { kind: "ambiguous", candidates: result.candidates };
  return { kind: "not_found" };
}

async function loadTasksFor(
  db: DB,
  personName: string,
  opts: { status?: (s: string) => boolean; dueRange?: { start: Date; end: Date } } = {},
): Promise<ParsedTask[]> {
  const { tasks } = await fetchAllTasks(db);
  return tasks.filter((t) => {
    if (!t.assignees.includes(personName)) return false;
    if (opts.status && !opts.status(t.status)) return false;
    if (opts.dueRange) {
      if (!t.dueDate) return false;
      const ms = t.dueDate.getTime();
      if (ms < opts.dueRange.start.getTime() || ms >= opts.dueRange.end.getTime()) return false;
    }
    return true;
  });
}

const isOpenStatus = (s: string) => s !== "Concluído" && s !== "Arquivado";

/** Tarefas da própria pessoa, opcionalmente num intervalo de datas —
 * sempre abertas (concluídas não fazem parte de "o que eu tenho"). */
export async function getMyTasks(
  db: DB,
  access: UserAccess,
  personName: string,
  dueRange?: { start: Date; end: Date },
): Promise<ListResult<TaskSummary>> {
  assertCan(access, "projetos");
  const tasks = await loadTasksFor(db, personName, { status: isOpenStatus, dueRange });
  tasks.sort((a, b) => (a.dueDate?.getTime() ?? Infinity) - (b.dueDate?.getTime() ?? Infinity));
  return limitList(tasks.map(toTaskSummary));
}

export async function getOverdueTasks(
  db: DB,
  access: UserAccess,
  personName: string,
  now: Date = new Date(),
): Promise<ListResult<TaskSummary>> {
  assertCan(access, "projetos");
  const tasks = await loadTasksFor(db, personName, { status: isOpenStatus });
  const overdue = tasks.filter((t) => t.dueDate && t.dueDate.getTime() < now.getTime());
  overdue.sort((a, b) => (a.dueDate?.getTime() ?? 0) - (b.dueDate?.getTime() ?? 0));
  return limitList(overdue.map(toTaskSummary));
}

export async function getUpcomingTasks(
  db: DB,
  access: UserAccess,
  personName: string,
  days: number,
  now: Date = new Date(),
): Promise<ListResult<TaskSummary>> {
  assertCan(access, "projetos");
  const end = new Date(now.getTime() + days * 86_400_000);
  const tasks = await loadTasksFor(db, personName, {
    status: isOpenStatus,
    dueRange: { start: now, end },
  });
  tasks.sort((a, b) => (a.dueDate?.getTime() ?? 0) - (b.dueDate?.getTime() ?? 0));
  return limitList(tasks.map(toTaskSummary));
}

export async function getPendingApprovals(
  db: DB,
  access: UserAccess,
  personName: string,
): Promise<ListResult<TaskSummary>> {
  assertCan(access, "projetos");
  const tasks = await loadTasksFor(db, personName, { status: (s) => s === "Em aprovação" });
  return limitList(tasks.map(toTaskSummary));
}

/** Tarefas de OUTRA pessoa — mesma checagem de permissão do módulo que
 * já vale pra qualquer consulta hoje na plataforma (não existe
 * visibilidade por registro pra restringir mais que isso). */
export async function getPersonTasks(
  db: DB,
  access: UserAccess,
  personName: string,
  dueRange?: { start: Date; end: Date },
): Promise<ListResult<TaskSummary>> {
  return getMyTasks(db, access, personName, dueRange);
}

export async function getMyMeetings(
  db: DB,
  access: UserAccess,
  userId: string,
  range?: { start: Date; end: Date },
): Promise<ListResult<MeetingSummary>> {
  assertCan(access, "reunioes");
  const { meetings } = await fetchMeetings(db);
  let mine = meetings.filter((m) => m.status !== "Cancelada" && isMeetingParticipant(m, userId));
  if (range) {
    mine = mine.filter(
      (m) =>
        m.when &&
        m.when.getTime() >= range.start.getTime() &&
        m.when.getTime() < range.end.getTime(),
    );
  }
  mine.sort((a, b) => (a.when?.getTime() ?? 0) - (b.when?.getTime() ?? 0));
  return limitList(mine.map(toMeetingSummary));
}

export async function getNextMeeting(
  db: DB,
  access: UserAccess,
  userId: string,
  now: Date = new Date(),
): Promise<MeetingSummary | null> {
  assertCan(access, "reunioes");
  const { meetings } = await fetchMeetings(db);
  const upcoming = meetings
    .filter(
      (m) =>
        m.status !== "Cancelada" &&
        isMeetingParticipant(m, userId) &&
        m.when &&
        m.when.getTime() > now.getTime(),
    )
    .sort((a, b) => (a.when?.getTime() ?? 0) - (b.when?.getTime() ?? 0));
  return upcoming[0] ? toMeetingSummary(upcoming[0]) : null;
}

export type ScopeSummaryResult = {
  id: string;
  name: string;
  openTasks: number;
  overdueTasks: number;
  completedTasks: number;
  nextDueTask: { id: string; title: string; dueDateIso: string } | null;
  pendingApprovals: number;
};

export async function fetchAllProjects(db: DB): Promise<EntityCandidate[]> {
  const { data, error } = await db.from("projetos").select("id, data");
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    id: row.id,
    name: (row.data as { name?: string } | null)?.name ?? "(sem nome)",
  }));
}

type RawCampanha = { id?: string; nome?: string };

export async function fetchAllCampaigns(db: DB): Promise<EntityCandidate[]> {
  const { data, error } = await db.from("clientes").select("id, data");
  if (error) throw new Error(error.message);
  const out: EntityCandidate[] = [];
  for (const row of data ?? []) {
    const campanhas = ((row.data as { campanhas?: RawCampanha[] } | null)?.campanhas ??
      []) as RawCampanha[];
    for (const c of campanhas) {
      if (c.id) out.push({ id: c.id, name: c.nome ?? "(sem nome)" });
    }
  }
  return out;
}

/** Resolve só a ENTIDADE (campanha/projeto) — nunca decide sozinho
 * quando há ambiguidade (pedido, seção 6: "dois ou mais candidatos
 * próximos: perguntar qual deles"). Separado da consulta de dados
 * (`summarizeScope`) pra poder ser reaproveitado tanto numa pergunta
 * nova quanto numa resposta de esclarecimento (`hypito-conversation.server.ts`). */
export async function resolveCampaign(
  db: DB,
  access: UserAccess,
  query: string,
): Promise<EntityLookup<EntityCandidate>> {
  assertCan(access, "campanhas");
  const pool = await fetchAllCampaigns(db);
  const result = resolveEntity(query, pool);
  if (result.kind === "resolved") return { kind: "resolved", entity: result.match.entity };
  if (result.kind === "ambiguous") return { kind: "ambiguous", candidates: result.candidates };
  return { kind: "not_found" };
}

export async function resolveProject(
  db: DB,
  access: UserAccess,
  query: string,
): Promise<EntityLookup<EntityCandidate>> {
  assertCan(access, "projetos");
  const pool = await fetchAllProjects(db);
  const result = resolveEntity(query, pool);
  if (result.kind === "resolved") return { kind: "resolved", entity: result.match.entity };
  if (result.kind === "ambiguous") return { kind: "ambiguous", candidates: result.candidates };
  return { kind: "not_found" };
}

/** Consulta os dados reais de uma campanha/projeto JÁ resolvido (pedido,
 * seção 9: "não mostrar apenas que existe — consultar os dados reais e
 * produzir um resumo útil"). Nunca inventa campo — cada valor vem de
 * `fetchAllTasks`, o mesmo agregador usado pelo relatório semanal. */
export async function summarizeScope(
  db: DB,
  scope: "projeto" | "campanha",
  entity: EntityCandidate,
  now: Date = new Date(),
): Promise<ScopeSummaryResult> {
  const { tasks } = await fetchAllTasks(db);
  const scoped = tasks.filter((t) => t.scope === scope && t.scopeId === entity.id);
  const open = scoped.filter((t) => isOpenStatus(t.status));
  const overdue = open.filter((t) => t.dueDate && t.dueDate < now);
  const upcoming = open
    .filter((t) => t.dueDate && t.dueDate >= now)
    .sort((a, b) => (a.dueDate?.getTime() ?? 0) - (b.dueDate?.getTime() ?? 0));
  const nextDue = upcoming[0];
  return {
    id: entity.id,
    name: entity.name,
    openTasks: open.length,
    overdueTasks: overdue.length,
    completedTasks: scoped.filter((t) => t.status === "Concluído").length,
    nextDueTask: nextDue?.dueDate
      ? { id: nextDue.id, title: nextDue.title, dueDateIso: nextDue.dueDate.toISOString() }
      : null,
    pendingApprovals: scoped.filter((t) => t.status === "Em aprovação").length,
  };
}

/** Tarefas de uma campanha/projeto (não de uma pessoa) — usada na
 * continuação de contexto ("Quais tarefas estão atrasadas?" logo depois
 * de resolver uma campanha, pedido seção 7, segundo exemplo). */
export async function getScopedTasks(
  db: DB,
  scope: "projeto" | "campanha",
  scopeId: string,
  filter: "overdue" | "upcoming" | "pending_approval",
  now: Date = new Date(),
): Promise<ListResult<TaskSummary>> {
  const { tasks } = await fetchAllTasks(db);
  const scoped = tasks.filter((t) => t.scope === scope && t.scopeId === scopeId);
  let filtered: ParsedTask[];
  if (filter === "overdue") {
    filtered = scoped.filter((t) => isOpenStatus(t.status) && t.dueDate && t.dueDate < now);
  } else if (filter === "upcoming") {
    const end = new Date(now.getTime() + 7 * 86_400_000);
    filtered = scoped.filter(
      (t) => isOpenStatus(t.status) && t.dueDate && t.dueDate >= now && t.dueDate < end,
    );
  } else {
    filtered = scoped.filter((t) => t.status === "Em aprovação");
  }
  filtered.sort((a, b) => (a.dueDate?.getTime() ?? 0) - (b.dueDate?.getTime() ?? 0));
  return limitList(filtered.map(toTaskSummary));
}
