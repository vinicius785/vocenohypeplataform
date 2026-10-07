/**
 * Sessões de trabalho compartilhadas (horas-pessoa). Puro: sem I/O.
 *
 * Uma linha de `time_entries` = UMA pessoa em UM intervalo. Uma SESSÃO = linhas com o mesmo
 * `sessionId`; sem `sessionId` (todo o histórico antigo e o timer solo) a linha é uma sessão de uma
 * pessoa só. Duas métricas, sempre com nome:
 *  - ESFORÇO (horas-pessoa) = soma dos intervalos individuais (Vinícius 1h30 + João 1h30 = 3h);
 *  - TEMPO DA SESSÃO = do primeiro início ao último fim (1h30).
 * Nunca se divide o tempo entre os participantes.
 */

export type SessionEntryLike = {
  id: string;
  userId: string | null;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number | null;
  sessionId?: string | null;
  note?: string | null;
};

export type TimeSession<E extends SessionEntryLike = SessionEntryLike> = {
  /** `sessionId`, ou o id da própria linha quando é uma sessão solo. */
  key: string;
  sessionId: string | null;
  entries: E[];
  startedAt: string;
  endedAt: string | null;
  running: boolean;
  note: string | null;
};

const ms = (iso: string) => Date.parse(iso);

/** Segundos de UMA linha: a duração gravada, ou o relógio ao vivo quando ainda está aberta. */
export function entryEffort(e: SessionEntryLike, nowMs: number = Date.now()): number {
  if (e.endedAt)
    return e.durationSeconds ?? Math.max(0, Math.round((ms(e.endedAt) - ms(e.startedAt)) / 1000));
  return Math.max(0, Math.round((nowMs - ms(e.startedAt)) / 1000));
}

/** Agrupa as linhas em sessões (mais recente primeiro). Linhas antigas/solo viram sessões de 1. */
export function groupSessions<E extends SessionEntryLike>(entries: E[]): TimeSession<E>[] {
  const map = new Map<string, E[]>();
  for (const e of entries) {
    const key = e.sessionId ?? e.id;
    map.set(key, [...(map.get(key) ?? []), e]);
  }
  const sessions: TimeSession<E>[] = [];
  for (const [key, list] of map) {
    const sorted = [...list].sort((a, b) => ms(a.startedAt) - ms(b.startedAt));
    const running = sorted.some((e) => !e.endedAt);
    const lastEnd = sorted.every((e) => e.endedAt)
      ? sorted.reduce((m, e) => (ms(e.endedAt!) > ms(m) ? e.endedAt! : m), sorted[0].endedAt!)
      : null;
    sessions.push({
      key,
      sessionId: list[0].sessionId ?? null,
      entries: sorted,
      startedAt: sorted[0].startedAt,
      endedAt: lastEnd,
      running,
      note: sorted.find((e) => e.note)?.note ?? null,
    });
  }
  return sessions.sort((a, b) => ms(b.startedAt) - ms(a.startedAt));
}

/** Tempo da sessão: primeiro início → último fim (ou agora, se ainda há alguém cronometrando). */
export function sessionElapsedSeconds(s: TimeSession, nowMs: number = Date.now()): number {
  const end = s.endedAt ? ms(s.endedAt) : nowMs;
  return Math.max(0, Math.round((end - ms(s.startedAt)) / 1000));
}

/** Esforço da sessão em horas-pessoa. */
export function sessionEffortSeconds(s: TimeSession, nowMs: number = Date.now()): number {
  return s.entries.reduce((sum, e) => sum + entryEffort(e, nowMs), 0);
}

export function sessionParticipants(s: TimeSession) {
  return s.entries.map((e) => ({
    userId: e.userId,
    seconds: (n: number) => entryEffort(e, n),
    entry: e,
  }));
}

export type TaskTimeTotals = {
  /** Esforço em horas-pessoa (o "Tempo registrado" da tarefa). */
  effortSeconds: number;
  /** Soma do tempo de cada sessão (sem contar a sobreposição entre participantes). */
  sessionSeconds: number;
  /** Total individual por pessoa. */
  byUser: Map<string, number>;
  sessions: number;
  /** Alguma sessão tem mais de uma pessoa. */
  hasShared: boolean;
};

export function taskTotals(
  entries: SessionEntryLike[],
  nowMs: number = Date.now(),
): TaskTimeTotals {
  const sessions = groupSessions(entries);
  const byUser = new Map<string, number>();
  let effort = 0;
  for (const e of entries) {
    const sec = entryEffort(e, nowMs);
    effort += sec;
    if (e.userId) byUser.set(e.userId, (byUser.get(e.userId) ?? 0) + sec);
  }
  return {
    effortSeconds: effort,
    sessionSeconds: sessions.reduce((s, x) => s + sessionElapsedSeconds(x, nowMs), 0),
    byUser,
    sessions: sessions.length,
    hasShared: sessions.some((s) => s.entries.length > 1),
  };
}

/* ---------------- formatação ---------------- */

/** "4s", "12min", "1h30", "7h15", "2h". */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h${m > 0 ? String(m).padStart(2, "0") : ""}`;
  if (m > 0) return `${m}min`;
  return `${s % 60}s`;
}

/** Relógio do cronômetro: MM:SS abaixo de 1h, HH:MM:SS acima. */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/* ---------------- fuso (Brasília) ---------------- */

export const TIME_ZONE = "America/Sao_Paulo";

export const toDateInput = (iso: string) =>
  new Date(iso).toLocaleDateString("en-CA", { timeZone: TIME_ZONE });
export const toTimeInput = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-GB", {
    timeZone: TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
  });

/** Data + hora de parede em Brasília → instante UTC (ISO). */
export function combine(date: string, time: string, timeZone: string = TIME_ZONE): string {
  const asUtc = new Date(`${date}T${time}:00Z`);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
    .formatToParts(asUtc)
    .reduce<Record<string, string>>((acc, p) => {
      acc[p.type] = p.value;
      return acc;
    }, {});
  const readAsIfUtc = new Date(
    `${parts.year}-${parts.month}-${parts.day}T${parts.hour === "24" ? "00" : parts.hour}:${parts.minute}:${parts.second}Z`,
  );
  return new Date(asUtc.getTime() + (asUtc.getTime() - readAsIfUtc.getTime())).toISOString();
}

/* ---------------- registro manual compartilhado ---------------- */

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export type ParticipantDraft = {
  userId: string;
  /** Intervalo próprio (HH:MM). Vazio = usa o intervalo principal da sessão. */
  start?: string;
  end?: string;
};

export type ManualDraft = {
  date: string; // YYYY-MM-DD
  start: string; // HH:MM
  end: string; // HH:MM ou ""
  participants: ParticipantDraft[];
};

export type PlannedRow = { userId: string; startedAt: string; endedAt: string; seconds: number };

export type ManualPlan =
  | { ok: true; rows: PlannedRow[]; durationSeconds: number }
  | { ok: false; error: string; field: "data" | "inicio" | "fim" | "participantes" };

const secondsBetween = (a: string, b: string) => Math.max(0, Math.round((ms(b) - ms(a)) / 1000));

/** Valida e converte o formulário em linhas gravadas. Duração NUNCA é digitada: vem de início e fim. */
export function planManualSession(d: ManualDraft): ManualPlan {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date))
    return { ok: false, field: "data", error: "Informe a data." };
  if (!TIME_RE.test(d.start)) return { ok: false, field: "inicio", error: "Informe o início." };
  if (!d.end) return { ok: false, field: "fim", error: "Informe o fim para registrar." };
  if (!TIME_RE.test(d.end)) return { ok: false, field: "fim", error: "Horário de fim inválido." };
  if (d.end < d.start)
    return { ok: false, field: "fim", error: "O fim não pode ser antes do início." };
  if (d.participants.length === 0)
    return { ok: false, field: "participantes", error: "Inclua ao menos um participante." };
  const seen = new Set<string>();
  const rows: PlannedRow[] = [];
  for (const p of d.participants) {
    if (!p.userId) return { ok: false, field: "participantes", error: "Participante inválido." };
    if (seen.has(p.userId))
      return { ok: false, field: "participantes", error: "Participante repetido." };
    seen.add(p.userId);
    const s = p.start || d.start;
    const e = p.end || d.end;
    if (!TIME_RE.test(s) || !TIME_RE.test(e))
      return { ok: false, field: "participantes", error: "Horário de participante inválido." };
    if (e < s)
      return {
        ok: false,
        field: "participantes",
        error: "O fim de um participante não pode ser antes do início dele.",
      };
    const startedAt = combine(d.date, s);
    const endedAt = combine(d.date, e);
    rows.push({
      userId: p.userId,
      startedAt,
      endedAt,
      seconds: secondsBetween(startedAt, endedAt),
    });
  }
  return {
    ok: true,
    rows,
    durationSeconds: secondsBetween(combine(d.date, d.start), combine(d.date, d.end)),
  };
}

/** Rótulo da duração derivada ao digitar início/fim ("Em aberto" sem fim, "—" se inválido). */
export function derivedDurationLabel(date: string, start: string, end: string): string {
  if (!TIME_RE.test(start)) return "—";
  if (!end) return "Em aberto";
  if (!TIME_RE.test(end) || end < start) return "—";
  return formatDuration(secondsBetween(combine(date, start), combine(date, end)));
}

/* ---------------- participante entrando durante o timer ---------------- */

export type JoinMode = "agora" | "desde_o_inicio";

/** "Começar agora" é o padrão; "desde o início" (retroativo) só com confirmação explícita. */
export function participantStart(
  mode: JoinMode,
  sessionStartedAt: string,
  nowIso: string,
  confirmed: boolean,
): string {
  if (mode === "desde_o_inicio") {
    if (!confirmed) throw new Error("Aplicar desde o início exige confirmação.");
    return sessionStartedAt;
  }
  return nowIso;
}

/** Quem ainda pode ser adicionado: do time, com id, e fora da sessão. */
export function addableMembers<M extends { id?: string }>(
  members: M[],
  participantIds: string[],
): M[] {
  const inside = new Set(participantIds);
  return members.filter((m) => !!m.id && !inside.has(m.id));
}
