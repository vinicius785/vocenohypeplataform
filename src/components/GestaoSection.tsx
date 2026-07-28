import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarClock, ChevronDown, Sunrise, Trophy, User } from "lucide-react";
import { SectionHeader } from "./SectionHeader";
import { loadMembers, subscribeChat, type ChatMember } from "@/lib/chat-store";
import { loadProjetos, onProjetosChange } from "@/lib/projetos";
import { loadMeetings, onMeetingsChange } from "@/lib/reunioes-store";
import { todayISO } from "@/lib/financeiro-entries";
import {
  computeMemberScores,
  collectTaskItems,
  tasksDueToday,
  tasksOverdue,
  SCORE_RULES,
  type MemberScore,
  type TaskItem,
} from "@/lib/score";

const MEMBERS_KEY = "time:membros";
type MemberWithStart = ChatMember & { startTimes?: Record<string, string> };

/** `time:membros` já guarda o histórico de início de dia de cada pessoa
 * (populado por `TimeSection`/`BomDiaDialog`) — só falta um tipo local pra
 * ler esse campo extra, já que `loadMembers()` só declara os campos do chat. */
function loadMembersWithStart(): MemberWithStart[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(MEMBERS_KEY);
    return raw ? (JSON.parse(raw) as MemberWithStart[]) : [];
  } catch {
    return [];
  }
}

function Avatar({ member }: { member?: ChatMember }) {
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted ring-1 ring-border">
      {member?.photo ? (
        <img src={member.photo} alt="" className="h-full w-full object-cover" />
      ) : (
        <User className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
      )}
    </span>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 text-sm font-semibold tabular-nums text-foreground">{value}</p>
    </div>
  );
}

function fmtDate(d?: string) {
  if (!d) return "—";
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y, (m || 1) - 1, day || 1).toLocaleDateString("pt-BR");
}

function fmtDateWeekday(d: string) {
  const [y, m, day] = d.split("-").map(Number);
  const date = new Date(y, (m || 1) - 1, day || 1);
  const weekday = date.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "");
  return `${weekday} · ${date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}`;
}

function TaskItemRow({ item, members }: { item: TaskItem; members: ChatMember[] }) {
  const member = members.find((m) => m.name === item.assignee);
  return (
    <li className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
      <div className="flex min-w-0 items-center gap-2.5">
        <Avatar member={member} />
        <div className="min-w-0">
          <p className="truncate font-medium text-foreground">{item.title}</p>
          <p className="truncate text-[11px] text-muted-foreground">
            {item.assignee ?? "Sem responsável"} · {item.projectName}
          </p>
        </div>
      </div>
      <span className="shrink-0 text-[11px] text-muted-foreground">{fmtDate(item.dueDate)}</span>
    </li>
  );
}

function StartOfDayCard({ member }: { member: MemberWithStart }) {
  const [expanded, setExpanded] = useState(false);
  const entries = useMemo(
    () =>
      Object.entries(member.startTimes ?? {}).sort((a, b) =>
        a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0,
      ),
    [member.startTimes],
  );
  const visible = expanded ? entries : entries.slice(0, 7);

  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex items-center gap-2.5">
        <Avatar member={member} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{member.name}</p>
          <p className="text-[11px] text-muted-foreground">
            {entries.length === 0 ? "Nenhum registro ainda" : `${entries.length} registro(s)`}
          </p>
        </div>
      </div>
      {entries.length > 0 && (
        <>
          <ul className="mt-3 space-y-1">
            {visible.map(([date, time]) => (
              <li
                key={date}
                className="flex items-center justify-between rounded-md bg-muted/40 px-2.5 py-1.5 text-xs"
              >
                <span className="text-muted-foreground">{fmtDateWeekday(date)}</span>
                <span className="font-medium tabular-nums text-foreground">{time}</span>
              </li>
            ))}
          </ul>
          {entries.length > 7 && (
            <button
              type="button"
              onClick={() => setExpanded((e) => !e)}
              className="mt-2 flex w-full items-center justify-center gap-1 rounded-md py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <ChevronDown
                className={`h-3 w-3 transition-transform ${expanded ? "rotate-180" : ""}`}
              />
              {expanded ? "Ver só os últimos 7 dias" : `Ver histórico completo (${entries.length})`}
            </button>
          )}
        </>
      )}
    </div>
  );
}

type GestaoTab = "geral" | "tarefas" | "inicio-dia";

function GestaoTabs({ tab, setTab }: { tab: GestaoTab; setTab: (t: GestaoTab) => void }) {
  const TABS: { k: GestaoTab; label: string }[] = [
    { k: "geral", label: "Visão geral" },
    { k: "tarefas", label: "Tarefas" },
    { k: "inicio-dia", label: "Início de dia" },
  ];
  return (
    <div className="flex gap-1">
      {TABS.map(({ k, label }) => (
        <button
          key={k}
          type="button"
          onClick={() => setTab(k)}
          className={`inline-flex items-center rounded-md px-3 py-1.5 text-sm transition-colors ${
            tab === k
              ? "bg-foreground font-medium text-background"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function GestaoSection() {
  const [members, setMembers] = useState<ChatMember[]>(() => loadMembers());
  const [membersWithStart, setMembersWithStart] = useState<MemberWithStart[]>(() =>
    loadMembersWithStart(),
  );
  const [tick, setTick] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [personFilter, setPersonFilter] = useState<string>("");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [tab, setTab] = useState<GestaoTab>("geral");

  useEffect(
    () =>
      subscribeChat(() => {
        setMembers(loadMembers());
        setMembersWithStart(loadMembersWithStart());
      }),
    [],
  );
  useEffect(() => onProjetosChange(() => setTick((t) => t + 1)), []);
  useEffect(() => onMeetingsChange(() => setTick((t) => t + 1)), []);

  const range = useMemo(
    () =>
      dateFrom || dateTo ? { from: dateFrom || undefined, to: dateTo || undefined } : undefined,
    [dateFrom, dateTo],
  );

  const allScores = useMemo<MemberScore[]>(() => {
    void tick;
    return computeMemberScores(loadProjetos(), loadMeetings(), members, range);
  }, [members, tick, range]);

  const taskItems = useMemo(() => {
    void tick;
    return collectTaskItems(loadProjetos());
  }, [tick]);

  const today = todayISO();
  const dueTodayAll = useMemo(() => tasksDueToday(taskItems, today), [taskItems, today]);
  const overdueAll = useMemo(() => tasksOverdue(taskItems, today), [taskItems, today]);

  const scores = personFilter ? allScores.filter((s) => s.member.id === personFilter) : allScores;
  const dueToday = personFilter
    ? dueTodayAll.filter((t) => members.find((m) => m.name === t.assignee)?.id === personFilter)
    : dueTodayAll;
  const overdue = personFilter
    ? overdueAll.filter((t) => members.find((m) => m.name === t.assignee)?.id === personFilter)
    : overdueAll;
  const startOfDayMembers = personFilter
    ? membersWithStart.filter((m) => m.id === personFilter)
    : membersWithStart;

  const totalTasks = taskItems.length;
  const totalConcluded = allScores.reduce((s, m) => s + m.tasksOnTime + m.tasksLate, 0);
  const totalOverdue = overdueAll.length;
  const totalDueToday = dueTodayAll.length;
  const checkedInToday = membersWithStart.filter((m) => m.startTimes?.[today]).length;

  const clearFilters = () => {
    setPersonFilter("");
    setDateFrom("");
    setDateTo("");
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8">
      <SectionHeader
        title="Gestão"
        subtitle="Métricas, pontuação e presença do time — tarefas de projetos, reuniões e início de dia."
        kpis={[
          { label: "Total de tarefas", value: totalTasks },
          { label: "Concluídas no período", value: totalConcluded },
          {
            label: "Atrasadas (todo mundo)",
            value: totalOverdue,
            tone: totalOverdue > 0 ? "text-destructive" : undefined,
          },
          { label: "Vencem hoje (todo mundo)", value: totalDueToday },
          {
            label: "Já começaram o dia hoje",
            value: `${checkedInToday}/${membersWithStart.length}`,
          },
        ]}
      />

      <section className="flex flex-wrap items-end gap-3 rounded-lg border border-border p-3">
        <div>
          <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Pessoa
          </label>
          <select
            value={personFilter}
            onChange={(e) => setPersonFilter(e.target.value)}
            className="mt-1 block rounded-md border border-input bg-background px-2 py-1.5 text-sm outline-none focus:border-ring"
          >
            <option value="">Todo mundo</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            De
          </label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="mt-1 block rounded-md border border-input bg-background px-2 py-1.5 text-sm outline-none focus:border-ring"
          />
        </div>
        <div>
          <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Até
          </label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="mt-1 block rounded-md border border-input bg-background px-2 py-1.5 text-sm outline-none focus:border-ring"
          />
        </div>
        {(personFilter || dateFrom || dateTo) && (
          <button
            type="button"
            onClick={clearFilters}
            className="rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            Limpar filtros
          </button>
        )}
        <p className="w-full text-[11px] text-muted-foreground">
          O filtro de pessoa vale para todas as abas. O de data só afeta o Ranking (conclusões e
          reuniões dentro do período) — "hoje" e "atrasadas" são sempre o estado atual.
        </p>
      </section>

      <GestaoTabs tab={tab} setTab={setTab} />

      {tab === "geral" && (
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Ranking
          </h2>
          {scores.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              Nenhum membro do time encontrado para esse filtro.
            </p>
          ) : (
            <div className="divide-y divide-border rounded-lg border border-border">
              {scores.map((s, i) => (
                <div key={s.member.id}>
                  <button
                    type="button"
                    onClick={() => setExpanded((e) => (e === s.member.id ? null : s.member.id))}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/40"
                  >
                    <span className="w-5 shrink-0 text-center text-xs font-semibold text-muted-foreground">
                      {i === 0 && !personFilter ? (
                        <Trophy className="mx-auto h-3.5 w-3.5 text-amber-500" />
                      ) : (
                        i + 1
                      )}
                    </span>
                    <Avatar member={s.member} />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                      {s.member.name}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {s.hoursTracked.toFixed(1)}h
                    </span>
                    <span
                      className={`shrink-0 text-lg font-semibold tabular-nums ${
                        s.score > 0
                          ? "text-emerald-600 dark:text-emerald-400"
                          : s.score < 0
                            ? "text-destructive"
                            : "text-foreground"
                      }`}
                    >
                      {s.score > 0 ? "+" : ""}
                      {s.score}
                    </span>
                  </button>
                  {expanded === s.member.id && (
                    <div className="grid grid-cols-2 gap-x-6 gap-y-3 border-t border-border bg-muted/20 px-4 py-4 sm:grid-cols-3 md:grid-cols-5">
                      <Stat label="No prazo" value={s.tasksOnTime} />
                      <Stat label="Entregue atrasada" value={s.tasksLate} />
                      <Stat label="Atrasada (aberta)" value={s.tasksOverdue} />
                      <Stat label="Reuniões OK" value={s.meetingsAttended} />
                      <Stat label="Reuniões perdidas" value={s.meetingsMissed} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-1 text-[11px] text-muted-foreground">
            <span className="font-semibold uppercase tracking-wider">Pontuação:</span>
            {SCORE_RULES.map((r) => (
              <span key={r.key} className="whitespace-nowrap">
                {r.label}{" "}
                <span
                  className={
                    r.points > 0
                      ? "font-semibold text-emerald-600 dark:text-emerald-400"
                      : "font-semibold text-destructive"
                  }
                >
                  {r.points > 0 ? "+" : ""}
                  {r.points}
                </span>
              </span>
            ))}
          </div>
        </section>
      )}

      {tab === "tarefas" && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <section className="space-y-3">
            <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              <CalendarClock className="h-3.5 w-3.5" /> Tarefas de hoje ({dueToday.length})
            </h2>
            <div className="rounded-lg border border-border">
              {dueToday.length === 0 ? (
                <p className="p-6 text-center text-sm text-muted-foreground">
                  Ninguém tem tarefa vencendo hoje.
                </p>
              ) : (
                <ul className="max-h-80 divide-y divide-border overflow-y-auto">
                  {dueToday.map((t) => (
                    <TaskItemRow key={t.id} item={t} members={members} />
                  ))}
                </ul>
              )}
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              <AlertTriangle className="h-3.5 w-3.5 text-destructive" /> Tarefas atrasadas (
              {overdue.length})
            </h2>
            <div className="rounded-lg border border-border">
              {overdue.length === 0 ? (
                <p className="p-6 text-center text-sm text-muted-foreground">
                  Nenhuma tarefa atrasada. 🎉
                </p>
              ) : (
                <ul className="max-h-80 divide-y divide-border overflow-y-auto">
                  {overdue.map((t) => (
                    <TaskItemRow key={t.id} item={t} members={members} />
                  ))}
                </ul>
              )}
            </div>
          </section>
        </div>
      )}

      {tab === "inicio-dia" && (
        <section className="space-y-3">
          <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            <Sunrise className="h-3.5 w-3.5" /> Início de dia
          </h2>
          {startOfDayMembers.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              Nenhum membro encontrado.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {startOfDayMembers.map((m) => (
                <StartOfDayCard key={m.id} member={m} />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
