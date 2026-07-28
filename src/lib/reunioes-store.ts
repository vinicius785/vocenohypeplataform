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
};

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
