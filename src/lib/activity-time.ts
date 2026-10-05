/** "Hoje · 16:04", "Ontem · 18:20" ou "05/10 · 09:00" — rótulo de data das linhas de atividade. */
export function formatActivityWhen(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  const hhmm = `${p(d.getHours())}:${p(d.getMinutes())}`;
  const key = (x: Date) => `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`;
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (key(d) === key(now)) return `Hoje · ${hhmm}`;
  if (key(d) === key(yesterday)) return `Ontem · ${hhmm}`;
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} · ${hhmm}`;
}
