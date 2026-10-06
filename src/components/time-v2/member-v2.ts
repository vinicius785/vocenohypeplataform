import { formatResponseDuration, type MemberResponseTime } from "@/lib/member-response-time";
import type { ScoreOperacionalV2 } from "@/lib/performance-engine";
import type {
  ProfileAttendance,
  ProfileCompletion,
  ProfileDeadlineChange,
} from "@/components/team/ScoreOperacionalPanel";
import type { HistoricoEvento } from "@/lib/entrega-historico";
import type { DashTask } from "@/lib/task-aggregation";
import type { TaskDependency } from "@/lib/task-dependencies-store";
import type { MemberInsight } from "./member-metrics";

/** Regras puras da V2 do detalhe do membro (só leitura dos dados que já existem). */

/* ---------------- Score: só com amostra confiável ---------------- */

/** Mínimo de tarefas na base do período para mostrar o score como número "de verdade". */
export const MIN_SCORE_TASKS = 20;

export type ScoreView =
  | { mode: "sem_dados" }
  | { mode: "insuficiente"; amostra: number; previa: number | null }
  | { mode: "ok"; amostra: number; score: number };

/** O motor continua calculando como sempre; aqui só se decide o QUE mostrar. Abaixo da amostra
 * mínima não se finge precisão: "Dados insuficientes para score" (com a prévia só como detalhe). */
export function scoreView(
  score: Pick<ScoreOperacionalV2, "score" | "amostra" | "dataState">,
): ScoreView {
  if (score.dataState === "sem_dados" || score.score == null || score.amostra <= 0)
    return { mode: "sem_dados" };
  if (score.amostra < MIN_SCORE_TASKS)
    return { mode: "insuficiente", amostra: score.amostra, previa: score.score };
  return { mode: "ok", amostra: score.amostra, score: score.score };
}

/* ---------------- Visão geral: atenção e leitura (no máximo 3) ---------------- */

const KIND_PRIORITY: Record<MemberInsight["kind"], number> = {
  atencao: 0,
  dependencia: 1,
  tendencia: 2,
  operacao: 3,
};

/** Os itens que merecem ser vistos agora: atenção primeiro, depois dependência, tendência e
 * operação. Nunca mais que `max`. Vazio = "Tudo sob controle". */
export function overviewHighlights(insights: MemberInsight[], max = 3): MemberInsight[] {
  return [...insights]
    .map((i, idx) => ({ i, idx }))
    .sort((a, b) => KIND_PRIORITY[a.i.kind] - KIND_PRIORITY[b.i.kind] || a.idx - b.idx)
    .slice(0, max)
    .map((x) => x.i);
}

/* ---------------- Comunicação: velocidade de resposta, sem julgamento ---------------- */

export type CommunicationReading =
  | { state: "sem_dados" }
  | {
      state: "ok";
      averageSeconds: number;
      /** Onde demora mais (só quando as duas médias existem e diferem de verdade). */
      slowest: { label: "Mensagens diretas" | "Menções"; seconds: number } | null;
      /** Comparação com a média do time, quando ela existe. */
      vsTeam: "abaixo" | "acima" | "similar" | null;
      recommendation: string | null;
    };

/** Diferença mínima (relativa) para dizer "abaixo/acima" da média do time ou "demora mais em". */
export const COMM_DIFF_RATIO = 1.2;

export function communicationReading(
  data: MemberResponseTime | null,
  teamAverageSeconds: number | null,
): CommunicationReading {
  const avg = data?.all.averageSeconds ?? null;
  if (!data || avg == null) return { state: "sem_dados" };

  const d = data.direct.averageSeconds;
  const m = data.mention.averageSeconds;
  let slowest: { label: "Mensagens diretas" | "Menções"; seconds: number } | null = null;
  if (d != null && m != null) {
    if (d >= m * COMM_DIFF_RATIO) slowest = { label: "Mensagens diretas", seconds: d };
    else if (m >= d * COMM_DIFF_RATIO) slowest = { label: "Menções", seconds: m };
  }

  let vsTeam: "abaixo" | "acima" | "similar" | null = null;
  if (teamAverageSeconds != null && teamAverageSeconds > 0) {
    vsTeam =
      avg >= teamAverageSeconds * COMM_DIFF_RATIO
        ? "acima"
        : teamAverageSeconds >= avg * COMM_DIFF_RATIO
          ? "abaixo"
          : "similar";
  }

  let recommendation: string | null = null;
  if (vsTeam === "acima") {
    recommendation = slowest
      ? `O tempo de resposta está acima da média do time. Vale priorizar ${slowest.label.toLowerCase()} durante o horário de trabalho.`
      : "O tempo de resposta está acima da média do time. Vale priorizar as respostas durante o horário de trabalho.";
  } else if (slowest) {
    recommendation = `As respostas a ${slowest.label.toLowerCase()} levam mais tempo (${formatResponseDuration(slowest.seconds)}). Vale dar prioridade a elas no horário de trabalho.`;
  }
  return { state: "ok", averageSeconds: avg, slowest, vsTeam, recommendation };
}

export const VS_TEAM_LABEL = {
  abaixo: "Abaixo da média do time",
  acima: "Acima da média do time",
  similar: "Na média do time",
} as const;

/* ---------------- Dependências: bloqueio com e sem dependência formal ---------------- */

export type BlockedTaskRow = {
  task: DashTask;
  /** Tarefas que bloqueiam (dependência formal, ainda não concluídas); vazio = só o motivo. */
  blockers: { id: string; title: string; assignees: string[]; dueDate?: string }[];
};

/** Para cada tarefa bloqueada: o nome/responsável/prazo de quem bloqueia SÓ quando existe uma
 * dependência formal (`task_dependencies`); caso contrário, apenas o motivo do bloqueio. */
export function blockedRows(
  blocked: DashTask[],
  allDeps: readonly Pick<TaskDependency, "blockedTaskId" | "blockingTaskId">[],
  entry: (
    rawId: string,
  ) => { label: string; status: string; assignees: string[]; dueDate?: string } | undefined,
): BlockedTaskRow[] {
  return blocked.map((task) => {
    const raw = task.id.replace(/^mkt:/, "");
    const blockers = allDeps
      .filter((d) => d.blockedTaskId === raw)
      .flatMap((d) => {
        const e = entry(d.blockingTaskId);
        if (!e || e.status === "Concluído") return [];
        return [
          { id: d.blockingTaskId, title: e.label, assignees: e.assignees, dueDate: e.dueDate },
        ];
      });
    return { task, blockers };
  });
}

/* ---------------- Histórico contextual (só eventos reais) ---------------- */

const fmtMeeting = (t?: string) => (t ? ` “${t}”` : "");

/** Converte os eventos reais do período no formato da linha do tempo compartilhada. O contexto
 * (projeto) só entra quando a tarefa ainda está vinculada; nada é inventado. */
export function memberHistoryEvents(input: {
  memberName: string;
  completions: ProfileCompletion[];
  deadlineChanges: ProfileDeadlineChange[];
  attendance: ProfileAttendance[];
  meetingTitle: (meetingId?: string | null) => string | undefined;
  projectOfTask: (taskId?: string | null) => string | undefined;
}): HistoricoEvento[] {
  const out: HistoricoEvento[] = [];
  input.completions.forEach((c, i) =>
    out.push({
      id: `c-${c.taskId ?? i}-${c.occurredAt}`,
      at: c.occurredAt,
      autor: input.memberName,
      kind: "outro",
      texto: `concluiu “${c.taskTitle ?? "tarefa"}”${c.outcome === "late" ? " com atraso" : ""}`,
      entrega: input.projectOfTask(c.taskId),
      menor: false,
    }),
  );
  input.deadlineChanges.forEach((d, i) =>
    out.push({
      id: `d-${d.taskId ?? i}-${d.occurredAt}`,
      at: d.occurredAt,
      autor: input.memberName,
      kind: "outro",
      texto: `replanejou o prazo de “${d.taskTitle ?? "tarefa"}”`,
      entrega: input.projectOfTask(d.taskId),
      menor: false,
    }),
  );
  input.attendance.forEach((a, i) =>
    out.push({
      id: `a-${a.meetingId ?? i}-${a.occurredAt}`,
      at: a.occurredAt,
      autor: input.memberName,
      kind: "outro",
      texto: `${a.attended ? "participou" : "não participou"} da reunião${fmtMeeting(input.meetingTitle(a.meetingId))}`,
      menor: false,
    }),
  );
  return out.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0)).slice(0, 60);
}
