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

type DB = SupabaseClient<Database>;

const LIST_LIMIT = 5;

export type TaskSummary = {
  id: string;
  title: string;
  status: string;
  dueDateIso?: string;
  assignees: string[];
  link: LinkedRef;
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
    dueDateIso: t.dueDate ? t.dueDate.toISOString() : undefined,
    assignees: t.assignees,
    link: t.link,
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

/** Resolve um nome de pessoa (texto livre, possivelmente parcial) contra
 * o diretório real do time — nunca aceita um id "inventado" pelo texto.
 * Devolve `null` (não encontrado) ou `"ambiguous"` (mais de um homônimo)
 * pra quem chama pedir esclarecimento, nunca adivinhar. */
export async function resolvePersonByName(
  db: DB,
  nameQuery: string,
): Promise<{ id: string; name: string } | "ambiguous" | null> {
  const people = await fetchTeamDirectory(db);
  const q = nameQuery.trim().toLowerCase();
  if (!q) return null;
  const matches = people.filter((p) => p.name.toLowerCase().includes(q));
  if (matches.length === 0) return null;
  if (matches.length > 1) {
    const exact = matches.find((p) => p.name.toLowerCase() === q);
    if (exact) return { id: exact.id, name: exact.name };
    return "ambiguous";
  }
  return { id: matches[0].id, name: matches[0].name };
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

export type ProjectSummaryResult = {
  id: string;
  name: string;
  openTasks: number;
  overdueTasks: number;
  completedTasks: number;
  link: LinkedRef;
} | null;

export async function getProjectSummary(
  db: DB,
  access: UserAccess,
  nameQuery: string,
  now: Date = new Date(),
): Promise<ProjectSummaryResult> {
  assertCan(access, "projetos");
  const { data, error } = await db.from("projetos").select("id, data");
  if (error) throw new Error(error.message);
  const q = nameQuery.trim().toLowerCase();
  const match = (data ?? []).find((row) => {
    const name = ((row.data as { name?: string } | null)?.name ?? "").toLowerCase();
    return name.includes(q);
  });
  if (!match) return null;
  const name = (match.data as { name?: string }).name ?? "(sem nome)";
  const { tasks } = await fetchAllTasks(db);
  const projectTasks = tasks.filter((t) => t.scope === "projeto" && t.scopeId === match.id);
  return {
    id: match.id,
    name,
    openTasks: projectTasks.filter((t) => isOpenStatus(t.status)).length,
    overdueTasks: projectTasks.filter((t) => isOpenStatus(t.status) && t.dueDate && t.dueDate < now)
      .length,
    completedTasks: projectTasks.filter((t) => t.status === "Concluído").length,
    link: { label: "projeto", href: `/projeto/${match.id}` },
  };
}

export type CampaignSummaryResult = {
  id: string;
  name: string;
  openTasks: number;
  overdueTasks: number;
  completedTasks: number;
  link: LinkedRef;
} | null;

export async function getCampaignSummary(
  db: DB,
  access: UserAccess,
  nameQuery: string,
  now: Date = new Date(),
): Promise<CampaignSummaryResult> {
  assertCan(access, "campanhas");
  const { data: clientes, error } = await db.from("clientes").select("id, data");
  if (error) throw new Error(error.message);
  const q = nameQuery.trim().toLowerCase();
  type RawCampanha = { id?: string; nome?: string };
  let found: { id: string; name: string } | null = null;
  for (const row of clientes ?? []) {
    const campanhas = ((row.data as { campanhas?: RawCampanha[] } | null)?.campanhas ??
      []) as RawCampanha[];
    const match = campanhas.find((c) => (c.nome ?? "").toLowerCase().includes(q));
    if (match?.id) {
      found = { id: match.id, name: match.nome ?? "(sem nome)" };
      break;
    }
  }
  if (!found) return null;
  const { tasks } = await fetchAllTasks(db);
  const campaignTasks = tasks.filter((t) => t.scope === "campanha" && t.scopeId === found!.id);
  return {
    id: found.id,
    name: found.name,
    openTasks: campaignTasks.filter((t) => isOpenStatus(t.status)).length,
    overdueTasks: campaignTasks.filter(
      (t) => isOpenStatus(t.status) && t.dueDate && t.dueDate < now,
    ).length,
    completedTasks: campaignTasks.filter((t) => t.status === "Concluído").length,
    link: { label: "campanha", href: "/time?section=campanhas" },
  };
}
