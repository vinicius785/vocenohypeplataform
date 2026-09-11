import { useMemo, useState } from "react";
import { LogIn, CalendarDays, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Meeting } from "@/lib/reunioes-store";
import { meetingStartTime, meetingEndTime, meetingDisplayStatus } from "@/lib/reunioes-store";
import { toISODate, formatBR, statusTone, groupByDate, relativeTime } from "./meeting-status";
import { AvatarStack } from "./AvatarStack";
import { MeetingLine, joinUrlFor, peopleFor } from "./MeetingLine";

type TeamMember = { id: string; name: string; photo?: string };

const DAYS_WINDOW_DEFAULT = 7;
const DAYS_WINDOW_EXPANDED = 30;
const SOON_WINDOW_MS = 15 * 60_000;

export function AgendaView({
  meetings,
  me,
  team,
  onOpen,
  onNewMeeting,
  hojeCount,
  semanaCount,
  pendentes,
}: {
  meetings: Meeting[];
  me: { id: string; name: string };
  team: TeamMember[];
  onOpen: (m: Meeting) => void;
  onNewMeeting?: () => void;
  hojeCount: number;
  semanaCount: number;
  pendentes: number;
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
  // "Entrar agora" só vira a ação dominante quando a entrada é real (já
  // começou ou começa nos próximos 15min) — pra "próxima reunião" daqui
  // a 3 dias, a ação principal é só ver os detalhes.
  const heroCanJoinNow =
    !!hero && !!heroUrl && (!!acontecendoAgora || meetingStartTime(hero) - now <= SOON_WINDOW_MS);

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

  const isEmpty = !hero && todayMeetings.length === 0 && upcomingByDate.size === 0;

  return (
    <div className="space-y-6">
      {/* Resumo operacional — faixa compacta de apoio, nunca 3 cards
       * grandes equivalentes. "Pendentes" só ganha destaque amarelo
       * quando há de fato solicitações aguardando resposta. */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 rounded-2xl bg-card px-4 py-3 text-sm dark:shadow-none">
        <span>
          <span className="text-base font-semibold text-foreground">{hojeCount}</span>{" "}
          <span className="text-text-secondary">
            {hojeCount === 1 ? "reunião hoje" : "reuniões hoje"}
          </span>
        </span>
        <span className="text-border">·</span>
        <span>
          <span className="text-base font-semibold text-foreground">{semanaCount}</span>{" "}
          <span className="text-text-secondary">esta semana</span>
        </span>
        <span className="text-border">·</span>
        <span className={pendentes > 0 ? "font-medium text-warning" : "text-text-secondary"}>
          {pendentes} {pendentes === 1 ? "pendente" : "pendentes"}
        </span>
      </div>

      {isEmpty ? (
        <div className="rounded-[24px] bg-card p-10 text-center dark:shadow-none">
          <CalendarDays className="mx-auto h-8 w-8 text-text-secondary/50" />
          <p className="mt-3 text-sm font-medium text-foreground">Nenhuma reunião agendada</p>
          <p className="mt-1 text-sm text-text-secondary">
            Crie uma nova reunião ou entre com um código/link no topo da página.
          </p>
          {onNewMeeting && (
            <Button variant="primary" size="comfortable" className="mt-5" onClick={onNewMeeting}>
              <Plus className="h-4 w-4" /> Nova reunião
            </Button>
          )}
        </div>
      ) : (
        <>
          {hero && (
            <div
              className={
                acontecendoAgora
                  ? "rounded-[28px] bg-card p-6 dark:shadow-none md:p-7"
                  : "rounded-[28px] bg-brand p-6 dark:shadow-none md:p-7"
              }
            >
              <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide">
                {acontecendoAgora ? (
                  <>
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
                    </span>
                    <span className="text-success">Acontecendo agora</span>
                  </>
                ) : (
                  <span className="inline-flex items-center rounded-full bg-black/10 px-3 py-1 text-brand-foreground">
                    Próxima reunião
                  </span>
                )}
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-6">
                <div className="shrink-0">
                  <div
                    className={`text-4xl font-bold tabular-nums tracking-tight ${acontecendoAgora ? "text-foreground" : "text-brand-foreground"}`}
                  >
                    {hero.hora}
                  </div>
                  {heroRelative && (
                    <div
                      className={`mt-0.5 text-sm font-medium ${acontecendoAgora ? "text-text-secondary" : "text-brand-foreground-secondary"}`}
                    >
                      {heroRelative}
                    </div>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <p
                    className={`truncate text-xl font-medium ${acontecendoAgora ? "text-foreground" : "text-brand-foreground"}`}
                  >
                    {hero.titulo}
                  </p>
                  <div className="mt-2.5 flex flex-wrap items-center gap-2.5">
                    <AvatarStack people={heroPeople} max={4} size="md" />
                    {acontecendoAgora ? (
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${statusTone(meetingDisplayStatus(hero))}`}
                      >
                        {meetingDisplayStatus(hero)}
                      </span>
                    ) : (
                      <span className="rounded-full bg-black/10 px-2 py-0.5 text-[11px] font-medium text-brand-foreground-secondary">
                        {meetingDisplayStatus(hero)}
                      </span>
                    )}
                    <span
                      className={`text-xs ${acontecendoAgora ? "text-text-secondary" : "text-brand-foreground-secondary"}`}
                    >
                      · {hero.duracao} min
                    </span>
                  </div>
                </div>

                <div className="flex w-full shrink-0 gap-2 sm:w-auto">
                  {heroCanJoinNow && heroUrl && (
                    <a
                      href={heroUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="flex-1 sm:flex-none"
                    >
                      <Button
                        size="comfortable"
                        className={
                          acontecendoAgora
                            ? "w-full"
                            : "w-full border-0 bg-brand-foreground text-brand hover:bg-brand-foreground/90"
                        }
                        variant={acontecendoAgora ? "primary" : undefined}
                      >
                        <LogIn className="h-4 w-4" />
                        {acontecendoAgora ? "Entrar agora" : "Entrar na reunião"}
                      </Button>
                    </a>
                  )}
                  <Button
                    size="comfortable"
                    variant="outline"
                    className={
                      acontecendoAgora
                        ? "flex-1 sm:flex-none"
                        : "flex-1 border-brand-border bg-transparent text-brand-foreground hover:bg-black/10 sm:flex-none"
                    }
                    onClick={() => onOpen(hero)}
                  >
                    Ver detalhes
                  </Button>
                </div>
              </div>
            </div>
          )}

          <div className="rounded-[24px] bg-card p-5 dark:shadow-none">
            <div className="flex items-baseline gap-2">
              <h2 className="text-[15px] font-semibold text-foreground">Hoje</h2>
              <span className="text-xs text-text-secondary">{formatBR(today)}</span>
            </div>
            {todayMeetings.length === 0 ? (
              <p className="mt-2 text-sm text-text-secondary">Nenhuma reunião hoje.</p>
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

            {upcomingByDate.size > 0 && (
              <div className="mt-5 border-t border-border/60 pt-5">
                <h2 className="text-[15px] font-semibold text-foreground">Próximos dias</h2>
                <div className="mt-2 space-y-3">
                  {Array.from(upcomingByDate.entries()).map(([iso, list]) => (
                    <div key={iso}>
                      <p className="pb-1 text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
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
                    className="mt-3 text-xs font-medium text-text-secondary hover:text-foreground"
                  >
                    Ver mais
                  </button>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
