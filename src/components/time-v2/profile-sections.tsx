import { useMemo, useState, type ReactNode } from "react";
import type { TimeEntry } from "@/lib/time-entries";
import type { Member, TimeField } from "@/components/TimeSection";
import { canSeeField, formatHours, groupJourneyByDay, totalSecondsByUser } from "./time-v2-utils";

const hhmm = (iso: string) =>
  new Date(iso).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });

const dayLabel = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
};

function EmptyLine({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-border px-4 py-4 text-center text-sm text-text-secondary">
      {children}
    </p>
  );
}

/** "Ver mais (N)" / "Ver menos" — usado em toda lista que pode crescer, pra
 * nunca despejar dezenas de itens de uma vez. */
function useLimited<T>(items: T[], limit: number) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? items : items.slice(0, limit);
  const hidden = items.length - visible.length;
  const toggle =
    items.length > limit ? (
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="mt-1 w-full rounded-md px-2 py-1.5 text-center text-[11px] font-medium text-text-secondary hover:bg-muted/50 hover:text-foreground"
      >
        {expanded ? "Ver menos" : `Ver mais (${hidden})`}
      </button>
    ) : null;
  return { visible, toggle };
}

const JOURNEY_LIMIT = 5;

export function ProfileJourney({
  member,
  entries,
  loading,
  statusLabel,
  canSeeStart,
}: {
  member: Member;
  entries: TimeEntry[];
  loading: boolean;
  statusLabel: string;
  canSeeStart: boolean;
}) {
  const days = useMemo(() => groupJourneyByDay(entries), [entries]);
  const total = totalSecondsByUser(entries).get(member.id) ?? 0;
  const running = days.some((d) => d.running);
  const { visible, toggle } = useLimited(days, JOURNEY_LIMIT);

  return (
    <div className="space-y-3">
      <dl className="grid grid-cols-3 gap-4">
        {[
          ["Status atual", running ? "Em atividade" : statusLabel],
          ["Horas no período", formatHours(total)],
          ["Dias com registro", String(days.length)],
        ].map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="truncate text-[11px] font-medium uppercase tracking-wide text-text-secondary">
              {label}
            </dt>
            <dd className="mt-1 truncate text-lg font-semibold tabular-nums text-foreground">
              {value}
            </dd>
          </div>
        ))}
      </dl>
      {loading ? (
        <EmptyLine>Carregando registros…</EmptyLine>
      ) : days.length === 0 ? (
        <EmptyLine>Nenhum registro de jornada neste período.</EmptyLine>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <div className="grid grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))] gap-2 border-b border-border bg-muted/30 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-text-secondary sm:grid-cols-[minmax(0,1.4fr)_repeat(4,minmax(0,1fr))]">
            <span>Dia</span>
            <span>Entrada</span>
            <span>Saída</span>
            <span className="text-right">Horas</span>
            {canSeeStart && <span className="hidden text-right sm:block">Início do dia</span>}
          </div>
          <div className="divide-y divide-border/60">
            {visible.map((d) => (
              <div
                key={d.day}
                className="grid grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))] items-center gap-2 px-3 py-2 text-xs tabular-nums sm:grid-cols-[minmax(0,1.4fr)_repeat(4,minmax(0,1fr))]"
              >
                <span className="truncate font-medium capitalize text-foreground">
                  {dayLabel(d.day)}
                </span>
                <span className="text-text-secondary">{hhmm(d.firstStart)}</span>
                <span className="truncate text-text-secondary">
                  {d.running ? "Em atividade" : d.lastEnd ? hhmm(d.lastEnd) : "—"}
                </span>
                <span className="text-right font-medium text-foreground">
                  {formatHours(d.seconds)}
                </span>
                {canSeeStart && (
                  <span className="hidden text-right text-text-secondary sm:block">
                    {member.startTimes?.[d.day] ?? "—"}
                  </span>
                )}
              </div>
            ))}
          </div>
          {toggle && <div className="border-t border-border/60 p-1">{toggle}</div>}
        </div>
      )}
    </div>
  );
}

/** Dados cadastrais visíveis para quem está olhando (mesma regra de `canSeeField`). */
export function memberInfoRows(
  member: Member,
  viewer: { isAdmin: boolean; meId: string | null },
  startOfDayToday: string | null,
): { label: string; value: string }[] {
  const see = (f: TimeField) => canSeeField(member, f, viewer);
  const rows: { label: string; value: string }[] = [];
  if (see("role") && member.role) rows.push({ label: "Cargo", value: member.role });
  if (see("email") && member.email) rows.push({ label: "E-mail", value: member.email });
  if (see("birthday") && member.birthday)
    rows.push({ label: "Aniversário", value: member.birthday.split("-").reverse().join("/") });
  if (see("salary") && member.salary) rows.push({ label: "Salário", value: member.salary });
  if (see("startOfDay") && startOfDayToday)
    rows.push({ label: "Início do dia (hoje)", value: startOfDayToday });
  return rows;
}

export function MemberInfoList({ rows }: { rows: { label: string; value: string }[] }) {
  if (rows.length === 0)
    return (
      <p className="text-sm text-text-secondary">Sem informações liberadas para visualização.</p>
    );
  return (
    <dl className="divide-y divide-border/60">
      {rows.map((r) => (
        <div key={r.label} className="flex items-start justify-between gap-3 py-2">
          <dt className="shrink-0 text-sm text-text-secondary">{r.label}</dt>
          <dd className="min-w-0 break-words text-right text-sm font-medium text-foreground">
            {r.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
