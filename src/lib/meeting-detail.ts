import type { Meeting } from "@/lib/reunioes-store";

/** Regras PURAS do detalhe da reunião (ficha operacional). Três conceitos separados:
 *  - ESTADO DA REUNIÃO (derivado de horário + cancelamento): Agendada / Em andamento / Realizada / Cancelada;
 *  - RESPOSTA AO CONVITE (confirmedBy/declinedBy): Confirmado / Pendente / Recusado;
 *  - PRESENÇA (attendedBy/notAttendedBy): Presente / Não participou / Não registrada.
 * O estado novo vale só no detalhe nesta rodada; Agenda/Lista/Calendário seguem como estavam. */
export type MeetingLifecycle = "agendada" | "em_andamento" | "realizada" | "cancelada";

export const LIFECYCLE_LABEL: Record<MeetingLifecycle, string> = {
  agendada: "Agendada",
  em_andamento: "Em andamento",
  realizada: "Realizada",
  cancelada: "Cancelada",
};

function startMs(m: Pick<Meeting, "data" | "hora">): number {
  return new Date(`${m.data}T${m.hora}:00`).getTime();
}

export function meetingLifecycle(
  m: Pick<Meeting, "data" | "hora" | "duracao" | "status">,
  nowMs: number,
): MeetingLifecycle {
  if (m.status === "Cancelada") return "cancelada";
  const start = startMs(m);
  if (nowMs < start) return "agendada";
  if (nowMs <= start + m.duracao * 60_000) return "em_andamento";
  return "realizada";
}

export type DetailSectionKey = "participantes" | "transcricao" | "resultado" | "reuniao" | "pauta";

export type DetailPlan = {
  lifecycle: MeetingLifecycle;
  /** "Entrar na reunião" é a ação principal enquanto a reunião está próxima ou acontecendo. */
  showJoin: boolean;
  presenceAvailable: boolean;
  presenceEditable: boolean;
  /** Mostra "Convite · …" e "Sua resposta": reunião importada do Google não tem fluxo de resposta. */
  showInvite: boolean;
  canCancel: boolean;
  showTranscript: boolean;
  showResult: boolean;
  canEditTranscript: boolean;
  canEditResult: boolean;
  showAgenda: boolean;
  /** Ordem das seções principais — depois da reunião, o resultado vem antes de link e pauta. */
  order: DetailSectionKey[];
};

export function detailPlan(
  m: Meeting,
  opts: { nowMs: number; isCreator: boolean; hasJoinUrl: boolean },
): DetailPlan {
  const lifecycle = meetingLifecycle(m, opts.nowMs);
  const cancelled = lifecycle === "cancelada";
  const upcomingOrLive = lifecycle === "agendada" || lifecycle === "em_andamento";
  const started = lifecycle === "em_andamento" || lifecycle === "realizada";
  const hasTranscript = !!m.transcricao?.trim();
  const hasResult = !!m.resumo?.trim() || (m.proximosPassos?.length ?? 0) > 0;
  const showTranscript = !cancelled && (lifecycle === "realizada" || hasTranscript);
  const showResult = !cancelled && (started || hasResult);
  const showAgenda = !!m.notas?.trim();
  const after = lifecycle === "realizada" || cancelled;
  const order: DetailSectionKey[] = after
    ? ["participantes", "transcricao", "resultado", "reuniao", "pauta"]
    : ["participantes", "reuniao", "pauta", "transcricao", "resultado"];
  return {
    lifecycle,
    showJoin: opts.hasJoinUrl && upcomingOrLive,
    presenceAvailable: started,
    presenceEditable: started && opts.isCreator,
    showInvite: m.origem !== "google",
    // Cancelar propaga ao Google apagando o evento do organizador; em reunião importada o dono do
    // evento é outra pessoa, então não oferecemos.
    canCancel: opts.isCreator && upcomingOrLive && m.origem !== "google",
    showTranscript,
    showResult,
    canEditTranscript: opts.isCreator,
    canEditResult: opts.isCreator,
    showAgenda,
    order,
  };
}

/* ---------------- Resultado ---------------- */

/** Um item por linha; ignora linhas vazias e marcadores ("-", "•", "*"). */
export function parseNextSteps(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.replace(/^\s*[-•*]\s*/, "").trim())
    .filter(Boolean);
}
export function nextStepsToText(steps: readonly string[] | undefined): string {
  return (steps ?? []).join("\n");
}

/** Resumo do convite: "3 confirmados · 1 pendente" etc. Só conta quem é elegível. */
export function inviteSummary(
  m: Pick<Meeting, "confirmedBy" | "declinedBy">,
  ids: readonly string[],
): string {
  let ok = 0;
  let no = 0;
  for (const id of ids) {
    if ((m.confirmedBy ?? []).includes(id)) ok++;
    else if ((m.declinedBy ?? []).includes(id)) no++;
  }
  const pend = ids.length - ok - no;
  const parts = [`${ok} ${ok === 1 ? "confirmado" : "confirmados"}`];
  if (no > 0) parts.push(`${no} ${no === 1 ? "recusou" : "recusaram"}`);
  if (pend > 0) parts.push(`${pend} ${pend === 1 ? "pendente" : "pendentes"}`);
  return parts.join(" · ");
}
