import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  Users,
  Clock,
  ChevronLeft,
  ChevronRight,
  Plus,
  X,
  Trash2,
  Check,
  Pencil,
  CalendarClock,
} from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useStorageSync } from "@/lib/use-storage-sync";
import {
  type Meeting,
  type MeetingStatus,
  type RescheduleProposal,
  loadMeetings,
  saveMeetings,
  onMeetingsChange,
  meetingDisplayStatus,
  meetingEndTime,
} from "@/lib/reunioes-store";
import { getMe } from "@/lib/chat-store";
import { linkifyText } from "@/lib/linkify";

type TeamMember = { id: string; name: string; photo?: string };
function loadTeam(): TeamMember[] {
  try {
    const raw = localStorage.getItem("time:membros");
    if (!raw) return [];
    return (JSON.parse(raw) as TeamMember[]).map((m) => ({
      id: m.id,
      name: m.name,
      photo: m.photo,
    }));
  } catch {
    return [];
  }
}

type AvailabilityExtra = {
  id: string;
  escopo: "semanal" | "data";
  dias?: string[]; // usados quando escopo === 'semanal'
  data?: string; // yyyy-mm-dd, usado quando escopo === 'data'
  inicio: string;
  fim: string;
  motivo?: string;
};

type Availability = {
  dias: Record<string, boolean>; // 'seg'..'dom'
  inicio: string;
  fim: string;
  extras?: AvailabilityExtra[];
};

const DIAS_SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"] as const;
const DIAS_LABEL = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];

const AVAIL_KEY = "reunioes:disponibilidade";
function loadAvail(): Availability {
  try {
    const raw = localStorage.getItem(AVAIL_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Availability;
      if (!parsed.extras) parsed.extras = [];
      return parsed;
    }
  } catch {
    /* ignore */
  }
  return {
    dias: { seg: true, ter: true, qua: true, qui: true, sex: true, sab: false, dom: false },
    inicio: "09:00",
    fim: "18:00",
    extras: [],
  };
}

function toISODate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function parseISODate(s: string) {
  if (!s) return new Date(NaN);
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function formatBR(iso: string) {
  const d = parseISODate(iso);
  const wd = [
    "Domingo",
    "Segunda-feira",
    "Terça-feira",
    "Quarta-feira",
    "Quinta-feira",
    "Sexta-feira",
    "Sábado",
  ][d.getDay()];
  const mo = [
    "janeiro",
    "fevereiro",
    "março",
    "abril",
    "maio",
    "junho",
    "julho",
    "agosto",
    "setembro",
    "outubro",
    "novembro",
    "dezembro",
  ][d.getMonth()];
  return `${wd}, ${d.getDate()} de ${mo}`;
}
function monthLabel(d: Date) {
  const s = d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function statusTone(s: MeetingStatus) {
  if (s === "Confirmada") return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400";
  if (s === "Pendente") return "bg-amber-500/10 text-amber-700 dark:text-amber-400";
  return "bg-muted text-muted-foreground line-through";
}
function statusDot(s: MeetingStatus) {
  if (s === "Confirmada") return "bg-emerald-500";
  if (s === "Pendente") return "bg-amber-500";
  return "bg-muted-foreground/40";
}

export function ReunioesSection() {
  const me = getMe();
  const [tab, setTab] = useState<"calendario" | "solicitacoes" | "disponibilidade">("calendario");
  const [meetings, setMeetings] = useState<Meeting[]>(() => loadMeetings());
  const [avail, setAvail] = useState<Availability>(() => loadAvail());
  const [cursor, setCursor] = useState<Date>(() => new Date());
  const [selected, setSelected] = useState<string>(() => toISODate(new Date()));
  const [dialog, setDialog] = useState<{ mode: "new" | "edit"; data?: Meeting } | null>(null);
  const [summary, setSummary] = useState<Meeting | null>(null);

  const persist = (next: Meeting[]) => {
    setMeetings(next);
    saveMeetings(next);
  };
  useEffect(() => onMeetingsChange(() => setMeetings(loadMeetings())), []);

  const persistAvail = (a: Availability) => {
    setAvail(a);
    try {
      localStorage.setItem(AVAIL_KEY, JSON.stringify(a));
    } catch {
      /* ignore */
    }
  };
  useStorageSync(AVAIL_KEY, () => setAvail(loadAvail()));

  // Só reuniões onde a pessoa é criadora ou foi convidada — o calendário
  // deixou de mostrar tudo do workspace pra todo mundo.
  const myMeetings = useMemo(
    () => meetings.filter((m) => m.criadorId === me.id || m.participanteIds?.includes(me.id)),
    [meetings, me.id],
  );

  // Reflete atualizações vindas do resumo (confirmar/recusar/sugerir/aceitar).
  useEffect(() => {
    if (!summary) return;
    const fresh = meetings.find((m) => m.id === summary.id);
    setSummary(fresh ?? null);
  }, [meetings, summary?.id]);

  const today = toISODate(new Date());
  const proximas = myMeetings.filter((m) => m.data >= today && m.status !== "Cancelada").length;
  const confirmadas = myMeetings.filter(
    (m) => m.data >= today && meetingDisplayStatus(m) === "Confirmada",
  ).length;
  const pendentes = myMeetings.filter((m) => meetingDisplayStatus(m) === "Pendente").length;

  const selectedMeetings = useMemo(
    () =>
      myMeetings.filter((m) => m.data === selected).sort((a, b) => a.hora.localeCompare(b.hora)),
    [myMeetings, selected],
  );

  // Reuniões que já passaram do horário e cujo criador (sou eu) ainda não
  // registrou quem participou — vira um popup, uma de cada vez, até
  // esvaziar a fila.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(iv);
  }, []);
  const pendingAttendance = useMemo(
    () =>
      meetings
        .filter(
          (m) =>
            m.criadorId === me.id &&
            m.status !== "Cancelada" &&
            !m.attendanceRecorded &&
            (m.participanteIds?.length ?? 0) > 0 &&
            meetingEndTime(m) < now,
        )
        .sort((a, b) => (a.data + a.hora).localeCompare(b.data + b.hora)),
    [meetings, me.id, now],
  );
  const attendanceMeeting = pendingAttendance[0] ?? null;

  return (
    <div className="mx-auto w-full max-w-6xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Reuniões</h1>
        <p className="mt-1 text-sm text-muted-foreground">Agenda unificada com clientes e time.</p>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-3 lg:grid-cols-[240px_1fr_1fr_1fr]">
        <div className="rounded-lg border border-border bg-card p-2">
          <TabBtn
            active={tab === "calendario"}
            onClick={() => setTab("calendario")}
            icon={<CalendarDays className="h-4 w-4" />}
          >
            Calendário
          </TabBtn>
          <TabBtn
            active={tab === "solicitacoes"}
            onClick={() => setTab("solicitacoes")}
            icon={<Users className="h-4 w-4" />}
          >
            Solicitações
          </TabBtn>
          <TabBtn
            active={tab === "disponibilidade"}
            onClick={() => setTab("disponibilidade")}
            icon={<Clock className="h-4 w-4" />}
          >
            Disponibilidade
          </TabBtn>
        </div>
        <StatCard label="PRÓXIMAS" value={proximas} tone="text-foreground" />
        <StatCard
          label="CONFIRMADAS"
          value={confirmadas}
          tone="text-emerald-600 dark:text-emerald-400"
        />
        <StatCard label="PENDENTES" value={pendentes} tone="text-amber-600 dark:text-amber-400" />
      </div>

      {tab === "calendario" && (
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
          <div>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))
                  }
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label="Mês anterior"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <div className="min-w-[140px] text-sm font-medium">{monthLabel(cursor)}</div>
                <button
                  type="button"
                  onClick={() =>
                    setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))
                  }
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
              <button
                type="button"
                onClick={() => setDialog({ mode: "new" })}
                className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90"
              >
                <Plus className="h-3.5 w-3.5" /> Nova reunião
              </button>
            </div>

            <MonthGrid
              cursor={cursor}
              selected={selected}
              meetings={myMeetings}
              onSelect={(iso) => setSelected(iso)}
            />
          </div>

          <div>
            <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Selecionado
            </div>
            <div className="mt-1 text-base font-semibold">{formatBR(selected)}</div>

            {selectedMeetings.length === 0 ? (
              <div className="mt-4 rounded-lg border border-dashed border-border p-8 text-center">
                <CalendarDays className="mx-auto h-5 w-5 text-muted-foreground" />
                <p className="mt-2 text-sm text-muted-foreground">Nenhuma reunião neste dia.</p>
              </div>
            ) : (
              <ul className="mt-4 space-y-2">
                {selectedMeetings.map((m) => (
                  <li key={m.id} className="group rounded-lg border border-border bg-card p-3">
                    <button
                      type="button"
                      onClick={() => setSummary(m)}
                      className="w-full text-left"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${statusDot(meetingDisplayStatus(m))}`}
                        />
                        <div className="text-sm font-medium tabular-nums">{m.hora}</div>
                        <span
                          className={`ml-auto rounded-full px-2 py-0.5 text-[11px] ${statusTone(meetingDisplayStatus(m))}`}
                        >
                          {meetingDisplayStatus(m)}
                        </span>
                      </div>
                      <div className="mt-1 truncate text-sm text-foreground">{m.titulo}</div>
                      {m.com && (
                        <div className="truncate text-xs text-muted-foreground">com {m.com}</div>
                      )}
                      {m.local && (
                        <div className="truncate text-[11px] text-muted-foreground">{m.local}</div>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {tab === "solicitacoes" && (
        <SolicitacoesTab meetings={myMeetings} onOpen={(m) => setSummary(m)} />
      )}

      {tab === "disponibilidade" && <DisponibilidadeTab avail={avail} onChange={persistAvail} />}

      <MeetingDialog
        open={!!dialog}
        initial={dialog?.data}
        defaultDate={selected}
        me={me}
        onClose={() => setDialog(null)}
        onDelete={(id) => {
          persist(meetings.filter((m) => m.id !== id));
          setDialog(null);
        }}
        onSave={(m) => {
          if (dialog?.mode === "edit") {
            persist(meetings.map((x) => (x.id === m.id ? m : x)));
          } else {
            persist([...meetings, m]);
          }
          setSelected(m.data);
          setDialog(null);
        }}
      />

      <MeetingSummaryDialog
        meeting={summary}
        me={me}
        onClose={() => setSummary(null)}
        onEdit={(m) => {
          setSummary(null);
          setDialog({ mode: "edit", data: m });
        }}
        onChange={(m) => persist(meetings.map((x) => (x.id === m.id ? m : x)))}
      />

      <AttendanceDialog
        meeting={attendanceMeeting}
        onSubmit={(attendedBy) =>
          persist(
            meetings.map((x) =>
              x.id === attendanceMeeting!.id ? { ...x, attendedBy, attendanceRecorded: true } : x,
            ),
          )
        }
        onSkip={() =>
          persist(
            meetings.map((x) =>
              x.id === attendanceMeeting!.id ? { ...x, attendanceRecorded: true } : x,
            ),
          )
        }
      />
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors ${
        active
          ? "bg-muted font-medium text-foreground"
          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

function StatCard({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className={`mt-2 text-3xl font-semibold ${tone}`}>{value}</div>
    </div>
  );
}

function MonthGrid({
  cursor,
  selected,
  meetings,
  onSelect,
}: {
  cursor: Date;
  selected: string;
  meetings: Meeting[];
  onSelect: (iso: string) => void;
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
  const byDate = useMemo(() => {
    const map = new Map<string, Meeting[]>();
    for (const m of meetings) {
      if (!map.has(m.data)) map.set(m.data, []);
      map.get(m.data)!.push(m);
    }
    return map;
  }, [meetings]);

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
          return (
            <button
              key={idx}
              type="button"
              onClick={() => onSelect(iso)}
              className={`min-h-[92px] border-b border-r border-border p-2 text-left align-top transition-colors last-in-row:border-r-0 hover:bg-muted/40 ${
                inMonth ? "" : "bg-background/40 text-muted-foreground/60"
              } ${isSel ? "bg-muted/60" : ""}`}
            >
              <div className="flex items-center">
                <span
                  className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs tabular-nums ${
                    isToday ? "border border-foreground/40" : ""
                  }`}
                >
                  {d.getDate()}
                </span>
              </div>
              <div className="mt-1 space-y-0.5">
                {items.slice(0, 2).map((m) => (
                  <div key={m.id} className="flex items-center gap-1 truncate text-[11px]">
                    <span
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${statusDot(meetingDisplayStatus(m))}`}
                    />
                    <span className="tabular-nums">{m.hora}</span>
                    <span className="truncate text-muted-foreground">{m.titulo}</span>
                  </div>
                ))}
                {items.length > 2 && (
                  <div className="text-[10px] text-muted-foreground">+{items.length - 2}</div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SolicitacoesTab({
  meetings,
  onOpen,
}: {
  meetings: Meeting[];
  onOpen: (m: Meeting) => void;
}) {
  const pend = meetings
    .filter((m) => meetingDisplayStatus(m) === "Pendente")
    .sort((a, b) => (a.data + a.hora).localeCompare(b.data + b.hora));
  return (
    <div className="mt-6">
      <h2 className="text-sm font-semibold">Solicitações pendentes</h2>
      <p className="mt-0.5 text-xs text-muted-foreground">Reuniões aguardando confirmação.</p>
      {pend.length === 0 ? (
        <div className="mt-4 rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Nenhuma solicitação pendente.
        </div>
      ) : (
        <ul className="mt-4 divide-y divide-border rounded-lg border border-border">
          {pend.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => onOpen(m)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/50"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{m.titulo}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {formatBR(m.data)} · {m.hora} {m.com ? `· com ${m.com}` : ""}
                  </div>
                </div>
                <span className="rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground">
                  Ver detalhes
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DisponibilidadeTab({
  avail,
  onChange,
}: {
  avail: Availability;
  onChange: (a: Availability) => void;
}) {
  const extras = avail.extras ?? [];

  const updateExtra = (id: string, patch: Partial<AvailabilityExtra>) => {
    onChange({ ...avail, extras: extras.map((e) => (e.id === id ? { ...e, ...patch } : e)) });
  };
  const removeExtra = (id: string) => {
    onChange({ ...avail, extras: extras.filter((e) => e.id !== id) });
  };
  const addExtra = (escopo: "semanal" | "data") => {
    const novo: AvailabilityExtra = {
      id: crypto.randomUUID(),
      escopo,
      dias: escopo === "semanal" ? [] : undefined,
      data: escopo === "data" ? toISODate(new Date()) : undefined,
      inicio: "09:00",
      fim: "18:00",
      motivo: "",
    };
    onChange({ ...avail, extras: [...extras, novo] });
  };

  const toggleDia = (extra: AvailabilityExtra, d: string) => {
    const cur = extra.dias ?? [];
    updateExtra(extra.id, { dias: cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d] });
  };

  return (
    <div className="mt-6 max-w-xl">
      <h2 className="text-sm font-semibold">Disponibilidade</h2>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Dias e horários em que você aceita reuniões.
      </p>

      <div className="mt-4 rounded-lg border border-border bg-card p-4">
        <div className="text-xs font-medium text-muted-foreground">Padrão semanal</div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {DIAS_SEMANA.map((d, idx) => {
            const on = !!avail.dias[d];
            return (
              <button
                key={d}
                type="button"
                onClick={() => onChange({ ...avail, dias: { ...avail.dias, [d]: !on } })}
                className={`h-8 min-w-10 rounded-full px-3 text-xs font-medium ${
                  on
                    ? "bg-foreground text-background"
                    : "border border-border text-muted-foreground hover:bg-muted"
                }`}
              >
                {DIAS_LABEL[idx]}
              </button>
            );
          })}
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Início</label>
            <input
              type="time"
              value={avail.inicio}
              onChange={(e) => onChange({ ...avail, inicio: e.target.value })}
              className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Fim</label>
            <input
              type="time"
              value={avail.fim}
              onChange={(e) => onChange({ ...avail, fim: e.target.value })}
              className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        </div>
      </div>

      <div className="mt-6 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Disponibilidades adicionais</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Adicione janelas extras ou para datas específicas.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => addExtra("semanal")}
            className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium hover:bg-muted"
          >
            <Plus className="h-3.5 w-3.5" /> Semanal
          </button>
          <button
            type="button"
            onClick={() => addExtra("data")}
            className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium hover:bg-muted"
          >
            <Plus className="h-3.5 w-3.5" /> Data específica
          </button>
        </div>
      </div>

      <div className="mt-3 space-y-3">
        {extras.length === 0 && (
          <div className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
            Nenhuma disponibilidade adicional.
          </div>
        )}
        {extras.map((extra) => (
          <div key={extra.id} className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center justify-between">
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {extra.escopo === "semanal" ? "Semanal" : "Data específica"}
              </span>
              <button
                type="button"
                onClick={() => removeExtra(extra.id)}
                className="text-muted-foreground hover:text-destructive"
                aria-label="Remover"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>

            {extra.escopo === "semanal" ? (
              <div className="mt-3">
                <div className="text-xs font-medium text-muted-foreground">Dias</div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {DIAS_SEMANA.map((d, idx) => {
                    const on = (extra.dias ?? []).includes(d);
                    return (
                      <button
                        key={d}
                        type="button"
                        onClick={() => toggleDia(extra, d)}
                        className={`h-8 min-w-10 rounded-full px-3 text-xs font-medium ${
                          on
                            ? "bg-foreground text-background"
                            : "border border-border text-muted-foreground hover:bg-muted"
                        }`}
                      >
                        {DIAS_LABEL[idx]}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="mt-3">
                <label className="text-xs font-medium text-muted-foreground">Data</label>
                <input
                  type="date"
                  value={extra.data ?? ""}
                  onChange={(e) => updateExtra(extra.id, { data: e.target.value })}
                  className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
            )}

            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Início</label>
                <input
                  type="time"
                  value={extra.inicio}
                  onChange={(e) => updateExtra(extra.id, { inicio: e.target.value })}
                  className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Fim</label>
                <input
                  type="time"
                  value={extra.fim}
                  onChange={(e) => updateExtra(extra.id, { fim: e.target.value })}
                  className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
            </div>

            <div className="mt-3">
              <label className="text-xs font-medium text-muted-foreground">Motivo</label>
              <input
                type="text"
                value={extra.motivo ?? ""}
                onChange={(e) => updateExtra(extra.id, { motivo: e.target.value })}
                placeholder="Ex.: Plantão, gravação, folga…"
                className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MeetingDialog({
  open,
  initial,
  defaultDate,
  me,
  onClose,
  onSave,
  onDelete,
}: {
  open: boolean;
  initial?: Meeting;
  defaultDate: string;
  me: { id: string; name: string };
  onClose: () => void;
  onSave: (m: Meeting) => void;
  onDelete: (id: string) => void;
}) {
  const [titulo, setTitulo] = useState("");
  const [data, setData] = useState("");
  const [hora, setHora] = useState("10:00");
  const [duracao, setDuracao] = useState(30);
  const [com, setCom] = useState("");
  const [participanteIds, setParticipanteIds] = useState<string[]>([]);
  const [local, setLocal] = useState("");
  const [notas, setNotas] = useState("");
  const [status, setStatus] = useState<MeetingStatus>("Confirmada");
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTeam(loadTeam());
    setTitulo(initial?.titulo ?? "");
    setData(initial?.data ?? defaultDate);
    setHora(initial?.hora ?? "10:00");
    setDuracao(initial?.duracao ?? 30);
    setCom(initial?.com ?? "");
    const ids =
      initial?.participanteIds ?? (initial?.participanteId ? [initial.participanteId] : []);
    setParticipanteIds(ids);
    setLocal(initial?.local ?? "");
    setNotas(initial?.notas ?? "");
    setStatus(initial?.status ?? "Confirmada");
    setPickerOpen(false);
  }, [open, initial, defaultDate]);

  const selectedMembers = team.filter((t) => participanteIds.includes(t.id));
  const toggleMember = (id: string) => {
    setParticipanteIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      const names = team
        .filter((t) => next.includes(t.id))
        .map((t) => t.name)
        .join(", ");
      if (names) setCom(names);
      else if (!prev.length || prev.every((x) => next.includes(x) === false)) setCom("");
      return next;
    });
  };

  const submit = () => {
    if (!titulo.trim() || !data) return;
    const finalStatus: MeetingStatus = !initial && participanteIds.length > 0 ? "Pendente" : status;
    onSave({
      id: initial?.id ?? crypto.randomUUID(),
      titulo: titulo.trim(),
      data,
      hora,
      duracao,
      com: com.trim(),
      participanteId: participanteIds[0],
      participanteIds: participanteIds.length ? participanteIds : undefined,
      local: local.trim(),
      notas: notas.trim() || undefined,
      status: finalStatus,
      criadorId: initial?.criadorId ?? me.id,
      confirmedBy: initial?.confirmedBy,
      declinedBy: initial?.declinedBy,
      rescheduleProposal: initial?.rescheduleProposal,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="flex max-h-[85vh] max-w-lg flex-col">
        <DialogTitle>{initial ? "Editar reunião" : "Nova reunião"}</DialogTitle>
        <DialogDescription className="sr-only">Cadastro de reunião</DialogDescription>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Título</label>
            <input
              type="text"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ex.: Alinhamento com cliente"
              className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Data</label>
              <input
                type="date"
                value={data}
                onChange={(e) => setData(e.target.value)}
                className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Hora</label>
              <input
                type="time"
                value={hora}
                onChange={(e) => setHora(e.target.value)}
                className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Duração (min)</label>
              <input
                type="number"
                min={5}
                step={5}
                value={duracao}
                onChange={(e) => setDuracao(Number(e.target.value) || 0)}
                className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground">
                Com (membros do time)
              </label>
              <button
                type="button"
                onClick={() => setPickerOpen((v) => !v)}
                className="mt-1 flex min-h-9 w-full flex-wrap items-center gap-1 rounded-md border border-input bg-background px-2 py-1 text-left text-sm shadow-sm hover:bg-muted/40"
              >
                {selectedMembers.length === 0 ? (
                  <span className="text-muted-foreground">— Selecione membros —</span>
                ) : (
                  selectedMembers.map((m) => (
                    <span
                      key={m.id}
                      className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs"
                    >
                      {m.photo ? (
                        <img src={m.photo} alt="" className="h-4 w-4 rounded-full object-cover" />
                      ) : (
                        <span className="grid h-4 w-4 place-items-center rounded-full bg-background text-[9px]">
                          {m.name.trim()[0]?.toUpperCase() ?? "?"}
                        </span>
                      )}
                      {m.name}
                      <X
                        className="h-3 w-3 cursor-pointer text-muted-foreground hover:text-foreground"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleMember(m.id);
                        }}
                      />
                    </span>
                  ))
                )}
              </button>
              {pickerOpen && (
                <div className="mt-1 max-h-48 overflow-auto rounded-md border border-border bg-popover p-1 shadow">
                  {team.length === 0 && (
                    <div className="px-2 py-2 text-xs text-muted-foreground">
                      Nenhum membro no time
                    </div>
                  )}
                  {team.map((t) => {
                    const checked = participanteIds.includes(t.id);
                    return (
                      <label
                        key={t.id}
                        className={`flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted ${checked ? "bg-muted" : ""}`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleMember(t.id)}
                          className="h-3.5 w-3.5"
                        />
                        {t.photo ? (
                          <img src={t.photo} alt="" className="h-5 w-5 rounded-full object-cover" />
                        ) : (
                          <span className="grid h-5 w-5 place-items-center rounded-full bg-muted text-[10px]">
                            {t.name.trim()[0]?.toUpperCase() ?? "?"}
                          </span>
                        )}
                        <span className="min-w-0 flex-1 truncate">{t.name}</span>
                      </label>
                    );
                  })}
                </div>
              )}
              {participanteIds.length === 0 && (
                <input
                  type="text"
                  value={com}
                  onChange={(e) => setCom(e.target.value)}
                  placeholder="Nome do convidado externo"
                  className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                />
              )}
              {participanteIds.length > 0 && !initial && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Uma solicitação será enviada para {com} (fica em Solicitações como Pendente).
                </p>
              )}
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground">Local / Link</label>
              <input
                type="text"
                value={local}
                onChange={(e) => setLocal(e.target.value)}
                placeholder="Google Meet, endereço..."
                className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Notas</label>
            <textarea
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Status</label>
            <div className="mt-1 flex gap-1.5">
              {(["Confirmada", "Pendente", "Cancelada"] as MeetingStatus[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatus(s)}
                  className={`rounded-full px-3 py-1 text-xs ${
                    status === s
                      ? statusTone(s)
                      : "border border-border text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-between gap-2">
          <div>
            {initial && (
              <button
                type="button"
                onClick={() => onDelete(initial.id)}
                className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs text-red-600 hover:bg-red-500/10 dark:text-red-400"
              >
                <Trash2 className="h-4 w-4" /> Excluir
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
            >
              <X className="h-4 w-4" /> Cancelar
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={!titulo.trim() || !data}
              className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90 disabled:opacity-50"
            >
              Salvar
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function participantBadge(kind: "confirmed" | "declined" | "pending") {
  if (kind === "confirmed") return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400";
  if (kind === "declined") return "bg-red-500/10 text-red-700 dark:text-red-400";
  return "bg-amber-500/10 text-amber-700 dark:text-amber-400";
}

function MeetingSummaryDialog({
  meeting,
  me,
  onClose,
  onEdit,
  onChange,
}: {
  meeting: Meeting | null;
  me: { id: string; name: string };
  onClose: () => void;
  onEdit: (m: Meeting) => void;
  onChange: (m: Meeting) => void;
}) {
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [proposing, setProposing] = useState(false);
  const [propData, setPropData] = useState("");
  const [propHora, setPropHora] = useState("");
  const [propNote, setPropNote] = useState("");

  useEffect(() => {
    if (!meeting) return;
    setTeam(loadTeam());
    setProposing(false);
    setPropData(meeting.data);
    setPropHora(meeting.hora);
    setPropNote("");
  }, [meeting?.id]);

  if (!meeting) return null;

  const isCreator = meeting.criadorId === me.id;
  const isParticipant = meeting.criadorId === me.id || meeting.participanteIds?.includes(me.id);
  const confirmedBy = meeting.confirmedBy ?? [];
  const declinedBy = meeting.declinedBy ?? [];
  const participantIds = Array.from(
    new Set([
      ...(meeting.criadorId ? [meeting.criadorId] : []),
      ...(meeting.participanteIds ?? []),
    ]),
  );
  const nameFor = (id: string) =>
    id === me.id ? `${me.name} (você)` : (team.find((t) => t.id === id)?.name ?? id);

  const confirm = () => {
    onChange({
      ...meeting,
      confirmedBy: Array.from(new Set([...confirmedBy, me.id])),
      declinedBy: declinedBy.filter((id) => id !== me.id),
    });
  };
  const decline = () => {
    onChange({
      ...meeting,
      declinedBy: Array.from(new Set([...declinedBy, me.id])),
      confirmedBy: confirmedBy.filter((id) => id !== me.id),
    });
  };
  const sendProposal = () => {
    if (!propData || !propHora) return;
    const proposal: RescheduleProposal = {
      proposedBy: me.id,
      proposedByName: me.name,
      data: propData,
      hora: propHora,
      note: propNote.trim() || undefined,
    };
    onChange({ ...meeting, rescheduleProposal: proposal });
    setProposing(false);
  };
  const acceptProposal = () => {
    const p = meeting.rescheduleProposal;
    if (!p) return;
    onChange({
      ...meeting,
      data: p.data,
      hora: p.hora,
      rescheduleProposal: undefined,
      confirmedBy: [],
      declinedBy: [],
    });
  };
  const dismissProposal = () => {
    onChange({ ...meeting, rescheduleProposal: undefined });
  };

  const displayStatus = meetingDisplayStatus(meeting);

  return (
    <Dialog open={!!meeting} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="flex max-h-[85vh] max-w-lg flex-col">
        <DialogTitle>{meeting.titulo}</DialogTitle>
        <DialogDescription className="sr-only">Resumo da reunião</DialogDescription>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
          <div className="flex items-center gap-2">
            <span className={`h-1.5 w-1.5 rounded-full ${statusDot(displayStatus)}`} />
            <span className={`rounded-full px-2 py-0.5 text-[11px] ${statusTone(displayStatus)}`}>
              {displayStatus}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Data
              </div>
              <div className="mt-0.5">{formatBR(meeting.data)}</div>
            </div>
            <div>
              <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Hora / Duração
              </div>
              <div className="mt-0.5">
                {meeting.hora} · {meeting.duracao} min
              </div>
            </div>
          </div>

          {meeting.local && (
            <div>
              <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Local / Link
              </div>
              <div className="mt-0.5 break-words text-sm">{linkifyText(meeting.local)}</div>
            </div>
          )}

          {meeting.notas && (
            <div>
              <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Notas
              </div>
              <div className="mt-0.5 whitespace-pre-wrap break-words text-sm">
                {linkifyText(meeting.notas)}
              </div>
            </div>
          )}

          <div>
            <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Participantes
            </div>
            <ul className="mt-1.5 space-y-1">
              {participantIds.length === 0 && meeting.com && (
                <li className="text-sm text-muted-foreground">{meeting.com} (externo)</li>
              )}
              {participantIds.map((id) => {
                const kind = confirmedBy.includes(id)
                  ? "confirmed"
                  : declinedBy.includes(id)
                    ? "declined"
                    : "pending";
                const label =
                  kind === "confirmed"
                    ? "Confirmado"
                    : kind === "declined"
                      ? "Recusado"
                      : "Pendente";
                return (
                  <li key={id} className="flex items-center justify-between gap-2 text-sm">
                    <span>
                      {nameFor(id)}
                      {id === meeting.criadorId && (
                        <span className="ml-1 text-[10px] text-muted-foreground">(criador)</span>
                      )}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] ${participantBadge(kind)}`}
                    >
                      {label}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>

          {meeting.rescheduleProposal && (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
              <div className="flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                <CalendarClock className="h-3.5 w-3.5" />
                Novo horário sugerido
              </div>
              <p className="mt-1">
                {formatBR(meeting.rescheduleProposal.data)} às {meeting.rescheduleProposal.hora}
                {meeting.rescheduleProposal.proposedByName &&
                  ` — sugerido por ${meeting.rescheduleProposal.proposedByName}`}
              </p>
              {meeting.rescheduleProposal.note && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {meeting.rescheduleProposal.note}
                </p>
              )}
              {isCreator && (
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={acceptProposal}
                    className="rounded-md bg-emerald-500/15 px-2.5 py-1 text-xs text-emerald-700 hover:bg-emerald-500/25 dark:text-emerald-400"
                  >
                    Aceitar sugestão
                  </button>
                  <button
                    type="button"
                    onClick={dismissProposal}
                    className="rounded-md border border-border px-2.5 py-1 text-xs hover:bg-muted"
                  >
                    Descartar
                  </button>
                </div>
              )}
            </div>
          )}

          {proposing && (
            <div className="rounded-md border border-border p-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Nova data</label>
                  <input
                    type="date"
                    value={propData}
                    onChange={(e) => setPropData(e.target.value)}
                    className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Nova hora</label>
                  <input
                    type="time"
                    value={propHora}
                    onChange={(e) => setPropHora(e.target.value)}
                    className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
              </div>
              <input
                type="text"
                value={propNote}
                onChange={(e) => setPropNote(e.target.value)}
                placeholder="Observação (opcional)"
                className="mt-2 h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={sendProposal}
                  className="rounded-md bg-foreground px-2.5 py-1 text-xs font-medium text-background hover:opacity-90"
                >
                  Enviar sugestão
                </button>
                <button
                  type="button"
                  onClick={() => setProposing(false)}
                  className="rounded-md border border-border px-2.5 py-1 text-xs hover:bg-muted"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            {isParticipant && meeting.status !== "Cancelada" && (
              <>
                <button
                  type="button"
                  onClick={confirm}
                  className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2.5 py-1.5 text-xs text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-400"
                >
                  <Check className="h-3.5 w-3.5" /> Confirmar
                </button>
                <button
                  type="button"
                  onClick={decline}
                  className="rounded-md border border-border px-2.5 py-1.5 text-xs hover:bg-muted"
                >
                  Recusar
                </button>
                {!proposing && (
                  <button
                    type="button"
                    onClick={() => setProposing(true)}
                    className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs hover:bg-muted"
                  >
                    <CalendarClock className="h-3.5 w-3.5" /> Sugerir novo horário
                  </button>
                )}
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isCreator && (
              <button
                type="button"
                onClick={() => onEdit(meeting)}
                className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted"
              >
                <Pencil className="h-3.5 w-3.5" /> Editar
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center gap-1 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90"
            >
              Fechar
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AttendanceDialog({
  meeting,
  onSubmit,
  onSkip,
}: {
  meeting: Meeting | null;
  onSubmit: (attendedBy: string[]) => void;
  onSkip: () => void;
}) {
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [checked, setChecked] = useState<string[]>([]);

  useEffect(() => {
    if (!meeting) return;
    setTeam(loadTeam());
    setChecked(meeting.participanteIds ?? []);
  }, [meeting?.id]);

  if (!meeting) return null;

  const toggle = (id: string) => {
    setChecked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  return (
    <Dialog open={!!meeting} onOpenChange={(v) => !v && onSkip()}>
      <DialogContent className="max-w-md">
        <DialogTitle>Quem participou da reunião?</DialogTitle>
        <DialogDescription className="text-xs text-muted-foreground">
          {meeting.titulo} · {formatBR(meeting.data)} às {meeting.hora}
        </DialogDescription>

        <div className="mt-2 space-y-1">
          {(meeting.participanteIds ?? []).map((id) => {
            const t = team.find((m) => m.id === id);
            return (
              <label
                key={id}
                className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted/60"
              >
                <input
                  type="checkbox"
                  checked={checked.includes(id)}
                  onChange={() => toggle(id)}
                  className="h-3.5 w-3.5"
                />
                {t?.name ?? id}
              </label>
            );
          })}
        </div>

        <div className="mt-4 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onSkip}
            className="rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-muted"
          >
            Pular
          </button>
          <button
            type="button"
            onClick={() => onSubmit(checked)}
            className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90"
          >
            <Check className="h-3.5 w-3.5" /> Confirmar presença
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
