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
  MapPin,
  UserPlus,
  Repeat,
  StickyNote,
  Video,
} from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useStorageSync } from "@/lib/use-storage-sync";
import {
  type Meeting,
  type MeetingStatus,
  type RescheduleProposal,
  type ExternalGuest,
  loadMeetings,
  saveMeetings,
  onMeetingsChange,
  meetingDisplayStatus,
  meetingNeedsMyAction,
  meetingEndTime,
} from "@/lib/reunioes-store";
import { getMe } from "@/lib/chat-store";
import { linkifyText } from "@/lib/linkify";
import { useConfirm } from "@/hooks/use-confirm";
import { SectionHeader } from "./SectionHeader";

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
  const pendentes = myMeetings.filter((m) => meetingNeedsMyAction(m, me.id)).length;

  const selectedMeetings = useMemo(
    () =>
      myMeetings.filter((m) => m.data === selected).sort((a, b) => a.hora.localeCompare(b.hora)),
    [myMeetings, selected],
  );

  return (
    <div className="mx-auto w-full max-w-6xl">
      <SectionHeader
        title="Reuniões"
        subtitle="Agenda unificada com clientes e time."
        kpis={[
          { label: "PRÓXIMAS", value: proximas },
          { label: "CONFIRMADAS", value: confirmadas },
          { label: "PENDENTES", value: pendentes },
        ]}
      />

      <div className="mt-6 flex flex-row gap-1 rounded-lg border border-border bg-card p-2 lg:w-fit">
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
          showDot={pendentes > 0}
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
        <SolicitacoesTab meetings={myMeetings} me={me} onOpen={(m) => setSummary(m)} />
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
        onSave={(saved) => {
          if (dialog?.mode === "edit" && saved.length === 1) {
            const m = saved[0];
            persist(meetings.map((x) => (x.id === m.id ? m : x)));
          } else {
            persist([...meetings, ...saved]);
          }
          setSelected(saved[0].data);
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
        onDelete={(id) => {
          persist(meetings.filter((m) => m.id !== id));
          setSummary(null);
        }}
      />
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  icon,
  children,
  showDot,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
  showDot?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition-colors ${
        active
          ? "bg-foreground font-medium text-background"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      }`}
    >
      {icon}
      {children}
      {showDot && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-destructive" />}
    </button>
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
  me,
  onOpen,
}: {
  meetings: Meeting[];
  me: { id: string; name: string };
  onOpen: (m: Meeting) => void;
}) {
  const pend = meetings
    .filter((m) => meetingNeedsMyAction(m, me.id))
    .sort((a, b) => (a.data + a.hora).localeCompare(b.data + b.hora));
  return (
    <div className="mt-6">
      <h2 className="text-sm font-semibold">Solicitações pendentes</h2>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Reuniões que você ainda não confirmou nem recusou.
      </p>
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

/** Best-effort: notifica (push no celular/desktop) quem acabou de ser
 * convidado pra esta reunião — nunca deve travar/quebrar o salvamento. */
async function notifyMeetingInvite(userIds: string[], titulo: string) {
  try {
    const { sendAppPush } = await import("@/lib/push.functions");
    await sendAppPush({
      data: {
        userIds,
        title: "Convite de reunião",
        body: titulo,
        url: "/time?section=reunioes",
      },
    });
  } catch (err) {
    console.warn("[reuniao] push notification failed", err);
  }
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
  onSave: (meetings: Meeting[]) => void;
  onDelete: (id: string) => void;
}) {
  const [titulo, setTitulo] = useState("");
  const [data, setData] = useState("");
  const [hora, setHora] = useState("10:00");
  const [duracao, setDuracao] = useState(30);
  const [participanteIds, setParticipanteIds] = useState<string[]>([]);
  const [convidadosExternos, setConvidadosExternos] = useState<ExternalGuest[]>([]);
  const [guestNome, setGuestNome] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [local, setLocal] = useState("");
  const [notas, setNotas] = useState("");
  const [status, setStatus] = useState<MeetingStatus>("Confirmada");
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [repeat, setRepeat] = useState<"none" | "daily" | "weekly" | "monthly">("none");
  const [repeatUntil, setRepeatUntil] = useState("");
  // Só usado quando repeat === "weekly" — dias da semana em que a reunião se
  // repete (0 = domingo .. 6 = sábado). Vazio = repete só no dia da semana
  // da data escolhida (comportamento antigo, "toda terça" por exemplo).
  const [weekDays, setWeekDays] = useState<number[]>([]);

  useEffect(() => {
    if (!open) return;
    setTeam(loadTeam());
    setTitulo(initial?.titulo ?? "");
    setData(initial?.data ?? defaultDate);
    setHora(initial?.hora ?? "10:00");
    setDuracao(initial?.duracao ?? 30);
    const ids =
      initial?.participanteIds ?? (initial?.participanteId ? [initial.participanteId] : []);
    setParticipanteIds(ids);
    setConvidadosExternos(initial?.convidadosExternos ?? []);
    setGuestNome("");
    setGuestEmail("");
    setLocal(initial?.local ?? "");
    setNotas(initial?.notas ?? "");
    setStatus(initial?.status ?? "Confirmada");
    setPickerOpen(false);
    setRepeat("none");
    setRepeatUntil("");
    setWeekDays([]);
  }, [open, initial, defaultDate]);

  const toggleWeekDay = (day: number) => {
    setWeekDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]));
  };

  const selectedMembers = team.filter((t) => participanteIds.includes(t.id));
  const toggleMember = (id: string) => {
    setParticipanteIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const addGuest = () => {
    const nome = guestNome.trim();
    const email = guestEmail.trim().toLowerCase();
    if (!nome || !EMAIL_RE.test(email)) return;
    if (convidadosExternos.some((g) => g.email === email)) return;
    setConvidadosExternos((prev) => [...prev, { nome, email }]);
    setGuestNome("");
    setGuestEmail("");
  };
  const removeGuest = (email: string) => {
    setConvidadosExternos((prev) => prev.filter((g) => g.email !== email));
  };

  // Próxima data da série a partir de `d` (yyyy-mm-dd), conforme a
  // frequência escolhida — mensal usa o dia do mês da primeira ocorrência,
  // então cai automaticamente pro último dia válido em meses mais curtos.
  const nextRepeatDate = (d: string, freq: "daily" | "weekly" | "monthly"): string => {
    const dt = parseISODate(d);
    if (freq === "daily") dt.setDate(dt.getDate() + 1);
    else if (freq === "weekly") dt.setDate(dt.getDate() + 7);
    else dt.setMonth(dt.getMonth() + 1);
    return toISODate(dt);
  };

  const MAX_OCCURRENCES = 52;

  const submit = () => {
    if (!titulo.trim() || !data) return;
    const prevParticipantIds =
      initial?.participanteIds ?? (initial?.participanteId ? [initial.participanteId] : []);
    const newlyInvited = participanteIds.filter(
      (id) => id !== me.id && !prevParticipantIds.includes(id),
    );
    if (newlyInvited.length > 0) void notifyMeetingInvite(newlyInvited, titulo.trim());
    const finalStatus: MeetingStatus = !initial && participanteIds.length > 0 ? "Pendente" : status;
    // `com` fica só como resumo legado (nomes juntos) pras telas que ainda
    // não foram atualizadas pra ler `participanteIds`/`convidadosExternos`
    // diretamente — os dados de verdade vivem nesses dois campos.
    const comSummary = [
      ...selectedMembers.map((m) => m.name),
      ...convidadosExternos.map((g) => g.nome),
    ].join(", ");
    const base: Omit<Meeting, "id" | "data"> = {
      titulo: titulo.trim(),
      hora,
      duracao,
      com: comSummary,
      participanteId: participanteIds[0],
      participanteIds: participanteIds.length ? participanteIds : undefined,
      convidadosExternos: convidadosExternos.length ? convidadosExternos : undefined,
      local: local.trim(),
      notas: notas.trim() || undefined,
      status: finalStatus,
      criadorId: initial?.criadorId ?? me.id,
      confirmedBy: initial?.confirmedBy,
      declinedBy: initial?.declinedBy,
      rescheduleProposal: initial?.rescheduleProposal,
    };

    if (initial || repeat === "none" || !repeatUntil || repeatUntil < data) {
      onSave([{ id: initial?.id ?? crypto.randomUUID(), data, ...base }]);
      return;
    }

    let dates: string[];
    if (repeat === "weekly" && weekDays.length > 0) {
      dates = [];
      const cursor = parseISODate(data);
      while (dates.length < MAX_OCCURRENCES) {
        const iso = toISODate(cursor);
        if (iso > repeatUntil) break;
        if (weekDays.includes(cursor.getDay())) dates.push(iso);
        cursor.setDate(cursor.getDate() + 1);
      }
    } else {
      dates = [data];
      let cursor = data;
      while (dates.length < MAX_OCCURRENCES) {
        cursor = nextRepeatDate(cursor, repeat);
        if (cursor > repeatUntil) break;
        dates.push(cursor);
      }
    }
    onSave(dates.map((d) => ({ id: crypto.randomUUID(), data: d, ...base })));
  };

  const fieldCls =
    "h-9 w-full rounded-md border border-border bg-background px-2.5 text-sm outline-none focus:ring-2 focus:ring-ring";

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="flex max-h-[88vh] max-w-2xl flex-col gap-0 overflow-hidden p-0">
        <div className="border-b border-border px-6 py-5">
          <DialogTitle className="sr-only">
            {initial ? "Editar reunião" : "Nova reunião"}
          </DialogTitle>
          <DialogDescription className="sr-only">Cadastro de reunião</DialogDescription>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {initial ? "Editar reunião" : "Nova reunião"}
          </p>
          <input
            type="text"
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            placeholder="Título da reunião"
            className="w-full border-0 bg-transparent p-0 text-xl font-light tracking-tight text-foreground outline-none placeholder:text-muted-foreground/50 focus:ring-0"
          />
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
          {/* Quando */}
          <section className="space-y-3 rounded-xl border border-border p-4">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <CalendarClock className="h-3.5 w-3.5" /> Quando
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Data</label>
                <input
                  type="date"
                  value={data}
                  onChange={(e) => setData(e.target.value)}
                  className={`mt-1 ${fieldCls}`}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Hora</label>
                <input
                  type="time"
                  value={hora}
                  onChange={(e) => setHora(e.target.value)}
                  className={`mt-1 ${fieldCls}`}
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
                  className={`mt-1 ${fieldCls}`}
                />
              </div>
            </div>
            {!initial && (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div>
                  <label className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                    <Repeat className="h-3 w-3" /> Repetir
                  </label>
                  <select
                    value={repeat}
                    onChange={(e) => setRepeat(e.target.value as typeof repeat)}
                    className={`mt-1 ${fieldCls}`}
                  >
                    <option value="none">Não repete</option>
                    <option value="daily">Diariamente</option>
                    <option value="weekly">Semanalmente</option>
                    <option value="monthly">Mensalmente</option>
                  </select>
                </div>
                {repeat !== "none" && (
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Repetir até</label>
                    <input
                      type="date"
                      value={repeatUntil}
                      min={data}
                      onChange={(e) => setRepeatUntil(e.target.value)}
                      className={`mt-1 ${fieldCls}`}
                    />
                  </div>
                )}
                {repeat === "weekly" && (
                  <div className="sm:col-span-2">
                    <label className="text-xs font-medium text-muted-foreground">
                      Dias da semana
                    </label>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {DIAS_LABEL.map((label, i) => (
                        <button
                          key={label}
                          type="button"
                          onClick={() => toggleWeekDay(i)}
                          className={`h-8 w-11 rounded-md border text-xs font-medium ${
                            weekDays.includes(i)
                              ? "border-foreground bg-foreground text-background"
                              : "border-border text-muted-foreground hover:bg-muted"
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {weekDays.length === 0
                        ? `Sem seleção, repete só toda ${DIAS_LABEL[parseISODate(data).getDay()]}.`
                        : "Repete nos dias marcados, toda semana."}
                    </p>
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Participantes internos */}
          <section className="space-y-3 rounded-xl border border-border p-4">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <Users className="h-3.5 w-3.5" /> Time
            </p>
            <div className="relative">
              <button
                type="button"
                onClick={() => setPickerOpen((v) => !v)}
                className="flex min-h-9 w-full flex-wrap items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-left text-sm hover:bg-muted/40"
              >
                {selectedMembers.length === 0 ? (
                  <span className="text-muted-foreground">Selecionar membros do time…</span>
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
                <div className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-md border border-border bg-popover p-1 shadow-lg">
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
            </div>
            {participanteIds.length > 0 && !initial && (
              <p className="text-[11px] text-muted-foreground">
                Uma solicitação será enviada pra cada pessoa (fica em Solicitações como Pendente).
              </p>
            )}
          </section>

          {/* Convidados externos */}
          <section className="space-y-3 rounded-xl border border-border p-4">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <UserPlus className="h-3.5 w-3.5" /> Convidados externos
            </p>
            {convidadosExternos.length > 0 && (
              <ul className="space-y-1.5">
                {convidadosExternos.map((g) => (
                  <li
                    key={g.email}
                    className="flex items-center justify-between gap-2 rounded-md bg-muted/50 px-2.5 py-1.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm text-foreground">{g.nome}</p>
                      <p className="truncate text-[11px] text-muted-foreground">{g.email}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeGuest(g.email)}
                      aria-label={`Remover ${g.nome}`}
                      className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                type="text"
                value={guestNome}
                onChange={(e) => setGuestNome(e.target.value)}
                placeholder="Nome"
                className={`sm:w-1/3 ${fieldCls}`}
              />
              <input
                type="email"
                value={guestEmail}
                onChange={(e) => setGuestEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addGuest();
                  }
                }}
                placeholder="e-mail@exemplo.com"
                className={`flex-1 ${fieldCls}`}
              />
              <button
                type="button"
                onClick={addGuest}
                disabled={!guestNome.trim() || !EMAIL_RE.test(guestEmail.trim())}
                className="inline-flex h-9 shrink-0 items-center gap-1 rounded-md border border-border px-3 text-sm hover:bg-muted disabled:opacity-40"
              >
                <Plus className="h-3.5 w-3.5" /> Adicionar
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Recebem o convite por e-mail direto do Google Agenda, com link de videochamada.
            </p>
          </section>

          {/* Local / Notas */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                <MapPin className="h-3 w-3" /> Local / Link
              </label>
              <input
                type="text"
                value={local}
                onChange={(e) => setLocal(e.target.value)}
                placeholder="Endereço, sala..."
                className={`mt-1 ${fieldCls}`}
              />
              <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                <Video className="h-3 w-3" /> O link do Google Meet é gerado automaticamente.
              </p>
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

          <div>
            <label className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
              <StickyNote className="h-3 w-3" /> Notas
            </label>
            <textarea
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              rows={3}
              placeholder="Pauta, contexto, links de apoio..."
              className="mt-1 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-border px-6 py-4">
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
              className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-sm hover:bg-muted"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={!titulo.trim() || !data || (repeat !== "none" && !repeatUntil)}
              className="inline-flex items-center gap-1.5 rounded-full bg-foreground px-4 py-1.5 text-xs font-medium text-background hover:opacity-90 disabled:opacity-50"
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

function SummarySection({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-muted/20 p-3.5">
      <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {icon}
        {title}
      </div>
      {children}
    </div>
  );
}

function MiniAvatar({ member, fallback }: { member?: TeamMember; fallback: string }) {
  if (member?.photo) {
    return <img src={member.photo} alt="" className="h-6 w-6 shrink-0 rounded-full object-cover" />;
  }
  const label = member?.name ?? fallback;
  return (
    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-muted text-[10px] font-medium text-muted-foreground">
      {label.trim()[0]?.toUpperCase() ?? "?"}
    </span>
  );
}

export function MeetingSummaryDialog({
  meeting,
  me,
  onClose,
  onEdit,
  onChange,
  onDelete,
}: {
  meeting: Meeting | null;
  me: { id: string; name: string };
  onClose: () => void;
  onEdit: (m: Meeting) => void;
  onChange: (m: Meeting) => void;
  onDelete: (id: string) => void;
}) {
  const { confirm: confirmDelete, confirmDialog: deleteConfirmDialog } = useConfirm();
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [proposing, setProposing] = useState(false);
  const [propData, setPropData] = useState("");
  const [propHora, setPropHora] = useState("");
  const [propNote, setPropNote] = useState("");
  const [editingAttendance, setEditingAttendance] = useState(false);
  const [attendanceChecked, setAttendanceChecked] = useState<string[]>([]);
  const [transcricao, setTranscricao] = useState("");

  useEffect(() => {
    if (!meeting) return;
    setTeam(loadTeam());
    setProposing(false);
    setPropData(meeting.data);
    setPropHora(meeting.hora);
    setPropNote("");
    setEditingAttendance(false);
    setAttendanceChecked(meeting.attendedBy ?? meeting.participanteIds ?? []);
    setTranscricao(meeting.transcricao ?? "");
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
  const memberFor = (id: string) => team.find((t) => t.id === id);
  const nameFor = (id: string) =>
    id === me.id ? `${me.name} (você)` : (memberFor(id)?.name ?? id);
  const isFinished = meetingEndTime(meeting) < Date.now();

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
  const toggleAttendance = (id: string) => {
    setAttendanceChecked((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };
  const saveAttendance = () => {
    onChange({
      ...meeting,
      attendedBy: attendanceChecked,
      attendanceRecorded: true,
      transcricao: transcricao.trim() || undefined,
    });
    setEditingAttendance(false);
  };

  const displayStatus = meetingDisplayStatus(meeting);

  return (
    <Dialog open={!!meeting} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="flex max-h-[85vh] max-w-lg flex-col gap-0 p-0">
        <div className="border-b border-border px-6 py-4">
          <DialogTitle className="text-lg">{meeting.titulo}</DialogTitle>
          <DialogDescription className="sr-only">Resumo da reunião</DialogDescription>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${statusTone(displayStatus)}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${statusDot(displayStatus)}`} />
              {displayStatus}
            </span>
            <span>{formatBR(meeting.data)}</span>
            <span>·</span>
            <span>
              {meeting.hora} · {meeting.duracao} min
            </span>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-6 py-4">
          {meeting.local && (
            <SummarySection title="Local / Link">
              <p className="break-words text-sm text-foreground">{linkifyText(meeting.local)}</p>
            </SummarySection>
          )}

          {meeting.notas && (
            <SummarySection title="Notas">
              <p className="whitespace-pre-wrap break-words text-sm text-foreground">
                {linkifyText(meeting.notas)}
              </p>
            </SummarySection>
          )}

          <SummarySection title="Participantes">
            <ul className="space-y-1.5">
              {(meeting.convidadosExternos?.length ?? 0) > 0
                ? meeting.convidadosExternos!.map((g) => (
                    <li key={g.email} className="text-sm text-muted-foreground">
                      {g.nome} <span className="text-[11px]">(externo · {g.email})</span>
                    </li>
                  ))
                : participantIds.length === 0 &&
                  meeting.com && (
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
                  <li key={id} className="flex items-center gap-2">
                    <MiniAvatar member={memberFor(id)} fallback={nameFor(id)} />
                    <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                      {nameFor(id)}
                      {id === meeting.criadorId && (
                        <span className="ml-1 text-[10px] text-muted-foreground">(criador)</span>
                      )}
                    </span>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${participantBadge(kind)}`}
                    >
                      {label}
                    </span>
                  </li>
                );
              })}
            </ul>
          </SummarySection>

          {meeting.status !== "Cancelada" && (
            <SummarySection title="Presença" icon={<CalendarClock className="h-3.5 w-3.5" />}>
              {!editingAttendance ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    {meeting.attendanceRecorded ? (
                      <p className="text-sm text-foreground">
                        {(meeting.attendedBy ?? []).length} de {participantIds.length} participaram
                      </p>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Quem participou ainda não foi registrado.
                      </p>
                    )}
                    {isCreator && (
                      <button
                        type="button"
                        onClick={() => setEditingAttendance(true)}
                        className="shrink-0 rounded-md border border-border px-2.5 py-1 text-xs hover:bg-muted"
                      >
                        {meeting.attendanceRecorded ? "Editar presença" : "Marcar presença"}
                      </button>
                    )}
                  </div>
                  {meeting.transcricao && (
                    <div className="rounded-md border border-border bg-background p-2.5">
                      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Transcrição
                      </p>
                      <p className="max-h-32 overflow-y-auto whitespace-pre-wrap break-words text-xs text-foreground">
                        {meeting.transcricao}
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    Selecione quem participou — sai da lista de pendentes e conta na pontuação.
                  </p>
                  <ul className="space-y-1">
                    {(meeting.participanteIds ?? []).map((id) => {
                      const checked = attendanceChecked.includes(id);
                      return (
                        <li key={id}>
                          <button
                            type="button"
                            onClick={() => toggleAttendance(id)}
                            className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted ${
                              checked ? "bg-muted font-medium text-foreground" : ""
                            }`}
                          >
                            <MiniAvatar member={memberFor(id)} fallback={nameFor(id)} />
                            <span className="min-w-0 flex-1 truncate">{nameFor(id)}</span>
                            {checked && <Check className="h-3.5 w-3.5 shrink-0" />}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">
                      Transcrição (opcional)
                    </label>
                    <textarea
                      value={transcricao}
                      onChange={(e) => setTranscricao(e.target.value)}
                      rows={4}
                      placeholder="Cole aqui a transcrição da reunião..."
                      className="mt-1 w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={saveAttendance}
                      className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90"
                    >
                      <Check className="h-3.5 w-3.5" /> Salvar presença
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingAttendance(false)}
                      className="rounded-md border border-border px-2.5 py-1.5 text-xs hover:bg-muted"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </SummarySection>
          )}

          {meeting.rescheduleProposal && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3.5 text-sm">
              <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                <CalendarClock className="h-3.5 w-3.5" />
                Novo horário sugerido
              </div>
              <p className="mt-1.5 text-foreground">
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
                <div className="mt-2.5 flex gap-2">
                  <button
                    type="button"
                    onClick={acceptProposal}
                    className="rounded-md bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-500/25 dark:text-emerald-400"
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
            <SummarySection title="Sugerir novo horário">
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
            </SummarySection>
          )}
        </div>

        <div className="border-t border-border">
          {isParticipant && !isFinished && meeting.status !== "Cancelada" && (
            <div className="grid grid-cols-1 gap-2 border-b border-border px-6 py-3 sm:grid-cols-3">
              <button
                type="button"
                onClick={confirm}
                className="inline-flex items-center justify-center gap-1.5 rounded-md bg-emerald-500/10 px-2.5 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-400"
              >
                <Check className="h-3.5 w-3.5" /> Confirmar
              </button>
              <button
                type="button"
                onClick={decline}
                className="inline-flex items-center justify-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-muted"
              >
                <X className="h-3.5 w-3.5" /> Recusar
              </button>
              <button
                type="button"
                onClick={() => setProposing((v) => !v)}
                className={`inline-flex items-center justify-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium ${
                  proposing ? "border-foreground bg-muted" : "border-border hover:bg-muted"
                }`}
              >
                <CalendarClock className="h-3.5 w-3.5" /> Novo horário
              </button>
            </div>
          )}
          <div className="flex items-center justify-between gap-2 px-6 py-3">
            <div>
              {isCreator && (
                <button
                  type="button"
                  onClick={async () => {
                    const ok = await confirmDelete(
                      `Excluir a reunião "${meeting.titulo}"? Essa ação não pode ser desfeita.`,
                    );
                    if (ok) onDelete(meeting.id);
                  }}
                  className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs text-red-600 hover:bg-red-500/10 dark:text-red-400"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Excluir
                </button>
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
        </div>
        {deleteConfirmDialog}
      </DialogContent>
    </Dialog>
  );
}
