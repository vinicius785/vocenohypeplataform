import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Ban, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { Meeting, Availability } from "@/lib/reunioes-store";
import { meetingDisplayStatus } from "@/lib/reunioes-store";
import {
  toISODate,
  formatBR,
  monthLabel,
  statusDot,
  groupByDate,
  startOfWeek,
  weekRangeLabel,
  WEEK_HOUR_START,
  WEEK_HOUR_END,
  HOUR_ROW_PX,
  motivoFor,
  blocksForDateAllMembers,
  type AttributedBlock,
} from "./meeting-status";
import { MeetingLine, peopleFor } from "./MeetingLine";

const DIAS_LABEL = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];

type TeamMember = { id: string; name: string; photo?: string };
type CalMode = "mes" | "semana";

export function CalendarView({
  meetings,
  me,
  team,
  disponibilidades,
  onOpen,
  onNewMeeting,
  onSaveAvailability,
}: {
  meetings: Meeting[];
  me: { id: string; name: string };
  team: TeamMember[];
  disponibilidades: Availability[];
  onOpen: (m: Meeting) => void;
  onNewMeeting: (dateIso: string, hora?: string) => void;
  /** Chamado só quando a pessoa exclui um bloqueio PRÓPRIO clicado no
   * calendário — mesma função que a aba Disponibilidade já usa
   * (upsert na própria linha; RLS não permite escrever a de outro
   * membro, então indisponibilidade alheia é só leitura aqui). */
  onSaveAvailability: (a: Availability) => void;
}) {
  const [mode, setMode] = useState<CalMode>("mes");
  const [cursor, setCursor] = useState<Date>(() => new Date());
  const [drawerDate, setDrawerDate] = useState<string | null>(null);

  const goToday = () => {
    const now = new Date();
    setCursor(mode === "mes" ? new Date(now.getFullYear(), now.getMonth(), 1) : now);
  };
  const goPrev = () => {
    if (mode === "mes") setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1));
    else {
      const d = new Date(cursor);
      d.setDate(d.getDate() - 7);
      setCursor(d);
    }
  };
  const goNext = () => {
    if (mode === "mes") setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1));
    else {
      const d = new Date(cursor);
      d.setDate(d.getDate() + 7);
      setCursor(d);
    }
  };

  const removeBlock = (ownerId: string, blockId: string) => {
    const avail = disponibilidades.find((a) => a.id === ownerId);
    if (!avail) return;
    onSaveAvailability({
      ...avail,
      bloqueios: (avail.bloqueios ?? []).filter((b) => b.id !== blockId),
    });
  };

  return (
    <div className="mt-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={goPrev}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="min-w-[160px] text-sm font-medium">
            {mode === "mes" ? monthLabel(cursor) : weekRangeLabel(startOfWeek(cursor))}
          </div>
          <button
            type="button"
            onClick={goNext}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Próximo"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={goToday}
            className="ml-1 rounded-full border border-border px-3 py-1 text-xs hover:bg-muted"
          >
            Hoje
          </button>
        </div>
        <div className="inline-flex items-center rounded-lg bg-muted p-1 text-xs">
          <button
            type="button"
            onClick={() => setMode("mes")}
            className={`rounded-md px-3 py-1 font-medium transition-colors ${
              mode === "mes" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
            }`}
          >
            Mês
          </button>
          <button
            type="button"
            onClick={() => setMode("semana")}
            className={`rounded-md px-3 py-1 font-medium transition-colors ${
              mode === "semana"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground"
            }`}
          >
            Semana
          </button>
        </div>
      </div>

      {mode === "mes" ? (
        <MonthGrid
          cursor={cursor}
          meetings={meetings}
          disponibilidades={disponibilidades}
          team={team}
          me={me}
          onSelectDay={setDrawerDate}
          onOpenMeeting={onOpen}
          onRemoveBlock={removeBlock}
        />
      ) : (
        <WeekGrid
          cursor={cursor}
          meetings={meetings}
          disponibilidades={disponibilidades}
          team={team}
          me={me}
          onOpenMeeting={onOpen}
          onCreateAt={onNewMeeting}
          onSelectDay={setDrawerDate}
          onRemoveBlock={removeBlock}
        />
      )}

      <DayDrawer
        dateIso={drawerDate}
        meetings={meetings}
        me={me}
        team={team}
        disponibilidades={disponibilidades}
        onClose={() => setDrawerDate(null)}
        onOpenMeeting={(m) => {
          setDrawerDate(null);
          onOpen(m);
        }}
        onNewMeeting={(iso) => {
          setDrawerDate(null);
          onNewMeeting(iso);
        }}
        onRemoveBlock={removeBlock}
      />
    </div>
  );
}

/** Conteúdo do popover de detalhes de uma indisponibilidade — usado no
 * Mês, na Semana e na lista do drawer do dia. Só mostra Excluir quando
 * é minha (RLS só permite escrever a própria linha de qualquer forma).
 * Edição fica só na aba Disponibilidade por enquanto, pra não duplicar
 * o formulário completo (dias/data/motivo) dentro do calendário. */
function AvailabilityDetails({
  item,
  dateISO,
  onRemove,
}: {
  item: AttributedBlock;
  dateISO: string;
  onRemove: () => void;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-semibold text-foreground">{item.ownerName}</p>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Ban className="h-3 w-3" /> Indisponível
      </p>
      <p className="text-xs text-muted-foreground">{formatBR(dateISO)}</p>
      <p className="text-xs text-muted-foreground">
        {item.block.inicio} – {item.block.fim}
      </p>
      {item.block.motivo && <p className="text-xs text-foreground">{motivoFor(item.block)}</p>}
      {item.isMine && (
        <button
          type="button"
          onClick={onRemove}
          className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-red-600 hover:underline dark:text-red-400"
        >
          <Trash2 className="h-3 w-3" /> Excluir
        </button>
      )}
    </div>
  );
}

function DayDrawer({
  dateIso,
  meetings,
  me,
  team,
  disponibilidades,
  onClose,
  onOpenMeeting,
  onNewMeeting,
  onRemoveBlock,
}: {
  dateIso: string | null;
  meetings: Meeting[];
  me: { id: string; name: string };
  team: TeamMember[];
  disponibilidades: Availability[];
  onClose: () => void;
  onOpenMeeting: (m: Meeting) => void;
  onNewMeeting: (dateIso: string, hora?: string) => void;
  onRemoveBlock: (ownerId: string, blockId: string) => void;
}) {
  const dayMeetings = useMemo(
    () =>
      dateIso
        ? meetings.filter((m) => m.data === dateIso).sort((a, b) => a.hora.localeCompare(b.hora))
        : [],
    [meetings, dateIso],
  );
  const blocks = dateIso ? blocksForDateAllMembers(disponibilidades, team, me, dateIso) : [];

  return (
    <Sheet open={!!dateIso} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        {dateIso && (
          <>
            <SheetHeader>
              <SheetTitle>{formatBR(dateIso).split(", ")[0]}</SheetTitle>
              <p className="text-sm text-muted-foreground">{formatBR(dateIso).split(", ")[1]}</p>
            </SheetHeader>

            {blocks.length > 0 && (
              <div className="mt-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Indisponibilidade
                </p>
                <ul className="mt-2 space-y-1.5">
                  {blocks.map((item) => (
                    <li
                      key={item.block.id}
                      className="flex items-center justify-between gap-2 rounded-md bg-amber-500/10 px-2.5 py-1.5 text-sm"
                    >
                      <span className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
                        <Ban className="h-3 w-3 shrink-0" />
                        {item.block.inicio}–{item.block.fim} · {item.ownerName}
                        {item.block.motivo ? ` · ${motivoFor(item.block)}` : ""}
                      </span>
                      {item.isMine && (
                        <button
                          type="button"
                          onClick={() => onRemoveBlock(item.ownerId, item.block.id)}
                          className="shrink-0 text-amber-700/70 hover:text-red-600 dark:text-amber-400/70 dark:hover:text-red-400"
                          aria-label="Excluir bloqueio"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Reuniões
              </p>
              {dayMeetings.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground/70">Nenhuma reunião nesse dia.</p>
              ) : (
                <ul className="mt-1 divide-y divide-border/60">
                  {dayMeetings.map((m) => (
                    <MeetingLine
                      key={m.id}
                      meeting={m}
                      people={peopleFor(m, team, me)}
                      onOpen={() => onOpenMeeting(m)}
                    />
                  ))}
                </ul>
              )}
            </div>

            <div className="mt-5">
              <Button size="sm" variant="outline" onClick={() => onNewMeeting(dateIso)}>
                <Plus className="h-3.5 w-3.5" /> Nova reunião
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function MonthGrid({
  cursor,
  meetings,
  disponibilidades,
  team,
  me,
  onSelectDay,
  onOpenMeeting,
  onRemoveBlock,
}: {
  cursor: Date;
  meetings: Meeting[];
  disponibilidades: Availability[];
  team: TeamMember[];
  me: { id: string; name: string };
  onSelectDay: (iso: string) => void;
  onOpenMeeting: (m: Meeting) => void;
  onRemoveBlock: (ownerId: string, blockId: string) => void;
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
          const meetingItems = byDate.get(iso) ?? [];
          const blocks = blocksForDateAllMembers(disponibilidades, team, me, iso);
          const totalCount = meetingItems.length + blocks.length;
          const shownMeetings = meetingItems.slice(0, 2);
          const shownBlocks = blocks.slice(0, Math.max(0, 2 - shownMeetings.length));
          const restCount = totalCount - shownMeetings.length - shownBlocks.length;
          return (
            <div
              key={idx}
              className={`min-h-[112px] border-b border-r border-border p-1.5 text-left align-top transition-colors last-in-row:border-r-0 ${
                inMonth ? "" : "bg-background/40 text-muted-foreground/60"
              }`}
            >
              <button
                type="button"
                onClick={() => onSelectDay(iso)}
                className="flex w-full items-center rounded hover:bg-muted/40"
              >
                <span
                  className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs tabular-nums ${
                    isToday ? "bg-foreground text-background" : ""
                  }`}
                >
                  {d.getDate()}
                </span>
              </button>
              {/* Abaixo de `sm:`, 7 colunas ficam estreitas demais pra
                  mostrar título de evento com legibilidade (item 23 do
                  pedido) — mantém só o número do dia + um indicador
                  compacto (pontinhos); o texto completo só aparece a
                  partir de `sm:`. Tocar no dia já abre o detalhe
                  (`onSelectDay`). */}
              {totalCount > 0 && (
                <div className="mt-1 flex flex-wrap gap-0.5 sm:hidden">
                  {Array.from({ length: Math.min(totalCount, 4) }).map((_, i) => (
                    <span key={i} className="h-1.5 w-1.5 shrink-0 rounded-full bg-foreground/50" />
                  ))}
                </div>
              )}
              <div className="mt-1 hidden space-y-0.5 sm:block">
                {shownMeetings.map((m) => (
                  <EventChip key={m.id} meeting={m} onOpen={() => onOpenMeeting(m)} />
                ))}
                {shownBlocks.map((item) => (
                  <AvailabilityChip
                    key={item.block.id}
                    item={item}
                    dateISO={iso}
                    onRemove={() => onRemoveBlock(item.ownerId, item.block.id)}
                  />
                ))}
                {restCount > 0 && (
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="px-0.5 text-[10px] font-medium text-muted-foreground hover:text-foreground hover:underline"
                      >
                        +{restCount}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-64 p-2">
                      <p className="mb-1 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {formatBR(iso)}
                      </p>
                      <ul className="space-y-0.5">
                        {meetingItems.map((m) => (
                          <li key={m.id}>
                            <button
                              type="button"
                              onClick={() => onOpenMeeting(m)}
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
                        {blocks.map((item) => (
                          <li
                            key={item.block.id}
                            className="flex items-center gap-1.5 px-1.5 py-1 text-xs"
                          >
                            <Ban className="h-3 w-3 shrink-0 text-amber-500" />
                            <span className="shrink-0 tabular-nums text-muted-foreground">
                              {item.block.inicio}
                            </span>
                            <span className="truncate text-amber-700 dark:text-amber-400">
                              {item.ownerName} · {motivoFor(item.block)}
                            </span>
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

function EventChip({ meeting, onOpen }: { meeting: Meeting; onOpen: () => void }) {
  const status = meetingDisplayStatus(meeting);
  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onOpen}
            className="flex w-full cursor-pointer items-center gap-1 truncate rounded px-0.5 text-left text-[11px] leading-4 hover:bg-muted/60"
          >
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${statusDot(status)}`} />
            <span className="shrink-0 tabular-nums text-muted-foreground">{meeting.hora}</span>
            <span className="truncate text-foreground">{meeting.titulo}</span>
          </button>
        </TooltipTrigger>
        <TooltipContent>
          <p className="font-medium">{meeting.titulo}</p>
          <p>
            {meeting.hora} · {meeting.duracao} min · {status}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function AvailabilityChip({
  item,
  dateISO,
  onRemove,
}: {
  item: AttributedBlock;
  dateISO: string;
  onRemove: () => void;
}) {
  return (
    <Popover>
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="flex w-full cursor-pointer items-center gap-1 truncate rounded px-0.5 text-left text-[11px] leading-4 hover:bg-muted/60"
              >
                <Ban className="h-2.5 w-2.5 shrink-0 text-amber-500" />
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {item.block.inicio}
                </span>
                <span className="truncate text-amber-700 dark:text-amber-400">
                  {item.ownerName} · Indisponível
                </span>
              </button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent>
            <p className="font-medium">{item.ownerName}</p>
            <p>Indisponível</p>
            <p>
              {item.block.inicio} – {item.block.fim}
            </p>
            {item.block.motivo && <p>{motivoFor(item.block)}</p>}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <PopoverContent align="start" className="w-56 p-3">
        <AvailabilityDetails item={item} dateISO={dateISO} onRemove={onRemove} />
      </PopoverContent>
    </Popover>
  );
}

function WeekGrid({
  cursor,
  meetings,
  disponibilidades,
  team,
  me,
  onOpenMeeting,
  onCreateAt,
  onSelectDay,
  onRemoveBlock,
}: {
  cursor: Date;
  meetings: Meeting[];
  disponibilidades: Availability[];
  team: TeamMember[];
  me: { id: string; name: string };
  onOpenMeeting: (m: Meeting) => void;
  onCreateAt: (dateIso: string, hora?: string) => void;
  onSelectDay: (iso: string) => void;
  onRemoveBlock: (ownerId: string, blockId: string) => void;
}) {
  const weekStart = startOfWeek(cursor);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });
  const today = toISODate(new Date());
  const hours = Array.from(
    { length: WEEK_HOUR_END - WEEK_HOUR_START + 1 },
    (_, i) => WEEK_HOUR_START + i,
  );
  const gridHeight = (hours.length - 1) * HOUR_ROW_PX;

  const minutesFromRangeStart = (hhmm: string) => {
    const [h, m] = hhmm.split(":").map(Number);
    return (h - WEEK_HOUR_START) * 60 + m;
  };

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <div className="min-w-[720px]">
        <div className="grid grid-cols-[3.5rem_repeat(7,1fr)] border-b border-border bg-muted/30">
          <div />
          {days.map((d) => {
            const iso = toISODate(d);
            const isToday = iso === today;
            return (
              <button
                key={iso}
                type="button"
                onClick={() => onSelectDay(iso)}
                className="flex flex-col items-center gap-0.5 py-2 hover:bg-muted/50"
              >
                <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {DIAS_LABEL[d.getDay()]}
                </span>
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-xs tabular-nums ${
                    isToday ? "bg-foreground text-background" : "text-foreground"
                  }`}
                >
                  {d.getDate()}
                </span>
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-[3.5rem_repeat(7,1fr)]">
          <div className="relative" style={{ height: gridHeight }}>
            {hours.slice(0, -1).map((h, i) => (
              <div
                key={h}
                className="absolute right-2 -translate-y-1/2 text-[11px] tabular-nums text-muted-foreground"
                style={{ top: i * HOUR_ROW_PX }}
              >
                {String(h).padStart(2, "0")}:00
              </div>
            ))}
          </div>
          {days.map((d) => {
            const iso = toISODate(d);
            const dayMeetings = meetings.filter((m) => m.data === iso);
            const blocks = blocksForDateAllMembers(disponibilidades, team, me, iso);
            return (
              <div
                key={iso}
                className="relative border-l border-border"
                style={{ height: gridHeight }}
              >
                {hours.slice(0, -1).map((h, i) => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => onCreateAt(iso, `${String(h).padStart(2, "0")}:00`)}
                    className="absolute inset-x-0 border-b border-border/40 transition-colors hover:bg-muted/40"
                    style={{ top: i * HOUR_ROW_PX, height: HOUR_ROW_PX }}
                    aria-label={`Nova reunião ${iso} ${h}:00`}
                  />
                ))}
                {blocks.map((item) => {
                  const top = Math.max(
                    0,
                    (minutesFromRangeStart(item.block.inicio) / 60) * HOUR_ROW_PX,
                  );
                  const height = Math.max(
                    16,
                    ((minutesFromRangeStart(item.block.fim) -
                      minutesFromRangeStart(item.block.inicio)) /
                      60) *
                      HOUR_ROW_PX,
                  );
                  return (
                    <Popover key={item.block.id}>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          onClick={(e) => e.stopPropagation()}
                          className="absolute inset-x-0.5 overflow-hidden rounded-sm border-l-2 border-amber-500 bg-amber-500/10 px-1.5 py-0.5 text-left transition-colors hover:bg-amber-500/20"
                          style={{ top, height }}
                        >
                          <p className="flex items-center gap-1 truncate text-[10px] font-medium text-amber-700 dark:text-amber-400">
                            <Ban className="h-2.5 w-2.5 shrink-0" /> {item.ownerName}
                          </p>
                          {height > 30 && (
                            <p className="truncate text-[10px] text-amber-700/80 dark:text-amber-400/80">
                              {motivoFor(item.block)}
                            </p>
                          )}
                        </button>
                      </PopoverTrigger>
                      <PopoverContent align="start" className="w-56 p-3">
                        <AvailabilityDetails
                          item={item}
                          dateISO={iso}
                          onRemove={() => onRemoveBlock(item.ownerId, item.block.id)}
                        />
                      </PopoverContent>
                    </Popover>
                  );
                })}
                {dayMeetings.map((m) => {
                  const top = Math.max(0, (minutesFromRangeStart(m.hora) / 60) * HOUR_ROW_PX);
                  const height = Math.max(20, (m.duracao / 60) * HOUR_ROW_PX);
                  const status = meetingDisplayStatus(m);
                  return (
                    <TooltipProvider key={m.id} delayDuration={300}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenMeeting(m);
                            }}
                            className="absolute inset-x-0.5 overflow-hidden rounded-md border-l-2 border-primary bg-primary/10 px-1.5 py-0.5 text-left transition-colors hover:bg-primary/20"
                            style={{ top, height }}
                          >
                            <p className="truncate text-[11px] font-medium text-foreground">
                              {m.hora} {m.titulo}
                            </p>
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="font-medium">{m.titulo}</p>
                          <p>
                            {m.hora} · {m.duracao} min · {status}
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
