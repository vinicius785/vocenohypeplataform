import type { Meeting } from "@/lib/reunioes-store";

/** Regras PURAS de presença numa reunião (uma OCORRÊNCIA — cada ocorrência de uma série é uma
 * linha própria de `reunioes`, então marcar uma nunca toca nas outras). Presença é diferente de
 * resposta ao convite: "Confirmado" = disse que vai; "Presente" = de fato participou.
 *
 * Estados do domínio atual (nenhum novo):
 *  - `unknown`: presença ainda não registrada (`attendanceRecorded` falso);
 *  - `present`: registrada e a pessoa está em `attendedBy`;
 *  - `absent`: registrada e a pessoa NÃO está em `attendedBy`. */
export type AttendanceState = "unknown" | "present" | "absent";

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

export function attendanceState(
  meeting: Pick<Meeting, "attendanceRecorded" | "attendedBy">,
  id: string,
): AttendanceState {
  if (!meeting.attendanceRecorded) return "unknown";
  return (meeting.attendedBy ?? []).includes(id) ? "present" : "absent";
}

export type AttendanceSummary = {
  recorded: boolean;
  present: number;
  total: number;
  /** "2 de 2 presentes" — ou `null` enquanto não registrada (nunca "0 de N" fingindo ausência). */
  label: string | null;
};

export function attendanceSummary(
  meeting: Pick<Meeting, "attendanceRecorded" | "attendedBy">,
  eligibleIds: readonly string[],
): AttendanceSummary {
  const total = eligibleIds.length;
  if (!meeting.attendanceRecorded) return { recorded: false, present: 0, total, label: null };
  const attended = new Set(meeting.attendedBy ?? []);
  const present = eligibleIds.filter((id) => attended.has(id)).length;
  return { recorded: true, present, total, label: `${present} de ${total} presentes` };
}

export type AttendanceChange = {
  meeting: Meeting;
  /** Quem teve a presença (re)gravada nesta ação — alimenta o ledger de pontuação. */
  changedIds: string[];
};

/** "Marcar todos presentes": todos os elegíveis passam a presentes (quem já estava em
 * `attendedBy` e não é elegível é preservado). */
export function markAllPresent(meeting: Meeting, eligibleIds: readonly string[]): AttendanceChange {
  const before = new Set(meeting.attendedBy ?? []);
  const next = new Set([...before, ...eligibleIds]);
  const changedIds = meeting.attendanceRecorded
    ? eligibleIds.filter((id) => !before.has(id))
    : [...eligibleIds];
  return {
    meeting: { ...meeting, attendedBy: Array.from(next), attendanceRecorded: true },
    changedIds,
  };
}

/** Ajuste individual. Na PRIMEIRA marcação (presença ainda não registrada) o registro passa a
 * existir e quem não foi marcado fica ausente — mesma semântica da antiga lista "selecione quem
 * participou". Depois, só a pessoa escolhida muda. */
export function setPersonAttendance(
  meeting: Meeting,
  id: string,
  present: boolean,
  eligibleIds: readonly string[],
): AttendanceChange {
  const wasRecorded = !!meeting.attendanceRecorded;
  const attended = new Set(meeting.attendedBy ?? []);
  const wasPresent = attended.has(id);
  if (present) attended.add(id);
  else attended.delete(id);
  const changedIds = wasRecorded ? (wasPresent === present ? [] : [id]) : [...eligibleIds];
  return {
    meeting: { ...meeting, attendedBy: Array.from(attended), attendanceRecorded: true },
    changedIds,
  };
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
