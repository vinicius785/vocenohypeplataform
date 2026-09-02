import { useMemo, useState } from "react";
import { LogIn, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Meeting } from "@/lib/reunioes-store";
import { meetingStartTime, meetingEndTime, meetingDisplayStatus } from "@/lib/reunioes-store";
import { toISODate, formatBR, statusTone, groupByDate, relativeTime } from "./meeting-status";
import { AvatarStack } from "./AvatarStack";
import { MeetingLine, joinUrlFor, peopleFor } from "./MeetingLine";

type TeamMember = { id: string; name: string; photo?: string };

const DAYS_WINDOW_DEFAULT = 7;
const DAYS_WINDOW_EXPANDED = 30;

export function AgendaView({
  meetings,
  me,
  team,
  onOpen,
}: {
  meetings: Meeting[];
  me: { id: string; name: string };
  team: TeamMember[];
  onOpen: (m: Meeting) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const today = toISODate(new Date());

  const sorted = useMemo(
    () =>
      [...meetings]
        .filter((m) => m.status !== "Cancelada")
        .sort((a, b) => (a.data + a.hora).localeCompare(b.data + b.hora)),
    [meetings],
  );

  const now = Date.now();
  const acontecendoAgora = sorted.find((m) => {
    const start = meetingStartTime(m);
    const end = meetingEndTime(m);
    return now >= start && now <= end;
  });
  const proximaReuniao = !acontecendoAgora
    ? sorted.find((m) => meetingStartTime(m) > now)
    : undefined;

  const hero = acontecendoAgora ?? proximaReuniao;
  const heroPeople = hero ? peopleFor(hero, team, me) : [];
  const heroUrl = hero ? joinUrlFor(hero) : null;
  const heroRelative = hero ? relativeTime(meetingStartTime(hero)) : null;

  const todayMeetings = useMemo(() => sorted.filter((m) => m.data === today), [sorted, today]);

  const windowDays = expanded ? DAYS_WINDOW_EXPANDED : DAYS_WINDOW_DEFAULT;
  const upcoming = useMemo(() => {
    const limit = new Date();
    limit.setDate(limit.getDate() + windowDays);
    const limitIso = toISODate(limit);
    return sorted.filter((m) => m.data > today && m.data <= limitIso);
  }, [sorted, today, windowDays]);
  const upcomingByDate = useMemo(() => groupByDate(upcoming), [upcoming]);

  const hasMoreBeyondWindow = useMemo(() => {
    if (expanded) return false;
    return sorted.some((m) => m.data > today);
  }, [sorted, today, expanded]);

  const tomorrowIso = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return toISODate(d);
  }, []);

  if (!hero && todayMeetings.length === 0 && upcomingByDate.size === 0) {
    return (
      <div className="mt-6 rounded-xl border border-dashed border-border p-10 text-center">
        <CalendarDays className="mx-auto h-6 w-6 text-muted-foreground" />
        <p className="mt-3 text-sm font-medium text-foreground">Nenhuma reunião agendada</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Crie uma nova reunião ou entre com um código/link no topo da página.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-7">
      {hero && (
        <div
          className={`group rounded-2xl border p-6 transition-colors ${
            acontecendoAgora ? "border-emerald-500/30 bg-emerald-500/5" : "border-border bg-card"
          }`}
        >
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide">
            {acontecendoAgora ? (
              <>
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                </span>
                <span className="text-emerald-700 dark:text-emerald-400">Acontecendo agora</span>
              </>
            ) : (
              <span className="text-muted-foreground">Próxima reunião</span>
            )}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-6">
            <div className="shrink-0">
              <div className="text-4xl font-semibold tabular-nums tracking-tight text-foreground">
                {hero.hora}
              </div>
              {heroRelative && (
                <div className="mt-0.5 text-sm font-medium text-muted-foreground">
                  {heroRelative}
                </div>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <p className="truncate text-xl font-medium text-foreground">{hero.titulo}</p>
              <div className="mt-2.5 flex items-center gap-2.5">
                <AvatarStack people={heroPeople} max={4} size="md" />
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${statusTone(meetingDisplayStatus(hero))}`}
                >
                  {meetingDisplayStatus(hero)}
                </span>
                <span className="text-xs text-muted-foreground">· {hero.duracao} min</span>
              </div>
            </div>

            <div className="flex w-full shrink-0 gap-2 sm:w-auto">
              {heroUrl && (
                <a href={heroUrl} target="_blank" rel="noreferrer" className="flex-1 sm:flex-none">
                  <Button size="sm" className="w-full">
                    <LogIn className="h-3.5 w-3.5" />
                    {acontecendoAgora ? "Entrar agora" : "Entrar na reunião"}
                  </Button>
                </a>
              )}
              <Button
                size="sm"
                variant="outline"
                className="flex-1 sm:flex-none"
                onClick={() => onOpen(hero)}
              >
                Ver detalhes
              </Button>
            </div>
          </div>
        </div>
      )}

      <div>
        <div className="flex items-baseline gap-2">
          <h2 className="text-sm font-semibold">Hoje</h2>
          <span className="text-xs text-muted-foreground">{formatBR(today)}</span>
        </div>
        {todayMeetings.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground/70">Nenhuma reunião hoje.</p>
        ) : (
          <ul className="mt-1 divide-y divide-border/60">
            {todayMeetings.map((m) => (
              <MeetingLine
                key={m.id}
                meeting={m}
                people={peopleFor(m, team, me)}
                onOpen={() => onOpen(m)}
                dimmed={meetingEndTime(m) < now}
              />
            ))}
          </ul>
        )}
      </div>

      {upcomingByDate.size > 0 && (
        <div>
          <h2 className="text-sm font-semibold">Próximos dias</h2>
          <div className="mt-2 space-y-3">
            {Array.from(upcomingByDate.entries()).map(([iso, list]) => (
              <div key={iso}>
                <p className="border-b border-border/60 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {iso === tomorrowIso ? "Amanhã · " : ""}
                  {formatBR(iso)}
                </p>
                <ul className="divide-y divide-border/60">
                  {list.map((m) => (
                    <MeetingLine
                      key={m.id}
                      meeting={m}
                      people={peopleFor(m, team, me)}
                      onOpen={() => onOpen(m)}
                    />
                  ))}
                </ul>
              </div>
            ))}
          </div>
          {hasMoreBeyondWindow && (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="mt-3 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              Ver mais
            </button>
          )}
        </div>
      )}
    </div>
  );
}
