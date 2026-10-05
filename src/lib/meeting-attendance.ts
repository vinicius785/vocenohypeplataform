import type { Meeting } from "@/lib/reunioes-store";

/** Regras PURAS de presença numa reunião (uma OCORRÊNCIA — cada ocorrência de uma série é uma
 * linha própria de `reunioes`, então marcar uma nunca toca nas outras). Presença é diferente de
 * resposta ao convite: "Confirmado" = disse que vai; "Presente" = de fato participou.
 *
 * Presença por pessoa em TRÊS estados:
 *  - `present`: está em `attendedBy`;
 *  - `absent` ("Não participou"): está em `notAttendedBy` — ou, em reunião ANTIGA (sem
 *    `notAttendedBy`), a presença foi registrada e a pessoa não está em `attendedBy`;
 *  - `unknown` ("Não registrada"): ainda sem decisão.
 * Depois de registrada (present/absent) a pessoa NUNCA volta a `unknown`: cada marcação gera um
 * evento de XP no ledger e não pode haver inconsistência histórica. */
export type AttendanceState = "unknown" | "present" | "absent";

export const ATTENDANCE_LABEL: Record<AttendanceState, string> = {
  present: "Presente",
  absent: "Não participou",
  unknown: "Não registrada",
};

/** Participantes cuja presença pode ser registrada: organizador + convidados da plataforma desta
 * ocorrência que ainda são membros do workspace (`knownMemberIds`) — convidados removidos e
 * usuários que saíram ficam de fora. O usuário atual sempre é considerado membro. */
export function eligibleAttendeeIds(
  meeting: Pick<Meeting, "criadorId" | "participanteIds">,
  knownMemberIds: ReadonlySet<string>,
  meId: string,
): string[] {
  const ids = [
    ...(meeting.criadorId ? [meeting.criadorId] : []),
    ...(meeting.participanteIds ?? []),
  ];
  return Array.from(new Set(ids)).filter((id) => id === meId || knownMemberIds.has(id));
}

type AttendanceFields = Pick<Meeting, "attendanceRecorded" | "attendedBy" | "notAttendedBy">;

export function attendanceState(meeting: AttendanceFields, id: string): AttendanceState {
  if ((meeting.attendedBy ?? []).includes(id)) return "present";
  if ((meeting.notAttendedBy ?? []).includes(id)) return "absent";
  // Formato antigo: registrada e fora de `attendedBy` = não participou.
  if (meeting.notAttendedBy === undefined && meeting.attendanceRecorded) return "absent";
  return "unknown";
}

export type AttendanceSummary = {
  /** Alguém já teve a presença registrada. */
  recorded: boolean;
  present: number;
  /** Quantos já têm decisão (presente ou não participou). */
  decided: number;
  total: number;
  /** "2 de 4 presentes" — ou `null` enquanto nada foi registrado. */
  label: string | null;
  /** "2 de 4 presentes" SEMPRE (0 quando nada foi marcado), só de `attendedBy`; nunca de RSVP. */
  countLabel: string;
};

export function attendanceSummary(
  meeting: AttendanceFields,
  eligibleIds: readonly string[],
): AttendanceSummary {
  const total = eligibleIds.length;
  let present = 0;
  let decided = 0;
  for (const id of eligibleIds) {
    const st = attendanceState(meeting, id);
    if (st === "present") present++;
    if (st !== "unknown") decided++;
  }
  const countLabel = `${present} de ${total} presentes`;
  return {
    recorded: decided > 0,
    present,
    decided,
    total,
    label: decided > 0 ? countLabel : null,
    countLabel,
  };
}

/** Resposta ao CONVITE (RSVP) — conceito separado de presença. */
export type RsvpKind = "confirmed" | "declined" | "pending";
export function rsvpKind(
  meeting: Pick<Meeting, "confirmedBy" | "declinedBy">,
  id: string,
): RsvpKind {
  if ((meeting.confirmedBy ?? []).includes(id)) return "confirmed";
  if ((meeting.declinedBy ?? []).includes(id)) return "declined";
  return "pending";
}

export type AttendanceChange = {
  meeting: Meeting;
  /** Quem teve a presença (re)gravada nesta ação — alimenta o ledger de pontuação. */
  changedIds: string[];
};

/** Ao gravar no formato novo uma reunião ANTIGA já registrada, a regra antiga vira explícita
 * (quem estava fora de `attendedBy` passa a constar em `notAttendedBy`), senão o 3º estado
 * "desfaria" o que já estava decidido. */
function currentNotAttended(meeting: Meeting, eligibleIds: readonly string[]): Set<string> {
  if (meeting.notAttendedBy !== undefined) return new Set(meeting.notAttendedBy);
  if (!meeting.attendanceRecorded) return new Set();
  const attended = new Set(meeting.attendedBy ?? []);
  return new Set(eligibleIds.filter((id) => !attended.has(id)));
}

/** "Todos presentes": todos os elegíveis passam a presentes (quem já estava presente e não é
 * elegível é preservado). Só gera evento para quem ainda não estava presente. */
export function markAllPresent(meeting: Meeting, eligibleIds: readonly string[]): AttendanceChange {
  const notAttended = currentNotAttended(meeting, eligibleIds);
  const attended = new Set(meeting.attendedBy ?? []);
  const changedIds = eligibleIds.filter((id) => !attended.has(id));
  for (const id of eligibleIds) {
    attended.add(id);
    notAttended.delete(id);
  }
  return {
    meeting: {
      ...meeting,
      attendedBy: Array.from(attended),
      notAttendedBy: Array.from(notAttended),
      attendanceRecorded: true,
    },
    changedIds,
  };
}

/** Marca UMA pessoa como presente ou como "não participou". Nunca volta a "não registrada" (não
 * existe essa transição) e, se a pessoa já está nesse estado, não faz nada (sem evento de XP). */
export function setPersonAttendance(
  meeting: Meeting,
  id: string,
  next: "present" | "absent",
  eligibleIds: readonly string[],
): AttendanceChange {
  const before = attendanceState(meeting, id);
  if (before === next) return { meeting, changedIds: [] };
  const attended = new Set(meeting.attendedBy ?? []);
  const notAttended = currentNotAttended(meeting, eligibleIds);
  if (next === "present") {
    attended.add(id);
    notAttended.delete(id);
  } else {
    attended.delete(id);
    notAttended.add(id);
  }
  return {
    meeting: {
      ...meeting,
      attendedBy: Array.from(attended),
      notAttendedBy: Array.from(notAttended),
      attendanceRecorded: true,
    },
    changedIds: [id],
  };
}

/** Clique rápido no card: não registrada → presente; presente → não participou; não participou →
 * presente. */
export function nextAttendanceOnClick(state: AttendanceState): "present" | "absent" {
  return state === "present" ? "absent" : "present";
}

/** Presença só faz sentido depois que a reunião começou (a antiga regra do campo
 * `attendedBy`: "marcado depois do horário"). */
export function canRecordAttendance(
  meeting: Pick<Meeting, "status">,
  startMs: number,
  nowMs: number,
): boolean {
  return meeting.status !== "Cancelada" && nowMs >= startMs;
}

/** Contagem simples de palavras da transcrição — só para dar noção do tamanho sem abrir o texto. */
export function wordCount(text: string): number {
  const t = text.trim();
  return t ? t.split(/\s+/).length : 0;
}
