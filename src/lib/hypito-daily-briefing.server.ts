/**
 * Resumo diário pessoal do Hypito — mesma arquitetura do relatório
 * semanal (idempotência por linha, `supabaseAdmin`, template
 * determinístico), só que por PESSOA e em mensagem DIRETA, nunca no
 * canal Geral (pedido, seção 6: "mensagem privada, nunca no canal
 * geral").
 *
 * Chave de idempotência: `daily-briefing:{workspaceId}:{userId}:{localDate}`
 * — uma por pessoa por dia, através do índice único em
 * `hypito_daily_briefing_runs.idempotency_key`.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { todayIsoInBrasilia, weekdayIndexInBrasilia } from "@/lib/timezone";
import { zonedWallTimeToUtcMs } from "@/lib/hypito-window";
import {
  fetchAllTasks,
  fetchMeetings,
  fetchTeamDirectory,
  isMeetingParticipant,
} from "@/lib/hypito-data.server";
import {
  HYPITO_AUTHOR_ID,
  HYPITO_NAME,
  HYPITO_AVATAR_URL,
  DEFAULT_WORKSPACE_ID,
} from "@/lib/hypito";

type DB = SupabaseClient<Database>;

export function dailyBriefingIdempotencyKey(
  workspaceId: string,
  userId: string,
  localDate: string,
): string {
  return `daily-briefing:${workspaceId}:${userId}:${localDate}`;
}

/** Só roda em dias úteis (segunda a sexta), 08:30 America/Sao_Paulo — o
 * `schedule` do cron já só dispara nesses dias/hora; esta checagem é
 * cinto-e-suspensório, igual à do relatório semanal. */
export function isBriefingWeekday(now: Date = new Date()): boolean {
  const dow = weekdayIndexInBrasilia(now);
  return dow >= 1 && dow <= 5;
}

function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] || fullName;
}

function fmtTime(d: Date): string {
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

async function renderBriefingFor(
  db: DB,
  person: { id: string; name: string },
  now: Date,
): Promise<string | null> {
  const todayIso = todayIsoInBrasilia(now);
  const dayStart = new Date(zonedWallTimeToUtcMs(todayIso, 0, 0, "America/Sao_Paulo"));
  const dayEnd = new Date(dayStart.getTime() + 86_400_000);

  const [{ tasks }, { meetings }] = await Promise.all([fetchAllTasks(db), fetchMeetings(db)]);
  const mine = tasks.filter((t) => t.assignees.includes(person.name));
  const isOpen = (s: string) => s !== "Concluído" && s !== "Arquivado";

  const dueToday = mine.filter(
    (t) => isOpen(t.status) && t.dueDate && t.dueDate >= dayStart && t.dueDate < dayEnd,
  );
  const overdue = mine.filter((t) => isOpen(t.status) && t.dueDate && t.dueDate < dayStart);
  const awaitingApproval = mine.filter((t) => t.status === "Em aprovação");

  const myMeetingsToday = meetings
    .filter(
      (m) =>
        m.status !== "Cancelada" &&
        isMeetingParticipant(m, person.id) &&
        m.when &&
        m.when >= dayStart &&
        m.when < dayEnd,
    )
    .sort((a, b) => (a.when?.getTime() ?? 0) - (b.when?.getTime() ?? 0));

  // Sem nenhum dado relevante — nunca preenche com frase genérica
  // inventada (pedido, seção 6: "não enviar blocos vazios"). Ainda assim
  // manda uma mensagem curta, só sem seções vazias.
  const hasAnything =
    dueToday.length + overdue.length + awaitingApproval.length + myMeetingsToday.length > 0;

  const lines: string[] = [`Bom dia, ${firstName(person.name)}! Este é o seu resumo de hoje.`];

  if (overdue.length > 0) {
    lines.push(
      "",
      `⚠️ Atrasadas (${overdue.length}):`,
      ...overdue.slice(0, 3).map((t) => `• ${t.title} → ${t.link.href}`),
    );
  }
  if (dueToday.length > 0) {
    lines.push(
      "",
      `📋 Para hoje (${dueToday.length}):`,
      ...dueToday.slice(0, 5).map((t) => `• ${t.title} → ${t.link.href}`),
    );
  }
  if (myMeetingsToday.length > 0) {
    lines.push(
      "",
      `📅 Reuniões de hoje:`,
      ...myMeetingsToday.slice(0, 5).map((m) => `• ${fmtTime(m.when!)} — ${m.titulo}`),
    );
  }
  if (awaitingApproval.length > 0) {
    lines.push("", `⏳ Aguardando aprovação: ${awaitingApproval.length}`);
  }

  const focusItem = overdue[0] ?? dueToday[0];
  if (focusItem) {
    lines.push("", `🎯 Foco recomendado: "${focusItem.title}" → ${focusItem.link.href}`);
  }

  lines.push(
    "",
    "Ver minhas tarefas → /time?section=inicio",
    "Abrir agenda → /time?section=reunioes",
    "Iniciar Modo Foco → /foco",
  );

  return hasAnything || focusItem
    ? lines.join("\n")
    : `${lines[0]}\n\nNenhuma pendência para hoje. Bom trabalho!`;
}

export type DailyBriefingOutcome = {
  userId: string;
  status: "sent" | "skipped" | "failed";
  reason?: string;
};

export async function runDailyBriefings(
  workspaceId: string = DEFAULT_WORKSPACE_ID,
  now: Date = new Date(),
): Promise<DailyBriefingOutcome[]> {
  const db = supabaseAdmin;
  const localDate = todayIsoInBrasilia(now);
  const people = await fetchTeamDirectory(db);
  const { data: prefsRows } = await db
    .from("hypito_user_prefs")
    .select("user_id, daily_briefing_enabled");
  const disabled = new Set(
    (prefsRows ?? []).filter((p) => !p.daily_briefing_enabled).map((p) => p.user_id),
  );

  const outcomes: DailyBriefingOutcome[] = [];
  for (const person of people) {
    if (disabled.has(person.id)) {
      outcomes.push({ userId: person.id, status: "skipped", reason: "preferência desativada" });
      continue;
    }
    const idempotencyKey = dailyBriefingIdempotencyKey(workspaceId, person.id, localDate);
    const { data: existing } = await db
      .from("hypito_daily_briefing_runs")
      .select("id, status")
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    if (existing && existing.status !== "failed") {
      outcomes.push({ userId: person.id, status: "skipped", reason: "já enviado hoje" });
      continue;
    }

    let runId = existing?.id ?? null;
    if (!runId) {
      const { data: inserted, error: insertErr } = await db
        .from("hypito_daily_briefing_runs")
        .insert({
          workspace_id: workspaceId,
          user_id: person.id,
          local_date: localDate,
          idempotency_key: idempotencyKey,
        })
        .select("id")
        .single();
      if (insertErr || !inserted) {
        outcomes.push({ userId: person.id, status: "failed", reason: insertErr?.message });
        continue;
      }
      runId = inserted.id;
    }

    try {
      const text = await renderBriefingFor(db, person, now);
      if (!text) throw new Error("nada a enviar");
      const convoId = "dm:" + [person.id, HYPITO_AUTHOR_ID].sort().join("|");
      const { data: message, error: msgError } = await db
        .from("chat_messages")
        .insert({
          convo_id: convoId,
          author_id: HYPITO_AUTHOR_ID,
          author_name: HYPITO_NAME,
          author_photo: HYPITO_AVATAR_URL,
          text,
        })
        .select("id")
        .single();
      if (msgError || !message) throw new Error(msgError?.message ?? "falha ao publicar");

      await db
        .from("hypito_daily_briefing_runs")
        .update({
          status: "success",
          message_id: message.id,
          finished_at: new Date().toISOString(),
        })
        .eq("id", runId);
      outcomes.push({ userId: person.id, status: "sent" });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await db
        .from("hypito_daily_briefing_runs")
        .update({ status: "failed", error: message, finished_at: new Date().toISOString() })
        .eq("id", runId);
      outcomes.push({ userId: person.id, status: "failed", reason: message });
    }
  }
  return outcomes;
}
