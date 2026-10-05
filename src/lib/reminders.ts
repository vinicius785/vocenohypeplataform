import { BRASILIA_TZ, todayIsoInBrasilia } from "./timezone";
import type { ReminderPriority, ReminderRow } from "./reminders.functions";

/**
 * Modelo de leitura do "Lembretes" — puro, sem dependência de Supabase,
 * pra ser testável e reaproveitado entre o card compacto e a visão
 * completa (`RemindersFullView`). Único lugar que decide o que é
 * "atrasado"/"hoje"/"próximo"/"sem data" — nunca duplicado.
 */
export type Reminder = {
  id: string;
  title: string;
  notes?: string;
  dueAt?: string; // ISO
  priority: ReminderPriority;
  completedAt?: string; // ISO
  createdAt: string;
};

export function rowToReminder(row: ReminderRow): Reminder {
  return {
    id: row.id,
    title: row.title,
    notes: row.notes ?? undefined,
    dueAt: row.due_at ?? undefined,
    priority: row.priority,
    completedAt: row.completed_at ?? undefined,
    createdAt: row.created_at,
  };
}

export type ReminderBucket = "atrasado" | "hoje" | "proximo" | "sem_data";

/** Dia calendário no fuso de Brasília — nunca UTC cru (ver `comercial-
 * metrics.ts`'s `brasiliaDateKey` pro mesmo bug já corrigido lá). */
function dateKeyBrasilia(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: BRASILIA_TZ });
}

export function reminderBucket(r: Pick<Reminder, "dueAt">): ReminderBucket {
  if (!r.dueAt) return "sem_data";
  const today = todayIsoInBrasilia();
  const dueDay = dateKeyBrasilia(r.dueAt);
  if (dueDay < today) return "atrasado";
  if (dueDay === today) return "hoje";
  return "proximo";
}

const BUCKET_RANK: Record<ReminderBucket, number> = {
  atrasado: 0,
  hoje: 1,
  proximo: 2,
  sem_data: 3,
};

/** Ordem do card compacto: vencidos primeiro, depois hoje, depois
 * próximos (por data mais próxima), por último sem data (por criação) —
 * nunca por prioridade sozinha (prioridade é só um destaque visual, não
 * reordena a fila). */
export function sortReminders(list: Reminder[]): Reminder[] {
  return [...list].sort((a, b) => {
    const ba = reminderBucket(a);
    const bb = reminderBucket(b);
    if (ba !== bb) return BUCKET_RANK[ba] - BUCKET_RANK[bb];
    if (ba === "sem_data") return a.createdAt.localeCompare(b.createdAt);
    return (a.dueAt as string).localeCompare(b.dueAt as string);
  });
}

export function pendingReminders(list: Reminder[]): Reminder[] {
  return sortReminders(list.filter((r) => !r.completedAt));
}

export type ReminderGroups = {
  atrasados: Reminder[];
  hoje: Reminder[];
  proximos: Reminder[];
  semData: Reminder[];
  concluidos: Reminder[];
};

/** Agrupamento da visão completa ("Ver todos") — mesmas regras de bucket
 * do card compacto, só que exaustivo (todos os itens, não só os 5
 * primeiros) e com a seção extra de concluídos. */
export function groupReminders(list: Reminder[]): ReminderGroups {
  const groups: ReminderGroups = {
    atrasados: [],
    hoje: [],
    proximos: [],
    semData: [],
    concluidos: [],
  };
  for (const r of list) {
    if (r.completedAt) {
      groups.concluidos.push(r);
      continue;
    }
    const bucket = reminderBucket(r);
    if (bucket === "atrasado") groups.atrasados.push(r);
    else if (bucket === "hoje") groups.hoje.push(r);
    else if (bucket === "proximo") groups.proximos.push(r);
    else groups.semData.push(r);
  }
  groups.atrasados = sortReminders(groups.atrasados);
  groups.hoje = sortReminders(groups.hoje);
  groups.proximos = sortReminders(groups.proximos);
  groups.semData = sortReminders(groups.semData);
  groups.concluidos.sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""));
  return groups;
}

/* ---------------- Rótulos de data (Home) ---------------- */

/** Lembrete "só com data" é gravado à meia-noite LOCAL (00:00 em Brasília = 03:00Z): sem horário. */
function hasTimeBrasilia(iso: string): boolean {
  return (
    new Date(iso).toLocaleTimeString("pt-BR", {
      timeZone: BRASILIA_TZ,
      hour: "2-digit",
      minute: "2-digit",
    }) !== "00:00"
  );
}

/** "Hoje · 18:00", "Amanhã · 10:00", "07 out." — o horário só quando foi definido. */
export function fmtDue(iso: string): string {
  const d = new Date(iso);
  const hasTime = hasTimeBrasilia(iso);
  const time = d.toLocaleTimeString("pt-BR", {
    timeZone: BRASILIA_TZ,
    hour: "2-digit",
    minute: "2-digit",
  });
  const today = todayIsoInBrasilia();
  const tomorrow = new Date(`${today}T12:00:00-03:00`);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const key = dateKeyBrasilia(iso);
  const label =
    key === today
      ? "Hoje"
      : key === tomorrow.toLocaleDateString("en-CA", { timeZone: BRASILIA_TZ })
        ? "Amanhã"
        : d
            .toLocaleDateString("pt-BR", { timeZone: BRASILIA_TZ, day: "2-digit", month: "short" })
            .replace(" de ", " ");
  return hasTime ? `${label} · ${time}` : label;
}

/** "Atrasado · 2h" (venceu hoje, com horário) ou "Atrasado · 03/10". */
export function fmtOverdue(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const hasTime = hasTimeBrasilia(iso);
  if (hasTime && dateKeyBrasilia(iso) === todayIsoInBrasilia()) {
    const mins = Math.max(1, Math.round((now.getTime() - d.getTime()) / 60000));
    return `Atrasado · ${mins < 60 ? `${mins}min` : `${Math.floor(mins / 60)}h`}`;
  }
  const short = d.toLocaleDateString("pt-BR", {
    timeZone: BRASILIA_TZ,
    day: "2-digit",
    month: "2-digit",
  });
  return `Atrasado · ${short}`;
}
