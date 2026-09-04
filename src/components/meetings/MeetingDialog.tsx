import { useEffect, useMemo, useState } from "react";
import {
  X,
  Trash2,
  MapPin,
  UserPlus,
  Video,
  ChevronDown,
  ChevronRight,
  Plus,
  AlertTriangle,
  Check,
} from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { DateField } from "@/components/ui/date-field";
import { TimeField } from "@/components/ui/time-field";
import { Button } from "@/components/ui/button";
import { useConfirmChoice } from "@/hooks/use-confirm";
import {
  type Meeting,
  type MeetingStatus,
  type ExternalGuest,
  type Availability,
  unavailableBlockAt,
} from "@/lib/reunioes-store";
import { toISODate, parseISODate, statusTone } from "./meeting-status";
import { loadTeam, type TeamMember } from "./team";

const DIAS_LABEL = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_OCCURRENCES = 52;

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

function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}
function addMinutes(hhmm: string, delta: number): string {
  const total = (((minutesOf(hhmm) + delta) % (24 * 60)) + 24 * 60) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
/** Próximo horário "redondo" (múltiplo de 15min) a partir de agora —
 * sugestão de início ao abrir "Nova reunião" sem hora vinda do
 * calendário (ex: clique num dia da grade mensal). */
function nextRoundTime(): string {
  const now = new Date();
  const rounded = Math.ceil(now.getMinutes() / 15) * 15;
  const h = (now.getHours() + Math.floor(rounded / 60)) % 24;
  return `${String(h).padStart(2, "0")}:${String(rounded % 60).padStart(2, "0")}`;
}
function durationLabel(startHHMM: string, endHHMM: string): string {
  const diff = minutesOf(endHHMM) - minutesOf(startHHMM);
  if (diff <= 0) return "";
  const h = Math.floor(diff / 60);
  const m = diff % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h}h`;
  return `${h}h${m}`;
}

export function MeetingDialog({
  open,
  initial,
  seriesSize = 0,
  defaultDate,
  defaultHora,
  me,
  disponibilidades,
  meetings = [],
  onClose,
  onSave,
  onDelete,
}: {
  open: boolean;
  initial?: Meeting;
  /** Quantas reuniões (incluindo esta) compartilham `initial?.seriesId` —
   * 0/1 quando não é série. O pai calcula, porque só ele tem a lista
   * completa de reuniões. */
  seriesSize?: number;
  defaultDate: string;
  /** Horário sugerido de início — vem preenchido quando a reunião é
   * criada clicando direto num horário da grade Semana do Calendário. */
  defaultHora?: string;
  me: { id: string; name: string };
  disponibilidades: Availability[];
  /** Todas as reuniões (não só as minhas) — usada só pra detectar
   * conflito de agenda dos participantes selecionados, nunca alterada. */
  meetings?: Meeting[];
  onClose: () => void;
  onSave: (meetings: Meeting[], opts?: { applyToSeries?: boolean }) => void;
  onDelete: (id: string) => void;
}) {
  const { confirmChoice, confirmChoiceDialog } = useConfirmChoice<"this" | "all">();
  const [titulo, setTitulo] = useState("");
  const [data, setData] = useState("");
  const [horaInicio, setHoraInicio] = useState("10:00");
  const [horaFim, setHoraFim] = useState("10:30");
  const [participanteIds, setParticipanteIds] = useState<string[]>([]);
  const [convidadosExternos, setConvidadosExternos] = useState<ExternalGuest[]>([]);
  const [addingGuest, setAddingGuest] = useState(false);
  const [guestNome, setGuestNome] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [local, setLocal] = useState("");
  const [notas, setNotas] = useState("");
  const [status, setStatus] = useState<MeetingStatus>("Confirmada");
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [repeat, setRepeat] = useState<"none" | "daily" | "weekly" | "monthly">("none");
  const [repeatUntil, setRepeatUntil] = useState("");
  const [weekDays, setWeekDays] = useState<number[]>([]);
  const [dailyWeekdaysOnly, setDailyWeekdaysOnly] = useState(true);
  // Progressive disclosure: recorrência/local/notas/status manual ficam
  // escondidos por padrão — o fluxo essencial é título → quando →
  // participantes → criar.
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTeam(loadTeam());
    setTitulo(initial?.titulo ?? "");
    setData(initial?.data ?? defaultDate);
    const start = initial?.hora ?? defaultHora ?? nextRoundTime();
    setHoraInicio(start);
    setHoraFim(initial ? addMinutes(start, initial.duracao) : addMinutes(start, 30));
    const ids =
      initial?.participanteIds ?? (initial?.participanteId ? [initial.participanteId] : []);
    setParticipanteIds(ids);
    setConvidadosExternos(initial?.convidadosExternos ?? []);
    setAddingGuest(false);
    setGuestNome("");
    setGuestEmail("");
    setLocal(initial?.local ?? "");
    setNotas(initial?.notas ?? "");
    setStatus(initial?.status ?? "Confirmada");
    setPickerOpen(false);
    setRepeat("none");
    setRepeatUntil("");
    setWeekDays([]);
    setDailyWeekdaysOnly(true);
    setShowAdvanced(false);
  }, [open, initial, defaultDate, defaultHora]);

  const toggleWeekDay = (day: number) => {
    setWeekDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]));
  };

  const selectedMembers = team.filter((t) => participanteIds.includes(t.id));
  const toggleMember = (id: string) => {
    setParticipanteIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  // Início e fim "andam juntos": mudar o início preserva a duração atual
  // (conveniência de UX) — o usuário continua livre pra mudar o fim
  // depois, isso só evita ter que reajustar os dois campos sempre.
  const changeStart = (next: string) => {
    const duracaoAtual = minutesOf(horaFim) - minutesOf(horaInicio);
    setHoraInicio(next);
    if (duracaoAtual > 0) setHoraFim(addMinutes(next, duracaoAtual));
  };

  const timeError =
    horaInicio && horaFim && minutesOf(horaFim) <= minutesOf(horaInicio)
      ? "O horário de término deve ser posterior ao início."
      : null;
  const duracao = Math.max(0, minutesOf(horaFim) - minutesOf(horaInicio));

  // Conflitos — checa data/horário escolhidos contra a indisponibilidade
  // de CADA participante selecionado E contra outras reuniões que já
  // ocupam a agenda dela nesse intervalo (interseção de horário, exclui
  // a própria reunião sendo editada). Nunca bloqueia o salvamento —
  // só avisa, pra decisão do organizador.
  const conflictsFor = useMemo(() => {
    const map = new Map<string, { kind: "disponibilidade" | "agenda"; detail: string }>();
    if (!data || !horaInicio || !horaFim || duracao <= 0) return map;
    for (const p of selectedMembers) {
      const avail = disponibilidades.find((a) => a.id === p.id);
      const bloqueio = unavailableBlockAt(avail, data, horaInicio, duracao);
      if (bloqueio) {
        map.set(p.id, {
          kind: "disponibilidade",
          detail: `Indisponível das ${bloqueio.inicio} às ${bloqueio.fim}${bloqueio.motivo ? ` · ${bloqueio.motivo}` : ""}`,
        });
        continue;
      }
      const startMin = minutesOf(horaInicio);
      const endMin = minutesOf(horaFim);
      const conflita = meetings.some((m) => {
        if (m.id === initial?.id) return false;
        if (m.status === "Cancelada") return false;
        if (m.data !== data) return false;
        if (m.criadorId !== p.id && !m.participanteIds?.includes(p.id)) return false;
        const mStart = minutesOf(m.hora);
        const mEnd = mStart + m.duracao;
        return startMin < mEnd && endMin > mStart;
      });
      if (conflita) {
        map.set(p.id, { kind: "agenda", detail: "Possui outra reunião nesse horário" });
      }
    }
    return map;
  }, [selectedMembers, disponibilidades, meetings, data, horaInicio, horaFim, duracao, initial]);

  const addGuest = () => {
    const nome = guestNome.trim();
    const email = guestEmail.trim().toLowerCase();
    if (!nome || !EMAIL_RE.test(email)) return;
    if (convidadosExternos.some((g) => g.email === email)) return;
    setConvidadosExternos((prev) => [...prev, { nome, email }]);
    setGuestNome("");
    setGuestEmail("");
    setAddingGuest(false);
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

  const submit = async () => {
    if (!titulo.trim() || !data || timeError || duracao <= 0) return;
    let applyToSeries = false;
    if (initial?.seriesId && seriesSize > 1) {
      const choice = await confirmChoice(
        `"${initial.titulo}" faz parte de uma série de ${seriesSize} reuniões recorrentes. Aplicar essa alteração em qual delas?`,
        [
          { value: "this", label: "Só esta" },
          { value: "all", label: `Todas (${seriesSize})` },
        ],
      );
      if (!choice) return;
      applyToSeries = choice === "all";
    }
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
      seriesId: initial?.seriesId,
      titulo: titulo.trim(),
      hora: horaInicio,
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
      onSave([{ id: initial?.id ?? crypto.randomUUID(), data, ...base }], { applyToSeries });
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
    } else if (repeat === "daily" && dailyWeekdaysOnly) {
      dates = [];
      const cursor = parseISODate(data);
      while (dates.length < MAX_OCCURRENCES) {
        const iso = toISODate(cursor);
        if (iso > repeatUntil) break;
        const dow = cursor.getDay();
        if (dow !== 0 && dow !== 6) dates.push(iso);
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
    // Mais de 1 data gerada = uma série de verdade — carimba o mesmo
    // `seriesId` em todas, pra excluir/editar depois poder oferecer "só
    // esta ou todas". Uma repetição que gerou 1 única data (ex: data de
    // início já é depois de "repetir até") não vira série.
    const seriesId = dates.length > 1 ? crypto.randomUUID() : undefined;
    onSave(dates.map((d) => ({ id: crypto.randomUUID(), data: d, ...base, seriesId })));
  };

  const fieldCls =
    "h-9 w-full rounded-md border border-border bg-background px-2.5 text-sm outline-none focus:ring-2 focus:ring-ring";
  const weekdayOfData = data ? DIAS_LABEL[parseISODate(data).getDay()] : "";

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        mobileFullScreen
        className="flex max-h-[88vh] max-w-lg flex-col gap-0 overflow-hidden p-0"
      >
        <div className="px-6 pb-2 pt-6">
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

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 pb-5 pt-2">
          {/* Quando: data + início → fim como um único grupo */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Quando
            </p>
            <div className="mt-2">
              <DateField value={data || undefined} onChange={(v) => setData(v ?? "")} />
            </div>
            <div className="mt-2 flex items-end gap-2">
              <div className="flex-1">
                <label className="text-xs text-muted-foreground">Início</label>
                <div className="mt-1">
                  <TimeField value={horaInicio} onChange={changeStart} ariaLabel="Início" />
                </div>
              </div>
              <span className="mb-2 text-muted-foreground">→</span>
              <div className="flex-1">
                <label className="text-xs text-muted-foreground">Fim</label>
                <div className="mt-1">
                  <TimeField value={horaFim} onChange={setHoraFim} ariaLabel="Fim" />
                </div>
              </div>
            </div>
            {timeError ? (
              <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">{timeError}</p>
            ) : (
              durationLabel(horaInicio, horaFim) && (
                <p className="mt-1.5 text-xs text-muted-foreground">
                  {durationLabel(horaInicio, horaFim)}
                  {weekdayOfData ? ` · ${weekdayOfData}` : ""}
                </p>
              )
            )}
          </div>

          <div className="border-t border-border/60 pt-4">
            {/* Participantes */}
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Participantes
            </p>
            {(selectedMembers.length > 0 || convidadosExternos.length > 0) && (
              <ul className="mt-2 space-y-0.5">
                {selectedMembers.map((m) => {
                  const conflict = conflictsFor.get(m.id);
                  return (
                    <li key={m.id} className="flex items-center gap-2.5 rounded-lg px-1 py-1.5">
                      {m.photo ? (
                        <img src={m.photo} alt="" className="h-7 w-7 rounded-full object-cover" />
                      ) : (
                        <span className="grid h-7 w-7 place-items-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
                          {m.name.trim()[0]?.toUpperCase() ?? "?"}
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-foreground">{m.name}</p>
                        {conflict && (
                          <p
                            className="flex items-center gap-1 truncate text-xs text-amber-700 dark:text-amber-400"
                            title={conflict.detail}
                          >
                            <AlertTriangle className="h-3 w-3 shrink-0" />
                            {conflict.kind === "disponibilidade"
                              ? "Indisponível neste horário"
                              : "Possui conflito de agenda"}
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => toggleMember(m.id)}
                        aria-label={`Remover ${m.name}`}
                        className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  );
                })}
                {convidadosExternos.map((g) => (
                  <li key={g.email} className="flex items-center gap-2.5 rounded-lg px-1 py-1.5">
                    <span className="grid h-7 w-7 place-items-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
                      {g.nome.trim()[0]?.toUpperCase() ?? "?"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-foreground">{g.nome}</p>
                      <p className="truncate text-xs text-muted-foreground">{g.email} · Externo</p>
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

            <div className="mt-2">
              <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
                  >
                    <Plus className="h-3.5 w-3.5" /> Adicionar participantes
                  </button>
                </PopoverTrigger>
                <PopoverContent align="start" className="max-h-48 w-64 overflow-auto p-1">
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
                </PopoverContent>
              </Popover>
            </div>

            {!addingGuest ? (
              <button
                type="button"
                onClick={() => setAddingGuest(true)}
                className="mt-1.5 flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
              >
                <UserPlus className="h-3.5 w-3.5" /> Convidar pessoa externa
              </button>
            ) : (
              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                <input
                  type="text"
                  value={guestNome}
                  onChange={(e) => setGuestNome(e.target.value)}
                  placeholder="Nome"
                  autoFocus
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
                  Adicionar
                </button>
              </div>
            )}
            {participanteIds.length > 0 && !initial && (
              <p className="mt-2 text-xs text-muted-foreground">
                Uma solicitação será enviada pra cada pessoa (fica em Solicitações como Pendente).
              </p>
            )}
          </div>

          {/* Mais opções */}
          <div className="border-t border-border/60 pt-4">
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              {showAdvanced ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
              Mais opções
            </button>

            {showAdvanced && (
              <div className="mt-3 space-y-4">
                {!initial && (
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-sm text-foreground">Recorrência</label>
                      <select
                        value={repeat}
                        onChange={(e) => setRepeat(e.target.value as typeof repeat)}
                        className="h-8 rounded-md border border-input bg-background px-2 text-sm outline-none focus:ring-1 focus:ring-ring"
                      >
                        <option value="none">Não repete</option>
                        <option value="daily">Diariamente</option>
                        <option value="weekly">Semanalmente</option>
                        <option value="monthly">Mensalmente</option>
                      </select>
                    </div>
                    {repeat !== "none" && (
                      <div className="mt-2 space-y-2">
                        <div>
                          <label className="text-xs font-medium text-muted-foreground">
                            Repetir até
                          </label>
                          <DateField
                            value={repeatUntil || undefined}
                            onChange={(v) => setRepeatUntil(v ?? "")}
                            min={data || undefined}
                            className="mt-1"
                          />
                        </div>
                        {repeat === "daily" && (
                          <div className="flex gap-1.5">
                            <button
                              type="button"
                              onClick={() => setDailyWeekdaysOnly(true)}
                              className={`rounded-full px-3 py-1 text-xs ${
                                dailyWeekdaysOnly
                                  ? "bg-foreground text-background"
                                  : "border border-border text-muted-foreground hover:bg-muted"
                              }`}
                            >
                              Só dias de semana
                            </button>
                            <button
                              type="button"
                              onClick={() => setDailyWeekdaysOnly(false)}
                              className={`rounded-full px-3 py-1 text-xs ${
                                !dailyWeekdaysOnly
                                  ? "bg-foreground text-background"
                                  : "border border-border text-muted-foreground hover:bg-muted"
                              }`}
                            >
                              Incluir fim de semana
                            </button>
                          </div>
                        )}
                        {repeat === "weekly" && (
                          <div className="flex flex-wrap gap-1.5">
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
                        )}
                      </div>
                    )}
                  </div>
                )}

                <div>
                  <p className="text-sm text-foreground">Videoconferência</p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Video className="h-3 w-3 shrink-0" />
                    Google Meet será criado automaticamente
                    <Check className="h-3 w-3 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  </p>
                </div>

                <div>
                  <label className="flex items-center gap-1 text-sm text-foreground">
                    <MapPin className="h-3.5 w-3.5" /> Local
                  </label>
                  <input
                    type="text"
                    value={local}
                    onChange={(e) => setLocal(e.target.value)}
                    placeholder="Adicionar local"
                    className={`mt-1.5 ${fieldCls}`}
                  />
                </div>

                {initial && (
                  <div>
                    <label className="text-sm text-foreground">Status</label>
                    <div className="mt-1.5 flex gap-1.5">
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
                )}

                <div>
                  <label className="text-sm text-foreground">Notas</label>
                  <textarea
                    value={notas}
                    onChange={(e) => setNotas(e.target.value)}
                    rows={3}
                    placeholder="Adicionar pauta, contexto ou links..."
                    className="mt-1.5 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              </div>
            )}
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
            <Button variant="outline" size="sm" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={() => void submit()}
              disabled={
                !titulo.trim() ||
                !data ||
                !!timeError ||
                duracao <= 0 ||
                (repeat !== "none" && !repeatUntil)
              }
            >
              {initial ? "Salvar alterações" : "Criar reunião"}
            </Button>
          </div>
        </div>
      </DialogContent>
      {confirmChoiceDialog}
    </Dialog>
  );
}
