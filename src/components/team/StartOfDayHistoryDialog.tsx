import { useMemo, useState } from "react";
import { Clock } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { todayIsoInBrasilia } from "@/lib/timezone";
import type { Member } from "@/components/TimeSection";

const HISTORY_PERIODS = [
  { value: 7, label: "Últimos 7 dias" },
  { value: 30, label: "Últimos 30 dias" },
  { value: 90, label: "Últimos 90 dias" },
] as const;

export function formatStartOfDayDateBR(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

/** Dias atrás de `date` (Brasília) — usado pra filtrar o histórico a uma
 * janela sem depender do fuso do navegador. */
function daysAgoInBrasilia(iso: string, sinceDaysAgo: number, today: string): boolean {
  const [ty, tm, td] = today.split("-").map(Number);
  const [y, m, d] = iso.split("-").map(Number);
  const diff = (Date.UTC(ty, tm - 1, td) - Date.UTC(y, m - 1, d)) / 86_400_000;
  return diff >= 0 && diff < sinceDaysAgo;
}

/** Média real de horário de início dentro da janela — só sobre dias com
 * registro de verdade. Nunca considera dias sem registro como 00:00 ou
 * qualquer horário fictício; devolve `null` se não houver nenhum dado. */
export function averageStartTime(
  startTimes: Record<string, string> | undefined,
  sinceDaysAgo: number,
): string | null {
  const today = todayIsoInBrasilia();
  const minutes = Object.entries(startTimes ?? {})
    .filter(([d, h]) => d && h && daysAgoInBrasilia(d, sinceDaysAgo, today))
    .map(([, h]) => {
      const [hh, mm] = h.split(":").map(Number);
      return hh * 60 + mm;
    })
    .filter((n) => Number.isFinite(n));
  if (minutes.length === 0) return null;
  const avg = Math.round(minutes.reduce((a, b) => a + b, 0) / minutes.length);
  const hh = String(Math.floor(avg / 60)).padStart(2, "0");
  const mm = String(avg % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

/** Histórico + média de "Início do dia" de UM membro — único lugar do app
 * que renderiza essa lista, reaproveitado tanto pelo bloco consolidado da
 * aba Time (`TeamStartOfDay`) quanto pelo card da ficha individual
 * (`MemberProfileDialog`), pra nunca divergir a lógica entre os dois. */
export function StartOfDayHistoryDialog({
  member,
  open,
  onOpenChange,
}: {
  member: Member | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [periodDays, setPeriodDays] = useState<number>(30);
  const today = todayIsoInBrasilia();

  const entries = useMemo(() => {
    if (!member) return [];
    return Object.entries(member.startTimes ?? {})
      .filter(([d, h]) => d && h && daysAgoInBrasilia(d, periodDays, today))
      .sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [member, periodDays, today]);

  const average = member ? averageStartTime(member.startTimes, periodDays) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-1.5">
            <Clock className="h-4 w-4 text-muted-foreground" /> Início do dia
          </DialogTitle>
          <DialogDescription>{member?.name}</DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between gap-3 border-b border-border pb-2">
          <span className="text-xs text-muted-foreground">Média no período</span>
          <span className="text-sm font-semibold tabular-nums text-foreground">
            {average ?? "—"}
          </span>
        </div>

        {entries.length === 0 ? (
          <p className="py-3 text-center text-xs text-muted-foreground">
            Nenhum registro de início nesse período.
          </p>
        ) : (
          <ul className="max-h-72 space-y-1 overflow-y-auto">
            {entries.map(([d, h]) => (
              <li
                key={d}
                className="flex items-center justify-between rounded-md bg-muted/40 px-2.5 py-1.5 text-xs"
              >
                <span className="text-muted-foreground">
                  {d === today ? "Hoje" : formatStartOfDayDateBR(d)}
                </span>
                <span className="font-medium tabular-nums text-foreground">{h}</span>
              </li>
            ))}
          </ul>
        )}

        <select
          value={periodDays}
          onChange={(e) => setPeriodDays(Number(e.target.value))}
          className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs outline-none focus:ring-2 focus:ring-ring"
        >
          {HISTORY_PERIODS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </DialogContent>
    </Dialog>
  );
}
