/**
 * Alertas operacionais preventivos — 100% regras determinísticas sobre
 * dados estruturados reais (pedido, seção 11: "não utilizar IA para
 * inventar riscos"). Cobre um SUBCONJUNTO verificado dos 10 tipos
 * pedidos — os que dão pra calcular com precisão a partir do schema já
 * confirmado nesta sessão (tarefas, reuniões, influenciadores). Os
 * demais (campanha parada, aprovação bloqueando entrega, dependência
 * entre tarefas, projeto sem próxima ação) exigiriam interpretar schemas
 * que não foram verificados com a mesma profundidade — implementá-los
 * sem essa verificação arriscaria inventar um risco que não existe de
 * verdade, o que o próprio pedido proíbe explicitamente.
 *
 * Dedupe/cooldown via `hypito_alerts_sent` (uma linha por
 * usuário+tipo+item): nunca reenvia o mesmo alerta em aberto antes do
 * cooldown, e fecha (`resolved_at`) sozinho quando o risco some da
 * próxima varredura.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { fetchAllTasks, fetchMeetings, fetchTeamDirectory } from "@/lib/hypito-data.server";
import { HYPITO_AUTHOR_ID, HYPITO_NAME, HYPITO_AVATAR_URL } from "@/lib/hypito";
import type { LinkedRef } from "@/lib/hypito-insights";
import {
  HYPITO_MESSAGE_VERSION,
  type HypitoMessage,
  type HypitoEntityRef,
  type OverdueAlertItem,
} from "@/lib/hypito-messages";

type DB = SupabaseClient<Database>;

export type AlertType =
  | "tarefa_atrasada"
  | "tarefa_sem_responsavel"
  | "prioritaria_sem_prazo"
  | "reuniao_sem_confirmacao"
  | "influenciador_aguardando_retorno";

export type DetectedAlert = {
  type: AlertType;
  userId: string;
  itemKey: string;
  title: string;
  detail?: string;
  dueDateIso?: string;
  responsibleName?: string;
  link: LinkedRef;
  /** Só presente em `tarefa_atrasada` — necessário pro card acionável
   * (pedido, seção 2: botões Abrir/Concluir/Replanejar/Bloquear), nunca
   * inventado pros demais tipos de alerta. */
  taskId?: string;
  scope?: "projeto" | "campanha" | "marketing";
  scopeId?: string;
  scopeName?: string;
  priority?: string;
};

const COOLDOWN_DAYS: Record<AlertType, number> = {
  tarefa_atrasada: 3,
  tarefa_sem_responsavel: 3,
  prioritaria_sem_prazo: 5,
  reuniao_sem_confirmacao: 1,
  influenciador_aguardando_retorno: 2,
};

const ALERT_LABEL: Record<AlertType, string> = {
  tarefa_atrasada: "Tarefa atrasada",
  tarefa_sem_responsavel: "Entrega sem responsável",
  prioritaria_sem_prazo: "Tarefa prioritária sem prazo",
  reuniao_sem_confirmacao: "Reunião sem confirmação",
  influenciador_aguardando_retorno: "Influenciador aguardando retorno",
};

async function detectAlerts(db: DB): Promise<DetectedAlert[]> {
  const alerts: DetectedAlert[] = [];
  const now = new Date();
  const { tasks } = await fetchAllTasks(db);
  const isOpen = (s: string) => s !== "Concluído" && s !== "Arquivado";

  for (const t of tasks) {
    if (!isOpen(t.status)) continue;
    for (const assigneeName of t.assignees) {
      if (t.dueDate && t.dueDate.getTime() < now.getTime()) {
        alerts.push({
          type: "tarefa_atrasada",
          userId: assigneeName, // resolvido pra id mais abaixo
          itemKey: t.id,
          title: t.title,
          dueDateIso: t.dueDate.toISOString().slice(0, 10),
          responsibleName: assigneeName,
          link: t.link,
          taskId: t.id,
          scope: t.scope,
          scopeId: t.scopeId,
          priority: t.priority,
        });
      }
    }
    if (t.assignees.length === 0 && t.dueDate) {
      const daysUntil = (t.dueDate.getTime() - now.getTime()) / 86_400_000;
      if (daysUntil >= 0 && daysUntil <= 3) {
        // Sem responsável — ninguém específico pra avisar; entra só se
        // houver um administrador "dono" do módulo, mas como não existe
        // esse conceito, marcamos pro requester genérico ficar de fora
        // (avisado só via relatório semanal, que já cobre isso hoje).
        continue;
      }
    }
    if (
      (t.priority === "Urgente" || t.priority === "Alta") &&
      !t.dueDate &&
      t.assignees.length > 0
    ) {
      for (const assigneeName of t.assignees) {
        alerts.push({
          type: "prioritaria_sem_prazo",
          userId: assigneeName,
          itemKey: t.id,
          title: t.title,
          responsibleName: assigneeName,
          link: t.link,
        });
      }
    }
  }

  const { meetings } = await fetchMeetings(db);
  for (const m of meetings) {
    if (m.status === "Cancelada" || !m.when) continue;
    const daysUntil = (m.when.getTime() - now.getTime()) / 86_400_000;
    if (daysUntil < 0 || daysUntil > 7) continue;
    for (const participantId of m.participanteIds) {
      if (m.confirmedBy.includes(participantId)) continue;
      alerts.push({
        type: "reuniao_sem_confirmacao",
        userId: participantId,
        itemKey: m.id,
        title: m.titulo,
        dueDateIso: m.when.toISOString().slice(0, 10),
        link: { label: "reunião", href: "/time?section=reunioes" },
      });
    }
  }

  // Influenciador aguardando retorno — mesmo campo/SLA já usado em
  // `InfluencerBoard.tsx` (`statusUpdatedAt` + `APPROVAL_SLA_DAYS = 3`
  // pra status "ENVIADO_AO_CLIENTE"), reaproveitado aqui em vez de
  // reinventar uma regra de atraso paralela.
  const APPROVAL_SLA_DAYS = 3;
  const { data: influRows } = await db
    .from("campanha_influenciadores")
    .select("id, campanha_id, data");
  type RawInflu = {
    nome?: string;
    status?: string;
    statusUpdatedAt?: string;
    clienteReprovacao?: unknown;
    ownerId?: string;
  };
  for (const row of influRows ?? []) {
    const d = (row.data ?? {}) as RawInflu;
    if (d.status !== "ENVIADO_AO_CLIENTE" || d.clienteReprovacao || !d.statusUpdatedAt) continue;
    const days = (now.getTime() - new Date(d.statusUpdatedAt).getTime()) / 86_400_000;
    if (days < APPROVAL_SLA_DAYS || !d.ownerId) continue;
    alerts.push({
      type: "influenciador_aguardando_retorno",
      userId: d.ownerId,
      itemKey: row.id,
      title: d.nome || "Influenciador",
      detail: `aguardando retorno há ${Math.floor(days)} dia(s)`,
      link: { label: "campanha", href: "/time?section=campanhas" },
    });
  }

  return alerts;
}

/** Resolve `userId` (hoje, nome de responsável em tarefas) pro id real —
 * alertas de tarefa só entram na fila se o nome bater com alguém do
 * time; nunca inventa um destinatário. */
async function resolveAlertRecipients(db: DB, alerts: DetectedAlert[]): Promise<DetectedAlert[]> {
  const people = await fetchTeamDirectory(db);
  const byName = new Map(people.map((p) => [p.name, p.id]));
  const resolved: DetectedAlert[] = [];
  for (const a of alerts) {
    if (a.type === "reuniao_sem_confirmacao" || a.type === "influenciador_aguardando_retorno") {
      resolved.push(a); // userId já é um id real (participante/owner)
      continue;
    }
    const id = byName.get(a.userId);
    if (id) resolved.push({ ...a, userId: id });
  }
  return resolved;
}

export type AlertRunResult = { userId: string; alertsSent: number }[];

export async function runPreventiveAlerts(): Promise<AlertRunResult> {
  const db = supabaseAdmin;
  const detected = await resolveAlertRecipients(db, await detectAlerts(db));

  const { data: existingRows } = await db.from("hypito_alerts_sent").select("*");
  const existing = existingRows ?? [];
  const existingByKey = new Map(
    existing.map((r) => [`${r.user_id}:${r.alert_type}:${r.item_key}`, r]),
  );
  const detectedKeys = new Set(detected.map((a) => `${a.userId}:${a.type}:${a.itemKey}`));

  // Fecha alertas que já não são detectados mais (risco resolvido).
  const toResolve = existing.filter(
    (r) => !r.resolved_at && !detectedKeys.has(`${r.user_id}:${r.alert_type}:${r.item_key}`),
  );
  for (const r of toResolve) {
    await db
      .from("hypito_alerts_sent")
      .update({ resolved_at: new Date().toISOString() })
      .eq("id", r.id);
  }

  const toDeliverByUser = new Map<string, DetectedAlert[]>();
  const now = Date.now();
  for (const alert of detected) {
    const key = `${alert.userId}:${alert.type}:${alert.itemKey}`;
    const existingRow = existingByKey.get(key);
    const cooldownMs = COOLDOWN_DAYS[alert.type] * 86_400_000;
    if (existingRow) {
      const withinCooldown = now - new Date(existingRow.last_sent_at).getTime() < cooldownMs;
      if (withinCooldown && !existingRow.resolved_at) continue; // não repete sem mudança relevante
      await db
        .from("hypito_alerts_sent")
        .update({ last_sent_at: new Date().toISOString(), resolved_at: null })
        .eq("id", existingRow.id);
    } else {
      await db
        .from("hypito_alerts_sent")
        .insert({ user_id: alert.userId, alert_type: alert.type, item_key: alert.itemKey });
    }
    const list = toDeliverByUser.get(alert.userId) ?? [];
    list.push(alert);
    toDeliverByUser.set(alert.userId, list);
  }

  const result: AlertRunResult = [];
  for (const [userId, alerts] of toDeliverByUser) {
    const lines = ["⚠️ Pontos de atenção identificados:"];
    for (const a of alerts.slice(0, 5)) {
      const parts = [ALERT_LABEL[a.type], `"${a.title}"`];
      if (a.dueDateIso) parts.push(`prazo: ${new Date(a.dueDateIso).toLocaleDateString("pt-BR")}`);
      lines.push(`• ${parts.join(" — ")} → ${a.link.href}`);
    }
    const convoId = "dm:" + [userId, HYPITO_AUTHOR_ID].sort().join("|");
    const overdueOnly = alerts.filter((a) => a.type === "tarefa_atrasada" && a.taskId);
    const hypitoPayload = buildOverdueAlertPayload(overdueOnly, new Date(now));
    await db.from("chat_messages").insert({
      convo_id: convoId,
      author_id: HYPITO_AUTHOR_ID,
      author_name: HYPITO_NAME,
      author_photo: HYPITO_AVATAR_URL,
      text: lines.join("\n"),
      hypito_payload: (hypitoPayload as unknown as never) ?? null,
    });
    result.push({ userId, alertsSent: alerts.length });
  }
  return result;
}

/** Card acionável do alerta de atraso (pedido, seção 2: botões Abrir/
 * Concluir/Replanejar/Bloquear por tarefa) — só construído quando há pelo
 * menos um `tarefa_atrasada` real nesta entrega; os demais tipos de
 * alerta (reunião, influenciador, prioridade sem prazo) continuam só em
 * texto, já que os botões pedidos são especificamente de tarefa. */
function buildOverdueAlertPayload(overdue: DetectedAlert[], now: Date): HypitoMessage | null {
  if (overdue.length === 0) return null;
  const items: OverdueAlertItem[] = overdue.slice(0, 5).map((a) => {
    const task: HypitoEntityRef = {
      type: "task",
      id: a.taskId!,
      name: a.title,
      meta: { scope: a.scope ?? null, scopeId: a.scopeId ?? null },
    };
    const daysLate = a.dueDateIso
      ? Math.max(1, Math.floor((now.getTime() - new Date(a.dueDateIso).getTime()) / 86_400_000))
      : 0;
    return {
      task,
      scope: null,
      daysLate,
      priority: (a.priority as OverdueAlertItem["priority"]) ?? "Normal",
    };
  });
  return {
    version: HYPITO_MESSAGE_VERSION,
    kind: "overdue_alert",
    title: "Tarefas atrasadas",
    textFallback: `Você tem ${overdue.length} tarefa${overdue.length === 1 ? "" : "s"} atrasada${overdue.length === 1 ? "" : "s"}.`,
    state: "default",
    timestamp: now.toISOString(),
    actions: [],
    data: { items, totalCount: overdue.length },
  };
}
