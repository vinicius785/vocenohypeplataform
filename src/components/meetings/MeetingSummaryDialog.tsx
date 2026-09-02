import { useEffect, useState } from "react";
import {
  Users,
  X,
  Trash2,
  Check,
  Pencil,
  CalendarClock,
  MapPin,
  StickyNote,
  Video,
  LogIn,
  CalendarDays,
  Repeat,
} from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { DateField } from "@/components/ui/date-field";
import { Button } from "@/components/ui/button";
import {
  type Meeting,
  type RescheduleProposal,
  meetingDisplayStatus,
  meetingEndTime,
  meetingStartTime,
} from "@/lib/reunioes-store";
import { recordPerformanceEvent } from "@/lib/performance-events-store";
import { xpForMeeting, DEFAULT_PERFORMANCE_SETTINGS, isValidUuid } from "@/lib/performance-engine";
import { linkifyText } from "@/lib/linkify";
import { formatBR, statusTone, statusDot, participantBadge } from "./meeting-status";
import { joinUrlFor } from "./MeetingLine";
import { loadTeam, type TeamMember } from "./team";

function SummarySection({
  title,
  icon,
  action,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2.5 rounded-xl border border-border bg-background p-3.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
          {icon && (
            <span className="flex h-5 w-5 shrink-0 items-center justify-center text-muted-foreground">
              {icon}
            </span>
          )}
          {title}
        </div>
        {action}
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
  initialProposing = false,
  onClose,
  onEdit,
  onChange,
  onConfirm,
  onDecline,
  onDelete,
}: {
  meeting: Meeting | null;
  me: { id: string; name: string };
  /** Abre o modal já com o painel "Sugerir novo horário" expandido — usado
   * pela aba Solicitações, que oferece essa ação direto na lista. */
  initialProposing?: boolean;
  onClose: () => void;
  onEdit: (m: Meeting) => void;
  onChange: (m: Meeting) => void;
  onConfirm: (m: Meeting) => void;
  onDecline: (m: Meeting) => void;
  onDelete: (id: string) => void;
}) {
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [proposing, setProposing] = useState(false);
  const [propData, setPropData] = useState("");
  const [propHora, setPropHora] = useState("");
  const [propNote, setPropNote] = useState("");
  const [editingAttendance, setEditingAttendance] = useState(false);
  const [attendanceChecked, setAttendanceChecked] = useState<string[]>([]);
  const [transcricao, setTranscricao] = useState("");
  // Depois que a pessoa já respondeu (confirmou/recusou), os botões de
  // ação ficam escondidos atrás de "Alterar resposta" — reduz o ruído do
  // modal em vez de deixar Confirmar/Recusar competindo pra sempre com
  // "Entrar na reunião".
  const [changingResponse, setChangingResponse] = useState(false);

  useEffect(() => {
    if (!meeting) return;
    setTeam(loadTeam());
    setProposing(initialProposing);
    setPropData(meeting.data);
    setPropHora(meeting.hora);
    setPropNote("");
    setEditingAttendance(false);
    setAttendanceChecked(meeting.attendedBy ?? meeting.participanteIds ?? []);
    setTranscricao(meeting.transcricao ?? "");
    setChangingResponse(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  const isNow = Date.now() >= meetingStartTime(meeting) && Date.now() <= meetingEndTime(meeting);
  const joinUrl = joinUrlFor(meeting);
  const myResponse = confirmedBy.includes(me.id)
    ? "confirmed"
    : declinedBy.includes(me.id)
      ? "declined"
      : null;

  const confirm = () => {
    onConfirm(meeting);
    setChangingResponse(false);
  };
  const decline = () => {
    onDecline(meeting);
    setChangingResponse(false);
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
    // "Editar presença" pode rodar mais de uma vez pra mesma reunião — o
    // ledger não permite corrigir/apagar eventos antigos, então grava
    // sempre um evento novo por participante; quem lê dedup por
    // (meeting_id, person_id) tomando o de maior `occurred_at`.
    if (isValidUuid(me.id)) {
      for (const id of meeting.participanteIds ?? []) {
        const attended = attendanceChecked.includes(id);
        recordPerformanceEvent({
          eventType: "meeting_attendance_recorded",
          personId: id,
          personName: nameFor(id),
          actorId: me.id,
          actorName: me.name,
          taskId: null,
          taskOrigin: null,
          taskTitle: null,
          meetingId: meeting.id,
          data: { attended, xpDelta: xpForMeeting(attended, DEFAULT_PERFORMANCE_SETTINGS) },
        });
      }
    }
    setEditingAttendance(false);
  };

  const displayStatus = meetingDisplayStatus(meeting);
  const showResponseButtons =
    isParticipant &&
    !isFinished &&
    meeting.status !== "Cancelada" &&
    (!myResponse || changingResponse);

  return (
    <Dialog open={!!meeting} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="flex max-h-[85vh] w-full max-w-xl flex-col gap-0 overflow-hidden rounded-2xl p-0">
        <div className="flex items-start gap-3 border-b border-border px-6 py-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
            <Video className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <DialogTitle className="truncate text-lg font-semibold">{meeting.titulo}</DialogTitle>
            <DialogDescription className="sr-only">Resumo da reunião</DialogDescription>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
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
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-6 py-4">
          {joinUrl && (
            <a href={joinUrl} target="_blank" rel="noreferrer" className="block">
              <Button className="w-full" size="lg">
                <LogIn className="h-4 w-4" />
                {isNow ? "Entrar agora" : "Entrar na reunião"}
              </Button>
            </a>
          )}

          <SummarySection title="Participantes" icon={<Users className="h-3.5 w-3.5" />}>
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

          {isParticipant && myResponse && !changingResponse && !isFinished && (
            <div className="flex items-center justify-between gap-2 rounded-xl border border-border bg-background px-3.5 py-2.5">
              <span className="inline-flex items-center gap-1.5 text-sm text-foreground">
                <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                {myResponse === "confirmed" ? "Você confirmou presença" : "Você recusou"}
              </span>
              <button
                type="button"
                onClick={() => setChangingResponse(true)}
                className="shrink-0 text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                Alterar resposta
              </button>
            </div>
          )}

          <SummarySection title="Detalhes" icon={<MapPin className="h-3.5 w-3.5" />}>
            <div className="space-y-2">
              {meeting.meetLink && (
                <a
                  href={meeting.meetLink}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
                >
                  <Video className="h-3.5 w-3.5" /> Entrar no Google Meet
                </a>
              )}
              {meeting.local && !meeting.meetLink && (
                <p className="break-words text-sm text-foreground">{linkifyText(meeting.local)}</p>
              )}
              {meeting.criadorId && (
                <p className="text-sm text-muted-foreground">
                  Criado por {nameFor(meeting.criadorId)}
                </p>
              )}
              {meeting.seriesId && (
                <p className="flex items-center gap-1 text-sm text-muted-foreground">
                  <Repeat className="h-3.5 w-3.5" /> Faz parte de uma reunião recorrente
                </p>
              )}
              {meeting.origem === "google" && (
                <p className="flex items-center gap-1 text-sm text-muted-foreground">
                  <CalendarDays className="h-3.5 w-3.5" /> Importada do Google Calendar
                </p>
              )}
              {meeting.notas && (
                <div className="pt-1">
                  <p className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <StickyNote className="h-3 w-3" /> Notas
                  </p>
                  <p className="whitespace-pre-wrap break-words text-sm text-foreground">
                    {linkifyText(meeting.notas)}
                  </p>
                </div>
              )}
            </div>
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
                    <div className="rounded-md border border-border bg-muted/40 p-2.5">
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
                    <Button size="sm" onClick={saveAttendance}>
                      <Check className="h-3.5 w-3.5" /> Salvar presença
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setEditingAttendance(false)}>
                      Cancelar
                    </Button>
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
                  <DateField
                    value={propData || undefined}
                    onChange={(v) => setPropData(v ?? "")}
                    className="mt-1"
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
                <Button size="sm" onClick={sendProposal}>
                  Enviar sugestão
                </Button>
                <Button size="sm" variant="outline" onClick={() => setProposing(false)}>
                  Cancelar
                </Button>
              </div>
            </SummarySection>
          )}
        </div>

        <div className="border-t border-border">
          {showResponseButtons && (
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
                  onClick={() => onDelete(meeting.id)}
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
              <Button size="sm" onClick={onClose}>
                Fechar
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
