import { createTableArrayStore } from "./table-array-store";

export type MeetingStatus = "Confirmada" | "Pendente" | "Cancelada";

export type RescheduleProposal = {
  proposedBy: string; // id de quem sugeriu
  proposedByName?: string;
  data: string; // yyyy-mm-dd sugerido
  hora: string; // HH:mm sugerido
  note?: string;
};

export type ExternalGuest = { nome: string; email: string };

export type Meeting = {
  id: string;
  /** Presente só quando a reunião nasceu de uma repetição que gerou mais
   * de 1 data (`MeetingDialog.submit()`) — todas as ocorrências daquela
   * leva compartilham o mesmo `seriesId`, gerado uma vez. Reuniões
   * avulsas e reuniões criadas antes desse campo existir não têm
   * `seriesId` — excluir/editar continua afetando só aquele registro,
   * já que o sistema não tem como saber se eram parte de uma série. */
  seriesId?: string;
  titulo: string;
  data: string; // yyyy-mm-dd
  hora: string; // HH:mm
  duracao: number; // minutes
  /** @deprecated Legado — nome de convidado externo em texto livre, sem
   * e-mail (não vira convite de verdade). Substituído por
   * `convidadosExternos`, mantido só pra reuniões antigas já salvas. */
  com: string;
  participanteId?: string; // legado: id do membro do time
  participanteIds?: string[]; // vários membros convidados
  /** Convidados de fora da empresa, com e-mail de verdade — entram no
   * convite do Google Agenda como `attendees` de verdade. */
  convidadosExternos?: ExternalGuest[];
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
  /** Id do evento no Google Calendar — presente só em reuniões
   * importadas de lá (criadas direto no Google, não pela plataforma).
   * Chave de dedupe do import (`importGoogleEventsToMeetings`, em
   * `google-calendar.functions.ts`) — nunca usado pro sync de saída
   * (que já é idempotente via `extendedProperties.private.vnhMeetingId`
   * no lado do Google, sem precisar guardar nada aqui). */
  googleEventId?: string;
  /** "google" = importada do Google Calendar; ausente/undefined =
   * criada na própria plataforma (todas as reuniões existentes antes
   * deste campo continuam válidas, tratadas como "da plataforma"). Use
   * `meetingSource()` pra ler isso de forma tipada — este campo nunca foi
   * renomeado pra `source` porque só 3 arquivos o leem diretamente e uma
   * migração de nome não muda nenhum comportamento, só o risco. */
  origem?: "google";
  /** Link do Google Meet — preenchido só em reuniões importadas do
   * Google Calendar (`event.hangoutLink`), pra aparecer na plataforma
   * mesmo quando a reunião foi criada direto por lá. */
  meetLink?: string;
  /** `htmlLink` devolvido pelo Google — URL pronta pra abrir o evento na UI
   * do Google Calendar. Usado pela ação "Abrir no Google Calendar" no
   * drawer de detalhes (Fase 4); nunca construído manualmente por aqui —
   * o formato de URL do Google não é uma API pública estável. */
  googleHtmlLink?: string;

  /* ==========================================================
   * Metadados de sincronização com o Google Calendar (Fase 2). Todos
   * opcionais e aditivos — linhas antigas sem esses campos continuam
   * válidas, só ficam sem o detalhe (equivalente a "nunca sincronizada").
   * ========================================================== */

  /** Calendário do Google onde este evento vive — hoje sempre `"primary"`
   * (`EVENTS_URL` em `google-calendar.functions.ts` só usa o calendário
   * primário de cada conta conectada), mas o campo já existe pra quando
   * isso deixar de ser verdade. */
  googleCalendarId?: string;
  /** `recurringEventId` bruto devolvido pelo Google pra uma ocorrência de
   * série recorrente. Para reuniões importadas do Google, hoje tem o
   * MESMO valor de `seriesId` (é o que `seriesId` recebe na importação) —
   * campos separados por clareza de schema; não é garantido que
   * continuem sempre iguais se a plataforma passar a reagrupar séries
   * importadas por outro critério no futuro. */
  recurringEventId?: string;
  /** ETag do evento na última leitura/escrita no Google — comparado antes
   * de sobrescrever numa importação, pra não substituir uma edição local
   * ainda não sincronizada por uma cópia desatualizada do Google. */
  etag?: string;
  /** `updated` do evento no Google (RFC3339) — segunda comparação, junto
   * do etag, antes de aceitar uma versão vinda de lá como mais nova. */
  googleUpdatedAt?: string;
  /** Estado da última tentativa de sincronizar ESTA reunião especificamente
   * (saída pra Google ou entrada de lá) — `"pending"` só existe entre o
   * `persist()` e a sincronização debounced rodar; a UI usa isso pra
   * mostrar "Sincronizando"/"Falha" por reunião, não só um estado global
   * de conexão. */
  syncStatus?: "synced" | "pending" | "error";
  lastSyncedAt?: string;
  /** Mensagem curta e segura (nunca token/secret) da última falha de sync
   * desta reunião — populada só quando `syncStatus === "error"`. */
  lastSyncError?: string;
  /** Quando a última TENTATIVA (sucesso ou falha) rodou — usado pro
   * backoff de retentativa em `google-calendar.functions.ts`, nunca
   * exibido diretamente na UI (que mostra `lastSyncedAt`, só sucessos). */
  lastSyncAttemptAt?: string;
};

/** Leitura tipada de `origem` — único ponto que traduz o campo legado pro
 * conceito de `source` pedido no schema (`"platform" | "google"`). Nenhum
 * dado é reescrito: linhas antigas sem `origem` já significam "platform"
 * por definição (ver comentário do campo). */
export function meetingSource(m: Pick<Meeting, "origem">): "platform" | "google" {
  return m.origem === "google" ? "google" : "platform";
}

/** Classifica o resultado de um ciclo de sync pros registros de UMA
 * gravação específica (Fase 5, formulário de Nova reunião/Editar) — usado
 * depois de `syncOneMeeting` já ter atualizado `syncStatus` em cada linha:
 * - `"not-attempted"`: nenhuma das reuniões foi sequer tentada (o criador
 *   não tem conta Google conectada) — não é erro, não há nada a reportar.
 * - `"error"`: pelo menos uma falhou.
 * - `"synced"`: pelo menos uma foi tentada e nenhuma falhou. */
export function classifyDialogSyncResult(rows: Pick<Meeting, "syncStatus" | "lastSyncError">[]): {
  outcome: "not-attempted" | "synced" | "error";
  error?: string;
} {
  const attempted = rows.some((m) => m.syncStatus !== undefined);
  if (!attempted) return { outcome: "not-attempted" };
  const errorRow = rows.find((m) => m.syncStatus === "error");
  if (errorRow) return { outcome: "error", error: errorRow.lastSyncError };
  return { outcome: "synced" };
}

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
 *
 * Duas exclusões corrigem o bug de "629 pendentes" numa série recorrente:
 * - Ocorrências já passadas nunca voltam a virar ação pendente — sem essa
 *   checagem, uma série antiga que ninguém nunca confirmou ficava
 *   acumulando pendência pra sempre, uma por ocorrência.
 * - Reuniões importadas do Google (`origem === "google"`) não têm um fluxo
 *   de convite/resposta na plataforma — quem usa a conta Google já
 *   respondeu (ou vai responder) por lá. Antes disso, séries recorrentes
 *   de longa duração importadas do Google (ex: uma daily rodando há
 *   meses) geravam uma "pendência" por ocorrência já sincronizada, nunca
 *   resolvida, acumulando a cada ciclo de sync sem limite.
 */
export function meetingNeedsMyAction(m: Meeting, meId: string): boolean {
  if (m.status === "Cancelada") return false;
  if (m.origem === "google") return false;
  if (m.data < toISODate(new Date())) return false;
  if (m.confirmedBy?.includes(meId) || m.declinedBy?.includes(meId)) return false;
  return true;
}

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${day}`;
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

/** Confirma presença de `meId` numa reunião (e desfaz uma recusa anterior,
 * se houver) — mesma lógica usada tanto no resumo da reunião quanto na
 * lista de Solicitações (ação inline, sem precisar abrir o resumo). */
export function confirmMeetingFor(m: Meeting, meId: string): Meeting {
  return {
    ...m,
    confirmedBy: Array.from(new Set([...(m.confirmedBy ?? []), meId])),
    declinedBy: (m.declinedBy ?? []).filter((id) => id !== meId),
  };
}

/** Recusa presença de `meId` numa reunião (e desfaz uma confirmação
 * anterior, se houver). */
export function declineMeetingFor(m: Meeting, meId: string): Meeting {
  return {
    ...m,
    declinedBy: Array.from(new Set([...(m.declinedBy ?? []), meId])),
    confirmedBy: (m.confirmedBy ?? []).filter((id) => id !== meId),
  };
}

/* ============================================================
 * Disponibilidade — uma linha por membro do time (id = id do membro),
 * numa tabela de verdade (não mais um blob global em shared_state: ver
 * migration 20260818150000). Isso é o que permite o resto do app (o
 * diálogo de nova reunião, por exemplo) enxergar quando OUTRA pessoa está
 * indisponível, não só a sua própria.
 * ============================================================ */

export type DiaSemana = "dom" | "seg" | "ter" | "qua" | "qui" | "sex" | "sab";
export const DIAS_SEMANA: DiaSemana[] = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"];

/** Um bloqueio de indisponibilidade — um dia específico ou um conjunto de
 * dias da semana (recorrente), num intervalo de horário, com motivo
 * opcional. Ao contrário do "padrão semanal" (quando você normalmente
 * aceita reunião), um bloqueio é sempre uma exceção pra INDISPONÍVEL. */
export type UnavailableBlock = {
  id: string;
  escopo: "semanal" | "data";
  dias?: DiaSemana[]; // usado quando escopo === "semanal"
  data?: string; // yyyy-mm-dd, usado quando escopo === "data"
  inicio: string; // HH:mm
  fim: string; // HH:mm
  motivo?: string;
};

export type Availability = {
  id: string; // = id do membro do time
  dias: Record<DiaSemana, boolean>; // dias em que normalmente aceita reunião
  inicio: string; // HH:mm
  fim: string; // HH:mm
  bloqueios: UnavailableBlock[];
};

export function defaultAvailability(memberId: string): Availability {
  return {
    id: memberId,
    dias: { dom: false, seg: true, ter: true, qua: true, qui: true, sex: true, sab: false },
    inicio: "09:00",
    fim: "18:00",
    bloqueios: [],
  };
}

const availStore = createTableArrayStore<Availability>("reunioes_disponibilidade");

export function initDisponibilidadeSync(): Promise<void> {
  const p = availStore.init();
  availStore.subscribeRealtime();
  return p;
}

export function loadDisponibilidades(): Availability[] {
  return availStore.get();
}

/** Salva (upsert) só a linha do próprio membro — a RLS também só permite
 * escrever `id = auth.uid()`, então tentar salvar a de outra pessoa
 * falharia silenciosamente do lado do banco de qualquer forma. */
export function saveMyDisponibilidade(next: Availability) {
  availStore.set((prev) => {
    const idx = prev.findIndex((a) => a.id === next.id);
    return idx >= 0 ? prev.map((a, i) => (i === idx ? next : a)) : [...prev, next];
  });
}

export function onDisponibilidadesChange(callback: () => void): () => void {
  return availStore.subscribe(callback);
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function weekdayOf(dateISO: string): DiaSemana {
  const [y, mo, d] = dateISO.split("-").map(Number);
  return DIAS_SEMANA[new Date(y, (mo || 1) - 1, d || 1).getDay()];
}

/** Todos os bloqueios que caem numa data específica (ignora horário) —
 * usado pra mostrar um aviso no dia selecionado do calendário, sem
 * precisar de um horário específico pra comparar. */
export function blocksForDate(
  avail: Availability | undefined,
  dateISO: string,
): UnavailableBlock[] {
  if (!avail || !dateISO) return [];
  const dia = weekdayOf(dateISO);
  return (avail.bloqueios ?? []).filter((b) =>
    b.escopo === "data" ? b.data === dateISO : (b.dias ?? []).includes(dia),
  );
}

/** Retorna o bloqueio que colide com o horário dado, se houver — usado
 * pra avisar (não impedir) quem está marcando uma reunião que um
 * participante está indisponível naquele dia/hora. */
export function unavailableBlockAt(
  avail: Availability | undefined,
  dateISO: string,
  hora: string,
  duracaoMin: number,
): UnavailableBlock | null {
  if (!avail || !dateISO || !hora) return null;
  const start = timeToMinutes(hora);
  const end = start + (duracaoMin || 0);
  const dia = weekdayOf(dateISO);
  for (const b of avail.bloqueios ?? []) {
    const diaColide = b.escopo === "data" ? b.data === dateISO : (b.dias ?? []).includes(dia);
    if (!diaColide) continue;
    const bStart = timeToMinutes(b.inicio);
    const bEnd = timeToMinutes(b.fim);
    if (start < bEnd && end > bStart) return b;
  }
  return null;
}
