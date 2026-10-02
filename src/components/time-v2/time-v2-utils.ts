/**
 * Funções puras da aba Time V2 — período do perfil central, estatísticas
 * de tarefas por pessoa, horas/jornada a partir de `time_entries`. Nada
 * aqui toca em Chat: a única métrica de comunicação vive em
 * `@/lib/member-response-time` e é sempre agregada.
 */
import { OPEN_STATUSES } from "@/lib/score";
import type { DashTask } from "@/lib/task-aggregation";
import type { TimeEntry } from "@/lib/time-entries";
import { addDaysIso, currentWeekRangeBrasilia, todayIsoInBrasilia } from "@/lib/timezone";
import type { Member, TimeField } from "@/components/TimeSection";

export type ProfilePeriod = "hoje" | "semana" | "mes" | "personalizado";

export const PROFILE_PERIOD_LABELS: Record<ProfilePeriod, string> = {
  hoje: "Hoje",
  semana: "Semana",
  mes: "Mês",
  personalizado: "Personalizado",
};

export type IsoRange = { from: string; to: string };

/** Intervalo [from, to] em datas ISO (Brasília). Semana = segunda→domingo,
 * mês = dia 1 → último dia. `personalizado` usa `custom` (e se vier
 * invertido/ausente cai em "Mês" — nunca devolve intervalo inválido). */
export function rangeForProfilePeriod(
  period: ProfilePeriod,
  custom: Partial<IsoRange> | null,
  now: Date = new Date(),
): IsoRange {
  const today = todayIsoInBrasilia(now);
  if (period === "hoje") return { from: today, to: today };
  if (period === "semana") return currentWeekRangeBrasilia(now);
  if (period === "personalizado" && custom?.from && custom?.to && custom.from <= custom.to) {
    return { from: custom.from, to: custom.to };
  }
  const [y, m] = today.split("-").map(Number);
  const first = `${y}-${String(m).padStart(2, "0")}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  return {
    from: first,
    to: `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`,
  };
}

/** Janela [from, to) em timestamptz (Brasília é -03:00 fixo, sem horário de
 * verão desde 2019) pra RPC de tempo de resposta. */
export function isoRangeToTimestamps(range: IsoRange): { from: string; to: string } {
  return {
    from: `${range.from}T00:00:00-03:00`,
    to: `${addDaysIso(range.to, 1)}T00:00:00-03:00`,
  };
}

/** Campo de cadastro visível pra quem está olhando — mesma regra de
 * `MemberProfileDialog`/`MemberPerformanceRow`: admin e o próprio membro
 * veem tudo; os demais só o que a pessoa liberou em `timeView`. */
export function canSeeField(
  member: Pick<Member, "id" | "timeView">,
  field: TimeField,
  viewer: { isAdmin: boolean; meId: string | null },
): boolean {
  return viewer.isAdmin || viewer.meId === member.id || (member.timeView ?? []).includes(field);
}

export type MemberTaskStats = {
  abertas: number;
  atrasadas: number;
  vencemHoje: number;
  proximas: number;
};

/** Contagens de tarefas de UMA pessoa a partir das `DashTask` já
 * resolvidas (mesmo `bucket` do restante da plataforma — nunca recalcula
 * atraso por conta própria). */
export function memberTaskStats(tasks: DashTask[]): MemberTaskStats {
  let abertas = 0;
  let atrasadas = 0;
  let vencemHoje = 0;
  let proximas = 0;
  for (const t of tasks) {
    if (!OPEN_STATUSES.has(t.status)) continue;
    abertas += 1;
    if (t.bucket === "atrasada") atrasadas += 1;
    else if (t.bucket === "hoje") {
      vencemHoje += 1;
      proximas += 1;
    } else if (t.bucket === "amanha" || t.bucket === "semana") proximas += 1;
  }
  return { abertas, atrasadas, vencemHoje, proximas };
}

/** Segundos de um registro de tempo; timer ainda rodando conta até agora. */
export function entrySeconds(e: TimeEntry, nowMs: number = Date.now()): number {
  if (e.durationSeconds != null) return Math.max(0, e.durationSeconds);
  const start = new Date(e.startedAt).getTime();
  const end = e.endedAt ? new Date(e.endedAt).getTime() : nowMs;
  return Math.max(0, Math.round((end - start) / 1000));
}

export function totalSecondsByUser(
  entries: TimeEntry[],
  nowMs: number = Date.now(),
): Map<string, number> {
  const map = new Map<string, number>();
  for (const e of entries) map.set(e.userId, (map.get(e.userId) ?? 0) + entrySeconds(e, nowMs));
  return map;
}

/** "0,4h", "12,5h", "—" quando não há registro — nunca "0h" enganoso. */
export function formatHours(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0) return "—";
  const h = seconds / 3600;
  return `${h.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}h`;
}

export type JourneyDay = {
  day: string; // YYYY-MM-DD (Brasília)
  firstStart: string; // ISO do primeiro registro
  lastEnd: string | null; // ISO do último fim; null se ainda rodando
  seconds: number;
  entries: number;
  running: boolean;
};

/** Agrupa registros por dia (Brasília), do mais recente pro mais antigo.
 * "Saída" = último fim de registro do dia, só quando nenhum timer do dia
 * segue rodando. */
export function groupJourneyByDay(entries: TimeEntry[], nowMs: number = Date.now()): JourneyDay[] {
  const byDay = new Map<string, JourneyDay>();
  for (const e of entries) {
    const day = todayIsoInBrasilia(new Date(e.startedAt));
    const cur = byDay.get(day);
    const secs = entrySeconds(e, nowMs);
    const running = e.endedAt == null && e.durationSeconds == null;
    if (!cur) {
      byDay.set(day, {
        day,
        firstStart: e.startedAt,
        lastEnd: running ? null : e.endedAt,
        seconds: secs,
        entries: 1,
        running,
      });
      continue;
    }
    cur.seconds += secs;
    cur.entries += 1;
    if (e.startedAt < cur.firstStart) cur.firstStart = e.startedAt;
    if (running) {
      cur.running = true;
      cur.lastEnd = null;
    } else if (!cur.running && e.endedAt && (!cur.lastEnd || e.endedAt > cur.lastEnd)) {
      cur.lastEnd = e.endedAt;
    }
  }
  return Array.from(byDay.values()).sort((a, b) => (a.day < b.day ? 1 : -1));
}
