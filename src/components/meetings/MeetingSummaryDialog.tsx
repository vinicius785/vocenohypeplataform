import { useEffect, useState } from "react";
import {
  X,
  Trash2,
  Check,
  Pencil,
  CalendarClock,
  LogIn,
  ChevronRight,
  ChevronDown,
  Copy,
  Repeat,
  ExternalLink,
  MoreHorizontal,
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
import {
  canRecordAttendance,
  eligibleAttendeeIds,
  markAllPresent,
  togglePersonAttendance,
  type AttendanceChange,
} from "@/lib/meeting-attendance";
import { loadMembers } from "@/lib/chat-store";
import { linkifyText } from "@/lib/linkify";
import { formatBR, statusDot } from "./meeting-status";
import { joinUrlFor } from "./MeetingLine";
import { loadTeam, type TeamMember } from "./team";
import { MeetingParticipantsSection, type ParticipantCard } from "./MeetingParticipantsSection";
import { MeetingTranscriptSection } from "./MeetingTranscriptSection";

/** Fim (HH:MM) a partir do início + duração — usado só pra exibir
 * "10:00–10:30" numa linha só, nunca pra cálculo de negócio. */
function endTimeLabel(meeting: Meeting): string {
  const end = new Date(meetingStartTime(meeting) + meeting.duracao * 60_000);
  return `${String(end.getHours()).padStart(2, "0")}:${String(end.getMinutes()).padStart(2, "0")}`;
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
  const [team, setTeam] = useState<TeamMember[]>(() => loadTeam());
  const [proposing, setProposing] = useState(false);
  const [propData, setPropData] = useState("");
  const [propHora, setPropHora] = useState("");
  const [propNote, setPropNote] = useState("");
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
    setChangingResponse(false);
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
  const roleOf = (id: string) => loadMembers().find((m) => m.id === id)?.role;
  const attendeeIds = eligibleAttendeeIds(meeting, new Set(team.map((t) => t.id)), me.id);
  const cards: ParticipantCard[] = participantIds.map((id) => ({
    id,
    name: nameFor(id),
    photo: memberFor(id)?.photo,
    sub: [id === meeting.criadorId ? "Organizador" : null, roleOf(id)].filter(Boolean).join(" · "),
    eligible: attendeeIds.includes(id),
  }));
  const externals =
    (meeting.convidadosExternos?.length ?? 0) > 0
      ? meeting.convidadosExternos!.map((g) => `${g.nome} (${g.email})`)
      : participantIds.length === 0 && meeting.com
        ? [meeting.com]
        : [];
  const canRecord = canRecordAttendance(meeting, meetingStartTime(meeting), Date.now());
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
  // Presença: cada ação grava na hora (sem formulário) e registra no ledger de pontuação só quem
  // mudou. O ledger não permite corrigir eventos antigos; quem lê dedup por (reunião, pessoa)
  // tomando o evento mais recente.
  const applyAttendance = ({ meeting: next, changedIds }: AttendanceChange) => {
    onChange({ ...next });
    if (isValidUuid(me.id)) {
      for (const id of changedIds) {
        if (!(meeting.participanteIds ?? []).includes(id)) continue; // regra de XP de antes
        const attended = (next.attendedBy ?? []).includes(id);
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
  };
  const markEveryonePresent = () => {
    const change = markAllPresent(meeting, attendeeIds);
    applyAttendance(change);
    toast.success(`Presença registrada: ${attendeeIds.length} de ${attendeeIds.length} presentes.`);
  };
  const togglePresence = (id: string) =>
    applyAttendance(togglePersonAttendance(meeting, id, attendeeIds));
  const saveTranscript = (text: string) => {
    const clean = text.trim();
    onChange({
      ...meeting,
      transcricao: clean || undefined,
      transcricaoAtualizadaEm: clean ? new Date().toISOString() : undefined,
    });
    toast.success(clean ? "Transcrição salva." : "Transcrição removida.");
  };

  const displayStatus = meetingDisplayStatus(meeting);

  const hasDetails =
    !!meeting.seriesId ||
    meeting.origem === "google" ||
    !!meeting.meetLink ||
    !!meeting.syncStatus ||
    !!meeting.googleEventId;
  const hasAgenda = !!meeting.notas || (!!meeting.local && !meeting.meetLink);
  const cancelled = meeting.status === "Cancelada";
  const showTranscript = !cancelled && (isFinished || !!meeting.transcricao);
  // Pode entrar enquanto a reunião ainda não terminou.
  const canJoin = !!joinUrl && !isFinished && !cancelled;

  const source = meetingSource(meeting);
  const copyLink = () => {
    const link = joinUrl ?? meeting.local;
    if (!link) return;
    void navigator.clipboard.writeText(link).then(
      () => toast.success("Link copiado."),
      () => toast.error("Não foi possível copiar o link."),
    );
  };

  const participants = (
    <MeetingParticipantsSection
      meeting={meeting}
      people={cards}
      externals={externals}
      canEdit={isCreator}
      canRecord={canRecord && !cancelled}
      onMarkAll={markEveryonePresent}
      onToggle={togglePresence}
    />
  );
  const transcript = showTranscript ? (
    <MeetingTranscriptSection meeting={meeting} canEdit={isCreator} onSave={saveTranscript} />
  ) : null;

  const responseBlock = (
    <>
      {/* Sua resposta ao CONVITE — separada da presença (quem confirmou ≠ quem participou) */}
      {showsResponseSection && (
        <section aria-label="Sua resposta">
          {myResponse && !changingResponse ? (
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-text-secondary">Sua resposta ao convite</span>
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
                <span className="text-sm font-medium text-foreground">Você vai?</span>
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
        </section>
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
            <p className="mt-1 text-xs text-text-secondary">{meeting.rescheduleProposal.note}</p>
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
    </>
  );

  return (
    <Sheet open={!!meeting} onOpenChange={(v) => !v && onClose()}>
      <SheetContent
        hideClose
        className="flex h-full w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-[600px]"
      >
        {/* Header fixo — título, data · horário · duração, selos discretos; à direita a ação
            principal (entrar), o menu e o fechar. */}
        <header className="flex items-start gap-3 border-b border-border/60 px-5 pb-4 pt-5 sm:px-6">
          <div className="min-w-0 flex-1">
            <SheetTitle className="break-words text-lg font-semibold leading-tight">
              {meeting.titulo}
            </SheetTitle>
            <SheetDescription className="mt-1 text-sm text-text-secondary">
              {formatBR(meeting.data)} · {meeting.hora}–{endTimeLabel(meeting)} · {meeting.duracao}{" "}
              min
            </SheetDescription>
            <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-text-secondary">
              <span className="inline-flex items-center gap-1.5">
                <span className={`h-1.5 w-1.5 rounded-full ${statusDot(displayStatus)}`} />
                {displayStatus}
              </span>
              {meeting.seriesId && (
                <span className="inline-flex items-center gap-1">
                  <Repeat className="h-3 w-3" /> Recorrente
                </span>
              )}
              {meeting.syncStatus === "error" && (
                <span className="inline-flex items-center gap-1 text-danger">
                  <AlertTriangle className="h-3 w-3" /> Falha na sincronização
                </span>
              )}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {canJoin && (
              <a href={joinUrl!} target="_blank" rel="noreferrer" className="hidden sm:block">
                <Button variant="primary" size="sm">
                  <LogIn className="h-3.5 w-3.5" />
                  {isNow ? "Entrar agora" : "Entrar na reunião"}
                </Button>
              </a>
            )}
            {((joinUrl ?? meeting.local) || meeting.googleHtmlLink) && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Mais ações">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {(joinUrl ?? meeting.local) && (
                    <DropdownMenuItem onSelect={copyLink}>
                      <Copy className="h-3.5 w-3.5" /> Copiar link
                    </DropdownMenuItem>
                  )}
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
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={onClose}
              aria-label="Fechar"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </header>

        {canJoin && (
          <div className="border-b border-border/60 px-5 py-3 sm:hidden">
            <a href={joinUrl!} target="_blank" rel="noreferrer">
              <Button variant="primary" className="w-full">
                <LogIn className="h-4 w-4" />
                {isNow ? "Entrar agora" : "Entrar na reunião"}
              </Button>
            </a>
          </div>
        )}

        {/* Único scroll da tela: header e rodapé ficam fixos. */}
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5 sm:px-6">
          {responseBlock}
          {participants}

          {hasAgenda && (
            <section aria-label="Pauta" className="space-y-1">
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
                Pauta
              </h3>
              {meeting.notas && (
                <p className="whitespace-pre-wrap break-words text-sm text-foreground">
                  {linkifyText(meeting.notas)}
                </p>
              )}
              {meeting.local && !meeting.meetLink && (
                <p className="break-words text-sm text-text-secondary">
                  Local / link: {linkifyText(meeting.local)}
                </p>
              )}
            </section>
          )}

          {transcript}

          {/* Detalhes — só o secundário/técnico, fechado por padrão */}
          {hasDetails && (
            <section aria-label="Detalhes">
              <button
                type="button"
                onClick={() => setDetailsOpen((v) => !v)}
                aria-expanded={detailsOpen}
                className="flex items-center gap-1 text-sm font-medium text-text-secondary hover:text-foreground"
              >
                Detalhes
                {detailsOpen ? (
                  <ChevronDown className="h-3.5 w-3.5" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5" />
                )}
              </button>
              {detailsOpen && (
                <dl className="mt-2.5 space-y-3 text-sm">
                  {source === "google" && (
                    <div>
                      <dt className="text-xs text-text-secondary">Origem</dt>
                      <dd className="text-foreground">Google Calendar</dd>
                    </div>
                  )}
                  {meeting.syncStatus && (
                    <div>
                      <dt className="text-xs text-text-secondary">Sincronização com o Google</dt>
                      <dd className="text-foreground">
                        {meeting.syncStatus === "error"
                          ? "Falha na última tentativa"
                          : meeting.syncStatus === "pending"
                            ? "Sincronizando…"
                            : "Sincronizada"}
                        {meeting.lastSyncedAt &&
                          ` · última vez ${new Date(meeting.lastSyncedAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}`}
                        {meeting.syncStatus === "error" && meeting.lastSyncError && (
                          <span className="mt-1 block text-xs text-danger">
                            {meeting.lastSyncError}
                          </span>
                        )}
                      </dd>
                    </div>
                  )}
                  {meeting.meetLink && (
                    <div>
                      <dt className="text-xs text-text-secondary">Videoconferência</dt>
                      <dd className="text-foreground">Google Meet</dd>
                    </div>
                  )}
                  {meeting.seriesId && (
                    <div>
                      <dt className="text-xs text-text-secondary">Recorrência</dt>
                      <dd className="text-foreground">
                        Esta reunião faz parte de uma série. Presença e resposta valem só para esta
                        data.
                      </dd>
                    </div>
                  )}
                  {meeting.criadorId && (
                    <div>
                      <dt className="text-xs text-text-secondary">Criada por</dt>
                      <dd className="text-foreground">{nameFor(meeting.criadorId)}</dd>
                    </div>
                  )}
                </dl>
              )}
            </section>
          )}
        </div>

        {/* Rodapé fixo: só ações administrativas */}
        <footer className="flex items-center justify-between gap-2 border-t border-border/60 px-5 py-3.5 sm:px-6">
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
          </div>
        </footer>
      </SheetContent>
    </Sheet>
  );
}
