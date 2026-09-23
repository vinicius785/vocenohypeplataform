import { useEffect, useState } from "react";
import {
  X,
  Trash2,
  Check,
  Pencil,
  CalendarClock,
  Video,
  LogIn,
  ChevronRight,
  ChevronDown,
  Copy,
  Repeat,
  ExternalLink,
  MoreHorizontal,
  RefreshCw,
  AlertTriangle,
} from "lucide-react";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { DateField } from "@/components/ui/date-field";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  type Meeting,
  type RescheduleProposal,
  meetingDisplayStatus,
  meetingEndTime,
  meetingStartTime,
  meetingSource,
} from "@/lib/reunioes-store";
import { toast } from "sonner";
import { recordPerformanceEvent } from "@/lib/performance-events-store";
import { xpForMeeting, DEFAULT_PERFORMANCE_SETTINGS, isValidUuid } from "@/lib/performance-engine";
import { linkifyText } from "@/lib/linkify";
import { formatBR, statusTone, statusDot, participantBadge } from "./meeting-status";
import { joinUrlFor } from "./MeetingLine";
import { AvatarStack } from "./AvatarStack";
import { loadTeam, type TeamMember } from "./team";

function MiniAvatar({ member, fallback }: { member?: TeamMember; fallback: string }) {
  if (member?.photo) {
    return <img src={member.photo} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />;
  }
  const label = member?.name ?? fallback;
  return (
    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-muted text-xs font-medium text-text-secondary">
      {label.trim()[0]?.toUpperCase() ?? "?"}
    </span>
  );
}

/** Fim (HH:MM) a partir do início + duração — usado só pra exibir
 * "10:00–10:30" numa linha só, nunca pra cálculo de negócio. */
function endTimeLabel(meeting: Meeting): string {
  const end = new Date(meetingStartTime(meeting) + meeting.duracao * 60_000);
  return `${String(end.getHours()).padStart(2, "0")}:${String(end.getMinutes()).padStart(2, "0")}`;
}

const PARTICIPANTS_PREVIEW = 5;

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
  me: { id: string; name: string; photo?: string };
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
  const [showAllParticipants, setShowAllParticipants] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  // Depois que a pessoa já respondeu (confirmou/recusou), os botões de
  // ação ficam escondidos atrás de "Alterar" — reduz o ruído do modal em
  // vez de deixar Confirmar/Recusar competindo pra sempre com "Entrar
  // na reunião".
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
    setShowAllParticipants(false);
    setDetailsOpen(false);
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
  const memberFor = (id: string) =>
    id === me.id ? { id: me.id, name: me.name, photo: me.photo } : team.find((t) => t.id === id);
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
  // "Sua resposta" (abaixo) já representa a mesma informação que um
  // badge de status no header mostraria pra quem é participante ativo —
  // mostrar os dois seria repetir o mesmo dado duas vezes. O header só
  // carrega o badge quando essa seção não existe (reunião cancelada,
  // encerrada, ou eu não sou participante).
  const showsResponseSection = isParticipant && !isFinished && meeting.status !== "Cancelada";

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

  const shownParticipants = showAllParticipants
    ? participantIds
    : participantIds.slice(0, PARTICIPANTS_PREVIEW);

  const attendedPeople = (meeting.attendedBy ?? [])
    .map((id) => ({ id, name: nameFor(id), photo: memberFor(id)?.photo }))
    .filter((p) => p.name);

  const hasDetails =
    !!meeting.seriesId ||
    meeting.origem === "google" ||
    !!meeting.meetLink ||
    (!!meeting.local && !meeting.meetLink) ||
    !!meeting.notas ||
    !!meeting.syncStatus;

  const source = meetingSource(meeting);
  const copyLink = () => {
    const link = joinUrl ?? meeting.local;
    if (!link) return;
    void navigator.clipboard.writeText(link).then(
      () => toast.success("Link copiado."),
      () => toast.error("Não foi possível copiar o link."),
    );
  };

  return (
    <Sheet open={!!meeting} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="flex h-full w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-[520px]">
        {/* Header — título, data+hora numa linha só, e uma faixa de badges
            (status, origem, recorrência, sincronização) sem depender só de
            cor pra comunicar cada estado — sempre com ícone + texto. */}
        <div className="flex items-start gap-3 border-b border-border/60 px-6 pb-4 pt-6">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-subtle text-brand">
            <Video className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <SheetTitle className="truncate text-base font-semibold leading-tight">
              {meeting.titulo}
            </SheetTitle>
            <SheetDescription className="sr-only">Resumo da reunião</SheetDescription>
            <p className="mt-1 truncate text-sm text-text-secondary">
              {formatBR(meeting.data)} · {meeting.hora}–{endTimeLabel(meeting)}
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {!showsResponseSection && (
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${statusTone(displayStatus)}`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${statusDot(displayStatus)}`} />
                  {displayStatus}
                </span>
              )}
              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-text-secondary">
                {source === "google" ? "Google Calendar" : "Plataforma"}
              </span>
              {meeting.seriesId && (
                <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-text-secondary">
                  <Repeat className="h-2.5 w-2.5" /> Recorrente
                </span>
              )}
              {meeting.syncStatus === "error" && (
                <span className="inline-flex items-center gap-1 rounded-full bg-danger-soft px-2 py-0.5 text-[11px] font-medium text-danger">
                  <AlertTriangle className="h-2.5 w-2.5" /> Falha na sincronização
                </span>
              )}
              {meeting.syncStatus === "pending" && (
                <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-text-secondary">
                  <RefreshCw className="h-2.5 w-2.5" /> Sincronizando
                </span>
              )}
            </div>
          </div>
          {meeting.googleHtmlLink && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {meeting.googleHtmlLink && (
                  <DropdownMenuItem asChild>
                    <a href={meeting.googleHtmlLink} target="_blank" rel="noreferrer">
                      <ExternalLink className="h-3.5 w-3.5" /> Abrir no Google Calendar
                    </a>
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
          {/* Criador/organizador — sempre visível, nunca em Mais detalhes */}
          {meeting.criadorId && (
            <div className="mt-3">
              <p className="text-xs text-text-secondary">Criada por</p>
              <div className="mt-1 flex items-center gap-2">
                <MiniAvatar
                  member={memberFor(meeting.criadorId)}
                  fallback={nameFor(meeting.criadorId)}
                />
                <span className="text-sm text-foreground">{nameFor(meeting.criadorId)}</span>
              </div>
            </div>
          )}

          {/* Ações principais — entrar (quando há link) sempre acompanhada
           * de "Copiar link", nunca só uma ou outra. */}
          {(joinUrl ?? meeting.local) && (
            <div className="mt-4 flex gap-2">
              {joinUrl && (
                <a href={joinUrl} target="_blank" rel="noreferrer" className="flex-1">
                  <Button variant="primary" size="lg" className="w-full">
                    <LogIn className="h-4 w-4" />
                    {isNow ? "Entrar agora" : "Entrar na reunião"}
                  </Button>
                </a>
              )}
              <Button
                variant="outline"
                size="lg"
                className={joinUrl ? "shrink-0 px-3" : "w-full"}
                onClick={copyLink}
                aria-label="Copiar link"
              >
                <Copy className="h-4 w-4" />
                {!joinUrl && "Copiar link"}
              </Button>
            </div>
          )}

          {/* Participantes — sempre visível, sem card */}
          <div className="mt-5">
            <p className="text-sm font-semibold text-foreground">
              Participantes · {participantIds.length}
            </p>
            <ul className="-mx-2 mt-1.5">
              {(meeting.convidadosExternos?.length ?? 0) > 0
                ? meeting.convidadosExternos!.map((g) => (
                    <li
                      key={g.email}
                      className="rounded-lg px-2 py-1.5 text-sm text-text-secondary"
                    >
                      {g.nome} <span className="text-xs">(externo · {g.email})</span>
                    </li>
                  ))
                : participantIds.length === 0 &&
                  meeting.com && (
                    <li className="rounded-lg px-2 py-1.5 text-sm text-text-secondary">
                      {meeting.com} (externo)
                    </li>
                  )}
              {shownParticipants.map((id) => {
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
                  <li
                    key={id}
                    className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted/50"
                  >
                    <MiniAvatar member={memberFor(id)} fallback={nameFor(id)} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-foreground">{nameFor(id)}</p>
                      {id === meeting.criadorId && (
                        <p className="text-xs text-text-secondary">Organizador</p>
                      )}
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${participantBadge(kind)}`}
                    >
                      {label}
                    </span>
                  </li>
                );
              })}
            </ul>
            {participantIds.length > PARTICIPANTS_PREVIEW && !showAllParticipants && (
              <button
                type="button"
                onClick={() => setShowAllParticipants(true)}
                className="ml-2 mt-1 text-xs font-medium text-text-secondary hover:text-foreground"
              >
                Ver todos os {participantIds.length}
              </button>
            )}
          </div>

          <div className="mt-5 space-y-4 border-t border-border/60 pt-4">
            {/* Sua resposta — uma linha só quando já respondido */}
            {showsResponseSection && (
              <div>
                {myResponse && !changingResponse ? (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-foreground">Sua resposta</span>
                    <div className="flex items-center gap-3">
                      <span className="inline-flex items-center gap-1.5 text-sm text-foreground">
                        <Check className="h-3.5 w-3.5 text-success" />
                        {myResponse === "confirmed" ? "Confirmado" : "Recusado"}
                      </span>
                      <button
                        type="button"
                        onClick={() => setChangingResponse(true)}
                        className="text-xs font-medium text-text-secondary hover:text-foreground"
                      >
                        Alterar
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-foreground">Sua resposta</span>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={confirm}>
                          <Check className="h-3.5 w-3.5" /> Confirmar
                        </Button>
                        <Button size="sm" variant="outline" onClick={decline}>
                          <X className="h-3.5 w-3.5" /> Recusar
                        </Button>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setProposing((v) => !v)}
                      className={`inline-flex items-center gap-1 text-xs font-medium ${
                        proposing ? "text-foreground" : "text-text-secondary hover:text-foreground"
                      }`}
                    >
                      <CalendarClock className="h-3 w-3" /> Sugerir outro horário
                    </button>
                  </div>
                )}
              </div>
            )}

            {meeting.rescheduleProposal && (
              <div className="rounded-lg bg-warning-soft px-3 py-2.5 text-sm">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-warning-soft-foreground">
                  <CalendarClock className="h-3.5 w-3.5" />
                  Novo horário sugerido
                </div>
                <p className="mt-1.5 text-foreground">
                  {formatBR(meeting.rescheduleProposal.data)} às {meeting.rescheduleProposal.hora}
                  {meeting.rescheduleProposal.proposedByName &&
                    ` — sugerido por ${meeting.rescheduleProposal.proposedByName}`}
                </p>
                {meeting.rescheduleProposal.note && (
                  <p className="mt-1 text-xs text-text-secondary">
                    {meeting.rescheduleProposal.note}
                  </p>
                )}
                {isCreator && (
                  <div className="mt-2.5 flex gap-2">
                    <button
                      type="button"
                      onClick={acceptProposal}
                      className="rounded-md bg-success-soft px-2.5 py-1 text-xs font-medium text-success-soft-foreground hover:bg-success-soft/70"
                    >
                      Aceitar sugestão
                    </button>
                    <button
                      type="button"
                      onClick={dismissProposal}
                      className="rounded-md px-2.5 py-1 text-xs hover:bg-muted"
                    >
                      Descartar
                    </button>
                  </div>
                )}
              </div>
            )}

            {proposing && (
              <div>
                <p className="text-sm font-semibold text-foreground">Sugerir novo horário</p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs font-medium text-text-secondary">Nova data</label>
                    <DateField
                      value={propData || undefined}
                      onChange={(v) => setPropData(v ?? "")}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-text-secondary">Nova hora</label>
                    <input
                      type="time"
                      value={propHora}
                      onChange={(e) => setPropHora(e.target.value)}
                      className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                    />
                  </div>
                </div>
                <input
                  type="text"
                  value={propNote}
                  onChange={(e) => setPropNote(e.target.value)}
                  placeholder="Observação (opcional)"
                  className="mt-2 h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                />
                <div className="mt-2 flex gap-2">
                  <Button size="sm" onClick={sendProposal}>
                    Enviar sugestão
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setProposing(false)}>
                    Cancelar
                  </Button>
                </div>
              </div>
            )}

            {/* Presença — funcional e discreta, uma linha quando possível */}
            {meeting.status !== "Cancelada" && (
              <div>
                {!editingAttendance ? (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-foreground">Presença</span>
                    <div className="flex items-center gap-2.5">
                      {meeting.attendanceRecorded ? (
                        <>
                          <AvatarStack people={attendedPeople} max={4} />
                          <span className="text-sm text-text-secondary">
                            {attendedPeople.length} participou
                            {attendedPeople.length === 1 ? "" : "ram"}
                          </span>
                        </>
                      ) : (
                        <span className="text-sm text-text-secondary">Ainda não registrada</span>
                      )}
                      {isCreator && (
                        <button
                          type="button"
                          onClick={() => setEditingAttendance(true)}
                          className="shrink-0 text-xs font-medium text-text-secondary hover:text-foreground"
                        >
                          {meeting.attendanceRecorded ? "Editar" : "Marcar"}
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-sm font-semibold text-foreground">Presença</p>
                    <p className="text-xs text-text-secondary">
                      Selecione quem participou — sai da lista de pendentes e conta na pontuação.
                    </p>
                    <ul className="-mx-2 space-y-0.5">
                      {(meeting.participanteIds ?? []).map((id) => {
                        const checked = attendanceChecked.includes(id);
                        return (
                          <li key={id}>
                            <button
                              type="button"
                              onClick={() => toggleAttendance(id)}
                              className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-muted/50 ${
                                checked ? "text-foreground" : "text-text-secondary"
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
                      <label className="text-xs font-medium text-text-secondary">
                        Transcrição (opcional)
                      </label>
                      <textarea
                        value={transcricao}
                        onChange={(e) => setTranscricao(e.target.value)}
                        rows={4}
                        placeholder="Cole aqui a transcrição da reunião..."
                        className="mt-1 w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={saveAttendance}>
                        <Check className="h-3.5 w-3.5" /> Salvar presença
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setEditingAttendance(false)}
                      >
                        Cancelar
                      </Button>
                    </div>
                  </div>
                )}
                {meeting.transcricao && !editingAttendance && (
                  <div className="mt-2 rounded-lg bg-muted/40 p-2.5">
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-text-secondary">
                      Transcrição
                    </p>
                    <p className="max-h-32 overflow-y-auto whitespace-pre-wrap break-words text-xs text-foreground">
                      {meeting.transcricao}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Mais detalhes — secundário, fechado por padrão */}
            {hasDetails && (
              <div>
                <button
                  type="button"
                  onClick={() => setDetailsOpen((v) => !v)}
                  className="flex items-center gap-1 text-sm font-medium text-text-secondary hover:text-foreground"
                >
                  Mais detalhes
                  {detailsOpen ? (
                    <ChevronDown className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5" />
                  )}
                </button>
                {detailsOpen && (
                  <div className="mt-2.5 space-y-3 text-sm">
                    {/* Origem e recorrência já aparecem como badges no
                     * cabeçalho — aqui só o que não cabe lá: registro de
                     * sincronização. */}
                    {meeting.syncStatus && (
                      <div>
                        <p className="text-xs text-text-secondary">Sincronização com o Google</p>
                        <p className="text-foreground">
                          {meeting.syncStatus === "error"
                            ? "Falha na última tentativa"
                            : meeting.syncStatus === "pending"
                              ? "Sincronizando…"
                              : "Sincronizada"}
                          {meeting.lastSyncedAt &&
                            ` · última vez ${new Date(meeting.lastSyncedAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}`}
                        </p>
                        {meeting.syncStatus === "error" && meeting.lastSyncError && (
                          <p className="mt-1 text-xs text-danger">{meeting.lastSyncError}</p>
                        )}
                      </div>
                    )}
                    {meeting.meetLink && (
                      <div>
                        <p className="text-xs text-text-secondary">Videoconferência</p>
                        <p className="text-foreground">Google Meet</p>
                      </div>
                    )}
                    {meeting.local && !meeting.meetLink && (
                      <div>
                        <p className="text-xs text-text-secondary">Local / link</p>
                        <p className="break-words text-foreground">{linkifyText(meeting.local)}</p>
                      </div>
                    )}
                    {meeting.notas && (
                      <div>
                        <p className="text-xs text-text-secondary">Pauta</p>
                        <p className="whitespace-pre-wrap break-words text-foreground">
                          {linkifyText(meeting.notas)}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 border-t border-border/60 px-6 py-3.5">
          <div>
            {isCreator && (
              <button
                type="button"
                onClick={() => onDelete(meeting.id)}
                className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs text-danger hover:bg-danger-soft"
              >
                <Trash2 className="h-3.5 w-3.5" /> Excluir
              </button>
            )}
          </div>
          <div className="flex items-center gap-1">
            {isCreator && (
              <button
                type="button"
                onClick={() => onEdit(meeting)}
                className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs text-text-secondary hover:bg-muted hover:text-foreground"
              >
                <Pencil className="h-3.5 w-3.5" /> Editar
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs text-text-secondary hover:bg-muted hover:text-foreground"
            >
              Fechar
            </button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
