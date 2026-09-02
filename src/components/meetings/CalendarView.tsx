import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, CalendarDays, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import type { Meeting, Availability } from "@/lib/reunioes-store";
import { blocksForDate, meetingDisplayStatus } from "@/lib/reunioes-store";
import { toISODate, formatBR, monthLabel, statusDot, groupByDate } from "./meeting-status";
import { MeetingLine, peopleFor } from "./MeetingLine";

const DIAS_LABEL = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];

type TeamMember = { id: string; name: string; photo?: string };

export function CalendarView({
  meetings,
  me,
  team,
  myAvail,
  onOpen,
  onNewMeeting,
}: {
  meetings: Meeting[];
  me: { id: string; name: string };
  team: TeamMember[];
  myAvail: Availability;
  onOpen: (m: Meeting) => void;
  onNewMeeting: () => void;
}) {
  const [cursor, setCursor] = useState<Date>(() => new Date());
  const [selected, setSelected] = useState<string>(() => toISODate(new Date()));

  const selectedMeetings = useMemo(
    () => meetings.filter((m) => m.data === selected).sort((a, b) => a.hora.localeCompare(b.hora)),
    [meetings, selected],
  );

  return (
    <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Mês anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="min-w-[140px] text-sm font-medium">{monthLabel(cursor)}</div>
            <button
              type="button"
              onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Próximo mês"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                const now = new Date();
                setCursor(new Date(now.getFullYear(), now.getMonth(), 1));
                setSelected(toISODate(now));
              }}
              className="ml-1 rounded-full border border-border px-3 py-1 text-xs hover:bg-muted"
            >
              Hoje
            </button>
          </div>
          <Button size="sm" onClick={onNewMeeting}>
            <Plus className="h-3.5 w-3.5" /> Nova reunião
          </Button>
        </div>

        <MonthGrid
          cursor={cursor}
          selected={selected}
          meetings={meetings}
          onSelect={setSelected}
          onOpen={onOpen}
        />
      </div>

      <div>
        <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Selecionado
        </div>
        <div className="mt-1 text-base font-semibold">{formatBR(selected)}</div>
        <p className="text-xs text-muted-foreground">
          {selectedMeetings.length === 0
            ? "Nenhuma reunião"
            : `${selectedMeetings.length} ${selectedMeetings.length === 1 ? "reunião" : "reuniões"}`}
        </p>

        {blocksForDate(myAvail, selected).length > 0 && (
          <div className="mt-3 space-y-1.5 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
              Você marcou indisponibilidade neste dia
            </p>
            {blocksForDate(myAvail, selected).map((b) => (
              <p key={b.id} className="text-xs text-amber-700 dark:text-amber-400">
                {b.inicio}–{b.fim}
                {b.motivo ? ` · ${b.motivo}` : ""}
              </p>
            ))}
          </div>
        )}

        {selectedMeetings.length === 0 ? (
          <div className="mt-4 rounded-lg border border-dashed border-border p-8 text-center">
            <CalendarDays className="mx-auto h-5 w-5 text-muted-foreground" />
            <p className="mt-2 text-sm text-muted-foreground">Nenhuma reunião neste dia.</p>
          </div>
        ) : (
          <ul className="mt-2 divide-y divide-border/60">
            {selectedMeetings.map((m) => (
              <MeetingLine
                key={m.id}
                meeting={m}
                people={peopleFor(m, team, me)}
                onOpen={() => onOpen(m)}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function MonthGrid({
  cursor,
  selected,
  meetings,
  onSelect,
  onOpen,
}: {
  cursor: Date;
  selected: string;
  meetings: Meeting[];
  onSelect: (iso: string) => void;
  onOpen: (m: Meeting) => void;
}) {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const startOffset = first.getDay();
  const startDate = new Date(first);
  startDate.setDate(first.getDate() - startOffset);
  const cells: Date[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(startDate);
    d.setDate(startDate.getDate() + i);
    cells.push(d);
  }
  const today = toISODate(new Date());
  const byDate = useMemo(() => groupByDate(meetings), [meetings]);

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="grid grid-cols-7 border-b border-border bg-muted/30">
        {DIAS_LABEL.map((d) => (
          <div
            key={d}
            className="px-3 py-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground"
          >
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((d, idx) => {
          const iso = toISODate(d);
          const inMonth = d.getMonth() === cursor.getMonth();
          const isToday = iso === today;
          const isSel = iso === selected;
          const items = byDate.get(iso) ?? [];
          const shown = items.slice(0, 2);
          const rest = items.slice(2);
          return (
            <div
              key={idx}
              className={`min-h-[92px] border-b border-r border-border p-1.5 text-left align-top transition-colors last-in-row:border-r-0 ${
                inMonth ? "" : "bg-background/40 text-muted-foreground/60"
              } ${isSel ? "bg-muted/60" : ""}`}
            >
              <button
                type="button"
                onClick={() => onSelect(iso)}
                className="flex w-full items-center rounded hover:bg-muted/40"
              >
                <span
                  className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs tabular-nums ${
                    isToday ? "border border-foreground/40" : ""
                  }`}
                >
                  {d.getDate()}
                </span>
              </button>
              <div className="mt-1 space-y-0.5">
                {shown.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => onOpen(m)}
                    className="flex w-full items-center gap-1 truncate rounded px-0.5 text-left text-[11px] leading-4 hover:bg-muted/60"
                  >
                    <span
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${statusDot(meetingDisplayStatus(m))}`}
                    />
                    <span className="shrink-0 tabular-nums text-muted-foreground">{m.hora}</span>
                    <span className="truncate text-foreground">{m.titulo}</span>
                  </button>
                ))}
                {rest.length > 0 && (
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="px-0.5 text-[10px] font-medium text-muted-foreground hover:text-foreground hover:underline"
                      >
                        +{rest.length}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-64 p-2">
                      <p className="mb-1 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {formatBR(iso)}
                      </p>
                      <ul className="space-y-0.5">
                        {items.map((m) => (
                          <li key={m.id}>
                            <button
                              type="button"
                              onClick={() => onOpen(m)}
                              className="flex w-full items-center gap-1.5 truncate rounded px-1.5 py-1 text-left text-xs hover:bg-muted"
                            >
                              <span
                                className={`h-1.5 w-1.5 shrink-0 rounded-full ${statusDot(meetingDisplayStatus(m))}`}
                              />
                              <span className="shrink-0 tabular-nums text-muted-foreground">
                                {m.hora}
                              </span>
                              <span className="truncate">{m.titulo}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </PopoverContent>
                  </Popover>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
