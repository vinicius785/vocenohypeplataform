/**
 * Leitura de dados operacionais compartilhada por TODAS as funções do
 * Hypito (relatório semanal, resumo diário, ferramentas de consulta,
 * alertas) — um único lugar que sabe como `projeto_tarefas`/
 * `campanha_tarefas`/`marketing_standalone_tasks`/`reunioes` guardam
 * tudo em `data` (JSONB), pra nunca duplicar essa leitura em cada
 * arquivo novo (extraído de `hypito-weekly-report.server.ts`).
 *
 * Server-only (usa `supabaseAdmin` implicitamente via o client injetado
 * pelas funções que chamam), nunca importado por um arquivo que vai pro
 * bundle do cliente.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { LinkedRef } from "@/lib/hypito-insights";

type DB = SupabaseClient<Database>;

type RawTaskData = {
  title?: string;
  status?: string;
  priority?: string;
  dueDate?: string;
  createdAt?: string;
  completedAt?: string;
  assignee?: string;
  assignees?: string[];
};

export type ParsedTask = {
  id: string;
  title: string;
  status: string;
  priority?: string;
  dueDate?: Date | null;
  createdAt: Date | null;
  completedAt: Date | null;
  assignees: string[];
  scope: "projeto" | "campanha" | "marketing";
  scopeId?: string;
  link: LinkedRef;
};

export function parseDateLoose(v: string | undefined | null): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseTaskRow(
  id: string,
  data: unknown,
  fallbackCreatedAt: string,
  scope: ParsedTask["scope"],
  scopeId: string | undefined,
  link: LinkedRef,
): ParsedTask {
  const d = (data ?? {}) as RawTaskData;
  const assignees = d.assignees?.length ? d.assignees : d.assignee ? [d.assignee] : [];
  return {
    id,
    title: d.title?.trim() || "(sem título)",
    status: d.status || "Aberto",
    priority: d.priority,
    dueDate: parseDateLoose(d.dueDate),
    createdAt: parseDateLoose(d.createdAt) ?? parseDateLoose(fallbackCreatedAt),
    completedAt: parseDateLoose(d.completedAt),
    assignees,
    scope,
    scopeId,
    link,
  };
}

export async function fetchAllTasks(
  db: DB,
): Promise<{ tasks: ParsedTask[]; unavailable: string[] }> {
  const unavailable: string[] = [];
  const tasks: ParsedTask[] = [];

  const projetos = await db.from("projeto_tarefas").select("id, projeto_id, data, created_at");
  if (projetos.error) {
    unavailable.push("tarefas de projeto");
  } else {
    for (const row of projetos.data ?? []) {
      tasks.push(
        parseTaskRow(row.id, row.data, row.created_at, "projeto", row.projeto_id, {
          label: "tarefa",
          href: `/projeto/${row.projeto_id}?taskId=${row.id}`,
        }),
      );
    }
  }

  const campanhas = await db.from("campanha_tarefas").select("id, campanha_id, data, created_at");
  if (campanhas.error) {
    unavailable.push("tarefas de campanha");
  } else {
    for (const row of campanhas.data ?? []) {
      tasks.push(
        parseTaskRow(row.id, row.data, row.created_at, "campanha", row.campanha_id, {
          label: "campanha",
          href: `/time?section=campanhas`,
        }),
      );
    }
  }

  const standalone = await db.from("marketing_standalone_tasks").select("id, data, created_at");
  if (standalone.error) {
    unavailable.push("tarefas avulsas de marketing");
  } else {
    for (const row of standalone.data ?? []) {
      tasks.push(
        parseTaskRow(row.id, row.data, row.created_at, "marketing", undefined, {
          label: "marketing",
          href: `/time?section=campanhas`,
        }),
      );
    }
  }

  return { tasks, unavailable };
}

type RawMeetingData = {
  titulo?: string;
  data?: string;
  hora?: string;
  duracao?: number;
  status?: string;
  local?: string;
  com?: string;
  criadorId?: string;
  participanteIds?: string[];
  confirmedBy?: string[];
};

export type ParsedMeeting = {
  id: string;
  titulo: string;
  when: Date | null;
  durationMin: number;
  status: string;
  local?: string;
  criadorId?: string;
  participanteIds: string[];
  confirmedBy: string[];
};

export async function fetchMeetings(
  db: DB,
): Promise<{ meetings: ParsedMeeting[]; unavailable: boolean }> {
  const { data, error } = await db.from("reunioes").select("id, data");
  if (error) return { meetings: [], unavailable: true };
  const meetings: ParsedMeeting[] = (data ?? []).map((row) => {
    const d = (row.data ?? {}) as RawMeetingData;
    const when = d.data && d.hora ? parseDateLoose(`${d.data}T${d.hora}:00`) : null;
    return {
      id: row.id,
      titulo: d.titulo || "Reunião",
      when,
      durationMin: d.duracao ?? 30,
      status: d.status || "Pendente",
      local: d.local || d.com,
      criadorId: d.criadorId,
      participanteIds: d.participanteIds ?? [],
      confirmedBy: d.confirmedBy ?? [],
    };
  });
  return { meetings, unavailable: false };
}

export function isMeetingParticipant(m: ParsedMeeting, userId: string): boolean {
  return m.criadorId === userId || m.participanteIds.includes(userId);
}

export type DirectoryPerson = { id: string; name: string; email: string | null };

export async function fetchTeamDirectory(db: DB): Promise<DirectoryPerson[]> {
  const { data, error } = await db.from("profiles").select("id, full_name, email");
  if (error) throw new Error(`[hypito] profiles: ${error.message}`);
  return (data ?? []).map((p) => ({
    id: p.id,
    name: (p.full_name || p.email || "").trim() || "Sem nome",
    email: p.email,
  }));
}
