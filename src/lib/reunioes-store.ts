import { createTableArrayStore } from "./table-array-store";

export type MeetingStatus = "Confirmada" | "Pendente" | "Cancelada";

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
};

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
