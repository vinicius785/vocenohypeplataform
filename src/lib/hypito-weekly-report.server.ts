/**
 * Motor server-side do relatório semanal do Hypito — SEMPRE via
 * `supabaseAdmin` (service-role), nunca importado por um arquivo que vai
 * pro bundle do cliente (mesma regra de `client.server.ts`). Só é chamado
 * por: `src/routes/api/cron/hypito-weekly-report.ts` (agendamento real) e
 * `src/lib/hypito-report.functions.ts` (ações administrativas — prévia,
 * enviar agora, reprocessar).
 *
 * Etapa determinística (pedido, seção 11): tudo aqui é cálculo/consulta
 * de dados reais — nenhum texto "criativo" é gerado nesta etapa, isso
 * fica isolado em `hypito-insights.ts` (puro, testável). O projeto não
 * tem hoje nenhuma integração de IA aprovada (grep confirmado em todo o
 * repo) — por isso não existe etapa de redação por modelo; o relatório é
 * 100% template determinístico, como o próprio pedido manda nesse caso
 * ("não adicionar uma dependência externa improvisada").
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { computeReportWindow, isWithin } from "@/lib/hypito-window";
import {
  renderWeeklyReportMessage,
  type WeeklyReportData,
  type PersonEvidence,
  type RiskItem,
  type NextWeekItem,
  type TaskRef,
} from "@/lib/hypito-insights";
import {
  fetchAllTasks,
  fetchMeetings,
  fetchTeamDirectory,
  type ParsedTask,
} from "@/lib/hypito-data.server";
import {
  HYPITO_AUTHOR_ID,
  HYPITO_NAME,
  HYPITO_AVATAR_URL,
  DEFAULT_WORKSPACE_ID,
  weeklyReportIdempotencyKey,
} from "@/lib/hypito";

type DB = SupabaseClient<Database>;

export type HypitoReportSettings = {
  workspaceId: string;
  enabled: boolean;
  channelSlug: string;
  weekday: number;
  hour: number;
  timezone: string;
  mentionUsers: boolean;
  includedUserIds: string[] | null;
  excludedUserIds: string[];
};

export async function getWeeklyReportSettings(
  db: DB,
  workspaceId: string = DEFAULT_WORKSPACE_ID,
): Promise<HypitoReportSettings> {
  const { data, error } = await db
    .from("hypito_report_settings")
    .select("*")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (error) throw new Error(`[hypito] settings: ${error.message}`);
  if (!data) {
    // Sem seed (workspace novo) — devolve o mesmo padrão da migration,
    // sem gravar nada (quem grava é `updateWeeklyReportSettings`).
    return {
      workspaceId,
      enabled: true,
      channelSlug: "geral",
      weekday: 5,
      hour: 17,
      timezone: "America/Sao_Paulo",
      mentionUsers: true,
      includedUserIds: null,
      excludedUserIds: [],
    };
  }
  return {
    workspaceId: data.workspace_id,
    enabled: data.enabled,
    channelSlug: data.channel_slug,
    weekday: data.weekday,
    hour: data.hour,
    timezone: data.timezone,
    mentionUsers: data.mention_users,
    includedUserIds: data.included_user_ids,
    excludedUserIds: data.excluded_user_ids,
  };
}

type ChannelRef = { id: string; convoId: string; isPrivate: boolean; allowedMemberIds: string[] };

/** Resolve o canal pelo `slug` ESTÁVEL — nunca pelo nome visível (pedido,
 * seção 2). Se não existir/estiver indisponível, devolve `null` — quem
 * chama deve registrar a falha e NUNCA publicar em outro canal. */
async function resolveChannelBySlug(db: DB, slug: string): Promise<ChannelRef | null> {
  const { data, error } = await db
    .from("chat_channels")
    .select("id, is_private, allowed_member_ids")
    .eq("slug", slug)
    .maybeSingle();
  if (error || !data) return null;
  return {
    id: data.id,
    convoId: `c:${data.id}`,
    isPrivate: data.is_private,
    allowedMemberIds: data.allowed_member_ids ?? [],
  };
}

type EligiblePerson = { id: string; name: string };

async function fetchEligiblePeople(
  db: DB,
  settings: HypitoReportSettings,
  channel: ChannelRef,
): Promise<EligiblePerson[]> {
  const people = await fetchTeamDirectory(db);
  const excluded = new Set(settings.excludedUserIds);
  const included = settings.includedUserIds ? new Set(settings.includedUserIds) : null;
  const channelMembers = channel.isPrivate ? new Set(channel.allowedMemberIds) : null;
  return people
    .filter((p) => !excluded.has(p.id))
    .filter((p) => !included || included.has(p.id))
    .filter((p) => !channelMembers || channelMembers.has(p.id));
}

function weekdayLabelPt(date: Date): string {
  return date.toLocaleDateString("pt-BR", { weekday: "long" });
}

/**
 * Etapa determinística: consolida tudo em `WeeklyReportData`. Nunca
 * inventa números — uma fonte que falha entra em `unavailableSources` e
 * simplesmente não contribui pras métricas/blocos (nunca vira zero
 * fabricado, ver pedido seção 16).
 */
export async function buildWeeklyReportData(
  db: DB,
  settings: HypitoReportSettings,
  channel: ChannelRef,
  now: Date = new Date(),
): Promise<WeeklyReportData> {
  const window = computeReportWindow(now);
  const [
    { tasks, unavailable: taskSourcesUnavailable },
    { meetings, unavailable: meetingsUnavailable },
    people,
  ] = await Promise.all([
    fetchAllTasks(db),
    fetchMeetings(db),
    fetchEligiblePeople(db, settings, channel),
  ]);

  const unavailableSources = [...taskSourcesUnavailable];
  if (meetingsUnavailable) unavailableSources.push("reuniões");
  // Projetos/campanhas (fase, aprovação, influenciadores) exigiriam
  // interpretar o schema de fases/aprovação de cada módulo — não
  // verificado com a mesma profundidade que tarefas/reuniões nesta
  // rodada. Marcado como indisponível em vez de arriscar um número
  // inventado (pedido, seção 16: "não inventar valores").
  unavailableSources.push("projetos (avanço de fase)", "campanhas (aprovações/influenciadores)");

  const isOpen = (t: ParsedTask) => t.status !== "Concluído" && t.status !== "Arquivado";
  const createdThisWeek = tasks.filter((t) =>
    isWithin(t.createdAt, window.periodStart, window.periodEnd),
  );
  const completedThisWeek = tasks.filter(
    (t) =>
      t.status === "Concluído" && isWithin(t.completedAt, window.periodStart, window.periodEnd),
  );
  const openTasks = tasks.filter(isOpen);
  const overdueOpen = openTasks.filter((t) => t.dueDate && t.dueDate.getTime() < now.getTime());
  const dueNext7Days = openTasks.filter(
    (t) => t.dueDate && isWithin(t.dueDate, window.next7DaysStart, window.next7DaysEnd),
  );
  const awaitingApproval = tasks.filter((t) => t.status === "Em aprovação");
  const noAssigneeDueSoon = dueNext7Days.filter((t) => t.assignees.length === 0);

  const toTaskRef = (t: ParsedTask): TaskRef => ({
    title: t.title,
    dueDateIso: t.dueDate ? t.dueDate.toISOString().slice(0, 10) : undefined,
    link: t.link,
  });

  const people_: PersonEvidence[] = people.map((person) => {
    const mine = (list: ParsedTask[]) => list.filter((t) => t.assignees.includes(person.name));
    return {
      userId: person.id,
      name: person.name,
      completedThisWeek: mine(completedThisWeek).map(toTaskRef),
      overdueOpen: mine(overdueOpen)
        .sort((a, b) => (a.dueDate?.getTime() ?? 0) - (b.dueDate?.getTime() ?? 0))
        .map(toTaskRef),
      dueNext7Days: mine(dueNext7Days)
        .sort((a, b) => (a.dueDate?.getTime() ?? 0) - (b.dueDate?.getTime() ?? 0))
        .map(toTaskRef),
      awaitingApproval: mine(awaitingApproval).map(toTaskRef),
    };
  });

  const highlights: string[] = [];
  if (completedThisWeek.length > 0)
    highlights.push(`${completedThisWeek.length} tarefas concluídas nesta semana.`);
  const meetingsHeldThisWeek = meetings.filter(
    (m) => m.status !== "Cancelada" && isWithin(m.when, window.periodStart, window.periodEnd),
  );
  if (meetingsHeldThisWeek.length > 0)
    highlights.push(`${meetingsHeldThisWeek.length} reuniões realizadas nesta semana.`);
  if (createdThisWeek.length > 0)
    highlights.push(
      `${createdThisWeek.length} novas tarefas criadas para organizar o trabalho da semana.`,
    );

  const risks: RiskItem[] = [];
  if (overdueOpen.length > 0) {
    const oldest = [...overdueOpen].sort(
      (a, b) => (a.dueDate?.getTime() ?? 0) - (b.dueDate?.getTime() ?? 0),
    )[0];
    const daysLate = oldest.dueDate
      ? Math.max(1, Math.round((now.getTime() - oldest.dueDate.getTime()) / 86_400_000))
      : undefined;
    risks.push({
      title:
        overdueOpen.length === 1
          ? `1 tarefa em atraso: "${oldest.title}"`
          : `${overdueOpen.length} tarefas em atraso, incluindo "${oldest.title}"`,
      detail: daysLate ? `vencida há ${daysLate} dia${daysLate === 1 ? "" : "s"}` : undefined,
      dueDateIso: oldest.dueDate?.toISOString().slice(0, 10),
      responsibleName: oldest.assignees[0],
      link: oldest.link,
    });
  }
  if (noAssigneeDueSoon.length > 0) {
    risks.push({
      title: `${noAssigneeDueSoon.length} tarefa${noAssigneeDueSoon.length === 1 ? "" : "s"} sem responsável com prazo nos próximos 7 dias`,
    });
  }
  if (awaitingApproval.length >= 3) {
    risks.push({ title: `${awaitingApproval.length} tarefas aguardando aprovação` });
  }

  const nextWeek: NextWeekItem[] = [];
  const upcomingMeetings = meetings
    .filter(
      (m) =>
        m.status !== "Cancelada" && isWithin(m.when, window.next7DaysStart, window.next7DaysEnd),
    )
    .sort((a, b) => (a.when?.getTime() ?? 0) - (b.when?.getTime() ?? 0));
  for (const m of upcomingMeetings.slice(0, 3)) {
    nextWeek.push({
      title: m.titulo,
      whenLabel: m.when ? weekdayLabelPt(m.when) : "em breve",
      link: { label: "reunião", href: "/time?section=reunioes" },
    });
  }
  const upcomingTasks = [...dueNext7Days].sort(
    (a, b) => (a.dueDate?.getTime() ?? 0) - (b.dueDate?.getTime() ?? 0),
  );
  for (const t of upcomingTasks.slice(0, Math.max(0, 5 - nextWeek.length))) {
    nextWeek.push({
      title: t.title,
      whenLabel: t.dueDate ? weekdayLabelPt(t.dueDate) : "em breve",
      link: t.link,
    });
  }

  return {
    weekStartIso: window.weekStartIso,
    weekLabelPt: `semana de ${new Date(`${window.weekStartIso}T00:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "long" })}`,
    generatedAtIso: now.toISOString(),
    metrics: {
      tasksCompleted: completedThisWeek.length,
      tasksCreated: createdThisWeek.length,
      tasksOpen: openTasks.length,
      tasksOverdue: overdueOpen.length,
      meetingsHeld: meetingsHeldThisWeek.length,
    },
    highlights,
    risks,
    nextWeek,
    people: people_,
    unavailableSources,
  };
}

export type RunTrigger = "schedule" | "manual";

export type RunOutcome =
  | { ok: true; skipped: false; runId: string; messageId: string }
  | { ok: true; skipped: true; runId: string; reason: string }
  | { ok: false; runId: string | null; error: string };

/**
 * Orquestra uma execução real (publica de verdade). Idempotência: reusa
 * (ou cria) a linha de `hypito_report_runs` cuja `idempotency_key` é
 * `weekly-report:{workspaceId}:{weekStart}` — só existe uma por semana
 * por workspace (índice único parcial, `preview=false`). Se já existe e
 * está `success`, não publica de novo. Se está `failed`, reprocessa
 * reaproveitando a MESMA linha (nunca cria uma segunda tentativa como
 * execução nova). Se está `running` há pouco tempo, assume uma execução
 * concorrente em andamento e não duplica.
 */
export async function runWeeklyReport(opts: {
  trigger: RunTrigger;
  triggeredBy?: string | null;
  workspaceId?: string;
  now?: Date;
}): Promise<RunOutcome> {
  const db = supabaseAdmin;
  const workspaceId = opts.workspaceId ?? DEFAULT_WORKSPACE_ID;
  const now = opts.now ?? new Date();
  const settings = await getWeeklyReportSettings(db, workspaceId);

  if (!settings.enabled) {
    return { ok: true, skipped: true, runId: "", reason: "automação pausada" };
  }

  const window = computeReportWindow(now);
  const idempotencyKey = weeklyReportIdempotencyKey(workspaceId, window.weekStartIso);

  const { data: existing } = await db
    .from("hypito_report_runs")
    .select("id, status, started_at")
    .eq("idempotency_key", idempotencyKey)
    .eq("preview", false)
    .maybeSingle();

  if (existing?.status === "success") {
    return { ok: true, skipped: true, runId: existing.id, reason: "já publicado nesta semana" };
  }
  if (existing?.status === "running") {
    const runningForMs = now.getTime() - new Date(existing.started_at).getTime();
    if (runningForMs < 10 * 60_000) {
      return { ok: true, skipped: true, runId: existing.id, reason: "execução em andamento" };
    }
    // "running" há mais de 10min é uma execução travada/anterior — segue
    // pra reprocessar reaproveitando a mesma linha, nunca criando outra.
  }

  let runId = existing?.id ?? null;
  if (!runId) {
    const { data: inserted, error: insertError } = await db
      .from("hypito_report_runs")
      .insert({
        workspace_id: workspaceId,
        idempotency_key: idempotencyKey,
        week_start: window.weekStartIso,
        status: "running",
        trigger: opts.trigger,
        triggered_by: opts.triggeredBy ?? null,
        preview: false,
        started_at: now.toISOString(),
      })
      .select("id")
      .single();
    if (insertError || !inserted) {
      return { ok: false, runId: null, error: insertError?.message ?? "falha ao criar execução" };
    }
    runId = inserted.id;
  } else {
    await db
      .from("hypito_report_runs")
      .update({ status: "running", started_at: now.toISOString(), error: null })
      .eq("id", runId);
  }

  try {
    const channel = await resolveChannelBySlug(db, settings.channelSlug);
    if (!channel) {
      throw new Error(`canal "${settings.channelSlug}" não encontrado/indisponível`);
    }

    const data = await buildWeeklyReportData(db, settings, channel, now);
    const { text, mentions } = renderWeeklyReportMessage(data, {
      mentionUsers: settings.mentionUsers,
    });

    const { data: messageRow, error: insertMsgError } = await db
      .from("chat_messages")
      .insert({
        convo_id: channel.convoId,
        author_id: HYPITO_AUTHOR_ID,
        author_name: HYPITO_NAME,
        author_photo: HYPITO_AVATAR_URL,
        text,
        mentions: mentions as unknown as never,
      })
      .select("id")
      .single();
    if (insertMsgError || !messageRow) {
      throw new Error(insertMsgError?.message ?? "falha ao publicar mensagem");
    }

    const mentionedUserIds = Array.from(new Set(mentions.map((m) => m.id)));
    if (mentionedUserIds.length > 0) {
      try {
        const { deliverPush } = await import("@/lib/push.functions");
        await deliverPush(mentionedUserIds, {
          title: HYPITO_NAME,
          body: text.slice(0, 140),
          url: "/time?section=chat",
        });
      } catch (pushErr) {
        console.warn(
          "[hypito] push do relatório semanal falhou (não bloqueia a publicação)",
          pushErr,
        );
      }
    }

    await db
      .from("hypito_report_runs")
      .update({
        status: "success",
        message_id: messageRow.id,
        channel_id: channel.id,
        mentioned_user_ids: mentionedUserIds,
        unavailable_sources: data.unavailableSources,
        report: data as unknown as never,
        finished_at: new Date().toISOString(),
        duration_ms: Date.now() - now.getTime(),
        error: null,
      })
      .eq("id", runId);

    return { ok: true, skipped: false, runId, messageId: messageRow.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .from("hypito_report_runs")
      .update({
        status: "failed",
        error: message,
        finished_at: new Date().toISOString(),
        duration_ms: Date.now() - now.getTime(),
      })
      .eq("id", runId);
    return { ok: false, runId, error: message };
  }
}

/**
 * Prévia — roda a MESMA etapa determinística + redação, mas nunca
 * publica no Chat e nunca notifica ninguém (pedido, seção 14: "a prévia
 * nunca deve publicar mensagem nem notificar usuários"). Grava um
 * registro `preview=true` só pra auditoria (fica fora da trava de
 * idempotência, que só olha `preview=false`).
 */
export async function generateWeeklyReportPreview(opts: {
  workspaceId?: string;
  triggeredBy?: string | null;
  now?: Date;
}): Promise<{ text: string; mentions: { id: string; label: string }[]; data: WeeklyReportData }> {
  const db = supabaseAdmin;
  const workspaceId = opts.workspaceId ?? DEFAULT_WORKSPACE_ID;
  const now = opts.now ?? new Date();
  const settings = await getWeeklyReportSettings(db, workspaceId);
  const channel = await resolveChannelBySlug(db, settings.channelSlug);
  if (!channel) throw new Error(`canal "${settings.channelSlug}" não encontrado/indisponível`);

  const data = await buildWeeklyReportData(db, settings, channel, now);
  const { text, mentions } = renderWeeklyReportMessage(data, {
    mentionUsers: settings.mentionUsers,
  });

  await db.from("hypito_report_runs").insert({
    workspace_id: workspaceId,
    idempotency_key: `${weeklyReportIdempotencyKey(workspaceId, data.weekStartIso)}:preview:${now.getTime()}`,
    week_start: data.weekStartIso,
    status: "success",
    trigger: "manual",
    triggered_by: opts.triggeredBy ?? null,
    preview: true,
    report: data as unknown as never,
    started_at: now.toISOString(),
    finished_at: new Date().toISOString(),
    duration_ms: 0,
    unavailable_sources: data.unavailableSources,
  });

  return { text, mentions: mentions.map((m) => ({ id: m.id, label: m.label })), data };
}
