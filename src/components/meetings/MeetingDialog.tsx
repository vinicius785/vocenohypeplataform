import { useEffect, useState } from "react";
import {
  Users,
  X,
  Trash2,
  CalendarClock,
  MapPin,
  UserPlus,
  Repeat,
  StickyNote,
  Video,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { DateField } from "@/components/ui/date-field";
import { Button } from "@/components/ui/button";
import { useConfirmChoice } from "@/hooks/use-confirm";
import {
  type Meeting,
  type MeetingStatus,
  type ExternalGuest,
  type Availability,
  type UnavailableBlock,
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

export function MeetingDialog({
  open,
  initial,
  seriesSize = 0,
  defaultDate,
  me,
  disponibilidades,
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
  me: { id: string; name: string };
  disponibilidades: Availability[];
  onClose: () => void;
  onSave: (meetings: Meeting[], opts?: { applyToSeries?: boolean }) => void;
  onDelete: (id: string) => void;
}) {
  const { confirmChoice, confirmChoiceDialog } = useConfirmChoice<"this" | "all">();
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
  const [weekDays, setWeekDays] = useState<number[]>([]);
  const [dailyWeekdaysOnly, setDailyWeekdaysOnly] = useState(true);
  // Progressive disclosure: campos avançados (local, notas, recorrência,
  // status manual) ficam escondidos por padrão — só os campos essenciais
  // (título, data, hora, duração, participantes) aparecem de cara.
  const [showAdvanced, setShowAdvanced] = useState(false);

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
    setDailyWeekdaysOnly(true);
    setShowAdvanced(false);
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

  // Conflitos de indisponibilidade — checa a data/hora escolhida contra o
  // bloqueio de CADA participante (inclusive quem está criando a reunião),
  // não só o próprio. É o que faz a disponibilidade de alguém aparecer pra
  // quem tenta marcar reunião com essa pessoa.
  const participantesParaChecar = [
    { id: me.id, name: `${me.name} (você)` },
    ...selectedMembers.map((m) => ({ id: m.id, name: m.name })),
  ];
  const conflitos = participantesParaChecar
    .map((p) => {
      const avail = disponibilidades.find((a) => a.id === p.id);
      const bloqueio = unavailableBlockAt(avail, data, hora, duracao);
      return bloqueio ? { name: p.name, bloqueio } : null;
    })
    .filter((x): x is { name: string; bloqueio: UnavailableBlock } => x !== null);

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

  const submit = async () => {
    if (!titulo.trim() || !data) return;
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
          {/* Essenciais: quando + participantes */}
          <section className="space-y-3 rounded-xl border border-border p-4">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <CalendarClock className="h-3.5 w-3.5" /> Quando
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Data</label>
                <DateField
                  value={data || undefined}
                  onChange={(v) => setData(v ?? "")}
                  className="mt-1 h-9"
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
          </section>

          {conflitos.length > 0 && (
            <div className="space-y-1.5 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
                Conflito de disponibilidade
              </p>
              {conflitos.map((c, i) => (
                <p key={i} className="text-xs text-amber-700 dark:text-amber-400">
                  {c.name} está indisponível nesse horário
                  {c.bloqueio.motivo ? ` — ${c.bloqueio.motivo}` : ""} ({c.bloqueio.inicio}–
                  {c.bloqueio.fim})
                </p>
              ))}
            </div>
          )}

          <section className="space-y-3 rounded-xl border border-border p-4">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <Users className="h-3.5 w-3.5" /> Participantes
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
                placeholder="Nome (convidado externo)"
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
                <UserPlus className="h-3.5 w-3.5" /> Adicionar
              </button>
            </div>
          </section>

          {/* Avançado: local, notas, recorrência, status manual */}
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            {showAdvanced ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
            Mais opções
          </button>

          {showAdvanced && (
            <div className="space-y-5">
              {!initial && (
                <section className="space-y-3 rounded-xl border border-border p-4">
                  <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    <Repeat className="h-3.5 w-3.5" /> Recorrência
                  </p>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Repetir</label>
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
                        <label className="text-xs font-medium text-muted-foreground">
                          Repetir até
                        </label>
                        <DateField
                          value={repeatUntil || undefined}
                          onChange={(v) => setRepeatUntil(v ?? "")}
                          min={data || undefined}
                          className="mt-1 h-9"
                        />
                      </div>
                    )}
                    {repeat === "daily" && (
                      <div className="sm:col-span-2">
                        <label className="text-xs font-medium text-muted-foreground">
                          Quais dias
                        </label>
                        <div className="mt-1 flex gap-1.5">
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
                </section>
              )}

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
                {initial && (
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
                )}
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
          )}
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
              disabled={!titulo.trim() || !data || (repeat !== "none" && !repeatUntil)}
            >
              Salvar
            </Button>
          </div>
        </div>
      </DialogContent>
      {confirmChoiceDialog}
    </Dialog>
  );
}
