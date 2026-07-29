import { createTableArrayStore } from "./table-array-store";

export type MeetingStatus = "Confirmada" | "Pendente" | "Cancelada";

export type RescheduleProposal = {
  proposedBy: string; // id de quem sugeriu
  proposedByName?: string;
  data: string; // yyyy-mm-dd sugerido
  hora: string; // HH:mm sugerido
  note?: string;
};

export type Meeting = {
  id: string;
  titulo: string;
  data: string; // yyyy-mm-dd
  hora: string; // HH:mm
  duracao: number; // minutes
  com: string;
  participanteId?: string; // legado: id do membro do time
  participanteIds?: string[]; // vários membros convidados
  local: string;
  notas?: string;
  status: MeetingStatus;
  criadorId?: string;
  confirmedBy?: string[];
  declinedBy?: string[];
  rescheduleProposal?: RescheduleProposal;
  attendedBy?: string[]; // ids de quem efetivamente participou (marcado depois do horário)
  attendanceRecorded?: boolean; // true assim que o criador confirma a presença
  transcricao?: string; // colada pelo criador junto com o registro de presença
};

/** Horário em que a reunião começa (data+hora), como epoch ms. */
export function meetingStartTime(m: Meeting): number {
  return new Date(`${m.data}T${m.hora}:00`).getTime();
}

/** Horário em que a reunião termina (data+hora+duração), como epoch ms. */
export function meetingEndTime(m: Meeting): number {
  return meetingStartTime(m) + m.duracao * 60_000;
}

/**
 * Status exibido derivado por pessoa: "Cancelada" só quando explicitamente
 * marcada assim; "Confirmada" quando 2+ pessoas confirmaram presença; senão
 * "Pendente". Substitui a leitura direta de `status` para exibição (o campo
 * continua existindo só para o cancelamento explícito).
 */
export function meetingDisplayStatus(m: Meeting): MeetingStatus {
  if (m.status === "Cancelada") return "Cancelada";
  if ((m.confirmedBy?.length ?? 0) >= 2) return "Confirmada";
  return "Pendente";
}

/**
 * A notificação/badge de "solicitação pendente" é por pessoa, não pelo
 * status agregado da reunião: uma vez que a pessoa confirma ou recusa, a
 * pendência dela sumiu — mesmo que a reunião como um todo ainda esteja
 * "Pendente" esperando outros participantes agirem.
 */
export function meetingNeedsMyAction(m: Meeting, meId: string): boolean {
  if (m.status === "Cancelada") return false;
  if (m.confirmedBy?.includes(meId) || m.declinedBy?.includes(meId)) return false;
  return true;
}

const store = createTableArrayStore<Meeting>("reunioes");

export function initReunioesSync(): Promise<void> {
  const p = store.init();
  store.subscribeRealtime();
  return p;
}

export function loadMeetings(): Meeting[] {
  return store.get();
}

export function saveMeetings(list: Meeting[]) {
  store.set(() => list);
}

export function onMeetingsChange(callback: () => void): () => void {
  return store.subscribe(callback);
}
