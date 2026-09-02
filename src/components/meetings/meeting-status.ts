import type { Meeting, MeetingStatus } from "@/lib/reunioes-store";

export function toISODate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseISODate(s: string) {
  if (!s) return new Date(NaN);
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function formatBR(iso: string) {
  const d = parseISODate(iso);
  const wd = [
    "Domingo",
    "Segunda-feira",
    "Terça-feira",
    "Quarta-feira",
    "Quinta-feira",
    "Sexta-feira",
    "Sábado",
  ][d.getDay()];
  const mo = [
    "janeiro",
    "fevereiro",
    "março",
    "abril",
    "maio",
    "junho",
    "julho",
    "agosto",
    "setembro",
    "outubro",
    "novembro",
    "dezembro",
  ][d.getMonth()];
  return `${wd}, ${d.getDate()} de ${mo}`;
}

export function formatBRShort(iso: string) {
  const d = parseISODate(iso);
  const wd = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"][d.getDay()];
  const mo = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"][
    d.getMonth()
  ];
  return `${wd}, ${d.getDate()} ${mo}`;
}

export function monthLabel(d: Date) {
  const s = d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Única convenção de cor de status do app — emerald=Confirmada,
 * amber=Pendente, muted+riscado=Cancelada. Não existe token semântico
 * `--success`/`--warning` no design system nem variante de `Badge` pra
 * isso, então mantemos esse par de helpers em vez de inventar uma
 * linguagem visual nova de badge. */
export function statusTone(s: MeetingStatus) {
  if (s === "Confirmada") return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400";
  if (s === "Pendente") return "bg-amber-500/10 text-amber-700 dark:text-amber-400";
  return "bg-muted text-muted-foreground line-through";
}

export function statusDot(s: MeetingStatus) {
  if (s === "Confirmada") return "bg-emerald-500";
  if (s === "Pendente") return "bg-amber-500";
  return "bg-muted-foreground/40";
}

export function participantBadge(kind: "confirmed" | "declined" | "pending") {
  if (kind === "confirmed") return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400";
  if (kind === "declined") return "bg-red-500/10 text-red-700 dark:text-red-400";
  return "bg-amber-500/10 text-amber-700 dark:text-amber-400";
}

/** "Agora" / "Em 8 min" / "Em 2h" / "Amanhã" — sempre complementa o
 * horário absoluto, nunca o substitui (retorna `null` quando a reunião
 * já não é "próxima" o suficiente pra um tempo relativo fazer sentido,
 * ex: mais de 1 dia no futuro ou já encerrada). */
export function relativeTime(startMs: number): string | null {
  const diffMs = startMs - Date.now();
  if (diffMs < -60_000) return null; // já começou/passou — o absoluto já basta
  if (diffMs <= 60_000) return "Agora";
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 60) return `Em ${minutes} min`;
  const hours = Math.round(diffMs / 3_600_000);
  const sameDay = toISODate(new Date(startMs)) === toISODate(new Date());
  if (sameDay) return `Em ${hours}h`;
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (toISODate(new Date(startMs)) === toISODate(tomorrow)) return "Amanhã";
  return null;
}

/** Agrupa reuniões por `data` (yyyy-mm-dd) — generaliza o agrupamento
 * que a grade mensal já fazia inline, reusado também pela Agenda. */
export function groupByDate(meetings: Meeting[]): Map<string, Meeting[]> {
  const map = new Map<string, Meeting[]>();
  for (const m of meetings) {
    if (!map.has(m.data)) map.set(m.data, []);
    map.get(m.data)!.push(m);
  }
  for (const list of map.values()) list.sort((a, b) => a.hora.localeCompare(b.hora));
  return map;
}
