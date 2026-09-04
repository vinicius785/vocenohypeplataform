import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Clock } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DateField } from "@/components/ui/date-field";
import { parseIsoDateLocal, formatDateToIso } from "@/lib/utils";
import { todayIsoInBrasilia } from "@/lib/timezone";
import type { Member } from "@/components/TimeSection";
import { avatarAccent, initialsOf } from "./member-ui";
import { StartOfDayHistoryDialog } from "./StartOfDayHistoryDialog";

function addDaysIso(iso: string, days: number): string {
  const d = parseIsoDateLocal(iso);
  d.setDate(d.getDate() + days);
  return formatDateToIso(d);
}

/** Bloco compacto "Início do dia" — status de registro de todos os
 * membros num dia (hoje por padrão, navegável). Puramente informativo:
 * não entra no Score Operacional, não infere horas trabalhadas, só mostra
 * QUEM começou e QUE HORAS. Visível apenas pra admins (mesmo padrão de
 * `canManage` já usado em `MemberPerformanceRow`) — dado sensível de
 * time, e um não-admin já recebe `startTimes: {}` de colegas do servidor
 * de qualquer forma (`getTeamDirectory`). */
export function TeamStartOfDay({
  members,
  onOpenMember,
}: {
  members: Member[];
  onOpenMember: (m: Member, opts?: { showComposition?: boolean }) => void;
}) {
  const today = todayIsoInBrasilia();
  const [selectedDate, setSelectedDate] = useState(today);
  const [historyFor, setHistoryFor] = useState<Member | null>(null);
  const isToday = selectedDate === today;

  const { started, notStarted } = useMemo(() => {
    const withTime = members
      .filter((m) => m.startTimes?.[selectedDate])
      .sort((a, b) => a.startTimes![selectedDate].localeCompare(b.startTimes![selectedDate]));
    const without = members.filter((m) => !m.startTimes?.[selectedDate]);
    return { started: withTime, notStarted: without };
  }, [members, selectedDate]);

  const total = members.length;

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            <Clock className="h-3.5 w-3.5 text-foreground/70" /> Início do dia
          </h3>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {total === 0
              ? "Nenhum membro ainda."
              : `${started.length} de ${total} iniciaram ${isToday ? "hoje" : "nesse dia"}`}
          </p>
        </div>

        <div className="flex items-center gap-0.5">
          <button
            type="button"
            aria-label="Dia anterior"
            onClick={() => setSelectedDate((d) => addDaysIso(d, -1))}
            className="cursor-pointer rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <DateField
            value={selectedDate}
            onChange={(v) => v && setSelectedDate(v)}
            variant="inline"
            max={today}
            className="text-xs font-medium"
            ariaLabel="Selecionar data"
          />
          <button
            type="button"
            aria-label="Próximo dia"
            disabled={isToday}
            onClick={() => setSelectedDate((d) => addDaysIso(d, 1))}
            className="cursor-pointer rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {total === 0 ? null : (
        <div className="mt-3 divide-y divide-border/60 rounded-lg border border-border">
          {started.length === 0 && (
            <p className="px-3 py-2.5 text-xs text-muted-foreground">
              Nenhum início registrado {isToday ? "hoje" : "nesse dia"}.
            </p>
          )}
          {[...started, ...notStarted].map((m) => {
            const time = m.startTimes?.[selectedDate];
            return (
              <div
                key={m.id}
                className="flex items-center gap-3 px-3 py-2 sm:grid sm:grid-cols-[1fr_auto_auto] sm:items-center"
              >
                <button
                  type="button"
                  onClick={() => onOpenMember(m)}
                  className="group flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md text-left sm:flex-none"
                >
                  <Avatar className="h-8 w-8 shrink-0">
                    {m.photo && <AvatarImage src={m.photo} alt={m.name} />}
                    <AvatarFallback className={`text-xs font-semibold ${avatarAccent(m.id)}`}>
                      {initialsOf(m.name, m.email)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="truncate text-sm text-foreground group-hover:underline">
                    {m.name || "(sem nome)"}
                  </span>
                </button>

                <div className="ml-auto shrink-0 sm:ml-0 sm:justify-self-end">
                  {time ? (
                    <button
                      type="button"
                      onClick={() => setHistoryFor(m)}
                      className="cursor-pointer rounded-md px-2 py-1 text-sm font-medium tabular-nums text-foreground hover:bg-muted/60 hover:underline"
                    >
                      {time}
                    </button>
                  ) : (
                    <span className="px-2 py-1 text-sm text-muted-foreground">—</span>
                  )}
                </div>

                <div className="hidden shrink-0 sm:block sm:justify-self-end">
                  {time ? (
                    <span className="flex items-center gap-1.5 px-2 py-1 text-xs text-muted-foreground">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Iniciado
                    </span>
                  ) : (
                    <span className="px-2 py-1 text-xs text-muted-foreground">Não iniciou</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <StartOfDayHistoryDialog
        member={historyFor}
        open={!!historyFor}
        onOpenChange={(o) => !o && setHistoryFor(null)}
      />
    </div>
  );
}
