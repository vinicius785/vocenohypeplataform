import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Trophy, UsersIcon } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { usePerformanceEvents } from "@/lib/performance-events-store";
import {
  sumXpForPeriod,
  groupEventsByPerson,
  dedupAttendanceEvents,
} from "@/lib/performance-engine";
import { monthKey, fromMonthKey, fmtMonth, todayISO } from "@/lib/financeiro-entries";
import type { Member } from "@/components/TimeSection";
import { avatarAccent, initialsOf } from "./member-ui";

/**
 * "Ranking do mês" — XP, gamificação, deliberadamente separado da
 * Performance Operacional (item 5 do pedido: nunca chamar isso de
 * "Performance do Time"). Reinicia todo mês; meses anteriores continuam
 * consultáveis porque o XP é recomputado ao vivo a partir do ledger
 * filtrado ao mês, nunca precisou de snapshot.
 */
export function TeamXpRanking({ members }: { members: Member[] }) {
  const [month, setMonth] = useState(() => monthKey(new Date()));
  const isCurrentMonth = month === monthKey(new Date());

  const range = useMemo(() => {
    const start = fromMonthKey(month);
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
    const to = isCurrentMonth
      ? todayISO()
      : `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}`;
    const from = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-01`;
    return { from, to };
  }, [month, isCurrentMonth]);

  const { events, loading } = usePerformanceEvents(range);

  const ranked = useMemo(() => {
    const attendance = dedupAttendanceEvents(
      events.filter((e) => e.eventType === "meeting_attendance_recorded"),
    );
    const nonAttendance = events.filter((e) => e.eventType !== "meeting_attendance_recorded");
    const byPerson = groupEventsByPerson([...nonAttendance, ...attendance]);
    return members
      .map((m) => ({ member: m, xp: sumXpForPeriod(byPerson.get(m.id) ?? []) }))
      .filter((r) => r.xp !== 0 || (byPerson.get(r.member.id)?.length ?? 0) > 0)
      .sort((a, b) => b.xp - a.xp);
  }, [members, events]);

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-2 px-1">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          <Trophy className="h-3.5 w-3.5 text-amber-500" /> Ranking do mês
        </h3>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() =>
              setMonth((k) =>
                monthKey(
                  new Date(fromMonthKey(k).getFullYear(), fromMonthKey(k).getMonth() - 1, 1),
                ),
              )
            }
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Mês anterior"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <span className="min-w-[110px] text-center text-xs font-medium text-foreground">
            {fmtMonth(month)}
          </span>
          <button
            type="button"
            onClick={() =>
              setMonth((k) =>
                monthKey(
                  new Date(fromMonthKey(k).getFullYear(), fromMonthKey(k).getMonth() + 1, 1),
                ),
              )
            }
            disabled={isCurrentMonth}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
            aria-label="Próximo mês"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="mt-3">
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="h-11 animate-pulse rounded-lg border border-border bg-muted/30"
              />
            ))}
          </div>
        ) : ranked.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-background p-8 text-center">
            <UsersIcon className="mx-auto h-7 w-7 text-muted-foreground/50" />
            <p className="mt-2 text-sm text-muted-foreground">
              Nenhuma atividade pontuada neste mês.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {ranked.map((r, i) => (
              <li key={r.member.id} className="flex items-center gap-3 px-3 py-2">
                <span className="w-5 shrink-0 text-center text-xs font-semibold tabular-nums text-muted-foreground">
                  {i + 1}º
                </span>
                <Avatar className="h-7 w-7 shrink-0">
                  {r.member.photo && <AvatarImage src={r.member.photo} alt={r.member.name} />}
                  <AvatarFallback
                    className={`text-[11px] font-semibold ${avatarAccent(r.member.id)}`}
                  >
                    {initialsOf(r.member.name, r.member.email)}
                  </AvatarFallback>
                </Avatar>
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                  {r.member.name || "(sem nome)"}
                </span>
                <span
                  className={`shrink-0 text-sm font-semibold tabular-nums ${
                    r.xp > 0
                      ? "text-emerald-600 dark:text-emerald-400"
                      : r.xp < 0
                        ? "text-destructive"
                        : "text-foreground"
                  }`}
                >
                  {r.xp > 0 ? "+" : ""}
                  {r.xp} XP
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
