import { useEffect, useState } from "react";
import {
  X,
  Check,
  CalendarClock,
  LogIn,
  ChevronRight,
  ChevronDown,
  Copy,
  Repeat,
  ExternalLink,
  MoreHorizontal,
  AlertTriangle,
  Pencil,
  Trash2,
  Ban,
} from "lucide-react";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { DateField } from "@/components/ui/date-field";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  type Meeting,
  type RescheduleProposal,
  meetingStartTime,
  meetingSource,
} from "@/lib/reunioes-store";
import { toast } from "sonner";
import { useConfirm } from "@/hooks/use-confirm";
import { recordPerformanceEvent } from "@/lib/performance-events-store";
import { xpForMeeting, DEFAULT_PERFORMANCE_SETTINGS, isValidUuid } from "@/lib/performance-engine";
import {
  eligibleAttendeeIds,
  markAllPresent,
  setPersonAttendance,
  type AttendanceChange,
} from "@/lib/meeting-attendance";
import { LIFECYCLE_LABEL, detailPlan, type MeetingLifecycle } from "@/lib/meeting-detail";
import { loadMembers } from "@/lib/chat-store";
import { linkifyText } from "@/lib/linkify";
import { formatBR } from "./meeting-status";
import { joinUrlFor } from "./MeetingLine";
import { loadTeam, type TeamMember } from "./team";
import { MeetingParticipantsSection, type ParticipantCard } from "./MeetingParticipantsSection";
import { MeetingTranscriptSection } from "./MeetingTranscriptSection";
import { MeetingResultSection } from "./MeetingResultSection";

/** Fim (HH:MM) a partir do início + duração — usado só pra exibir
 * "10:00–10:30" numa linha só, nunca pra cálculo de negócio. */
function endTimeLabel(meeting: Meeting): string {
  const end = new Date(meetingStartTime(meeting) + meeting.duracao * 60_000);
  return `${String(end.getHours()).padStart(2, "0")}:${String(end.getMinutes()).padStart(2, "0")}`;
}

const LIFECYCLE_DOT: Record<MeetingLifecycle, string> = {
  agendada: "bg-sky-500",
  em_andamento: "bg-emerald-500",
  realizada: "bg-muted-foreground/60",
  cancelada: "bg-red-500",
};

function SectionTitle({ children }: { children: string }) {
  return (
    <h3 className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
      {children}
    </h3>
  );
}

export function MeetingSummaryDialog({
  meeting,
  me,
  initialProposing = false,
  onClose,
  onEdit,
  onDuplicate,
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
  /** Sem este callback o item "Duplicar" não aparece. */
  onDuplicate?: (m: Meeting) => void;
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
  // ação ficam escondidos atrás de "Alterar" — reduz o ruído do modal.
  const [changingResponse, setChangingResponse] = useState(false);
  const { confirm: confirmAction, confirmDialog } = useConfirm();

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
  const joinUrl = joinUrlFor(meeting);
  const roleOf = (id: string) => loadMembers().find((m) => m.id === id)?.role;
  const attendeeIds = eligibleAttendeeIds(meeting, new Set(team.map((t) => t.id)), me.id);
  const nowMs = Date.now();
  const plan = detailPlan(meeting, { nowMs, isCreator, hasJoinUrl: !!joinUrl });
  const lifecycle = plan.lifecycle;
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
  const myResponse = confirmedBy.includes(me.id)
    ? "confirmed"
    : declinedBy.includes(me.id)
      ? "declined"
      : null;
  // "Sua resposta" (convite) só existe enquanto a reunião ainda pode ser respondida e quando há
  // fluxo de convite (reunião do Google não tem).
  const showsResponseSection =
    plan.showInvite && isParticipant && (lifecycle === "agendada" || lifecycle === "em_andamento");

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
  const setAttendance = (id: string, next: "present" | "absent") =>
    applyAttendance(setPersonAttendance(meeting, id, next, attendeeIds));
  const saveTranscript = (text: string) => {
    const clean = text.trim();
    onChange({
      ...meeting,
      transcricao: clean || undefined,
      transcricaoAtualizadaEm: clean ? new Date().toISOString() : undefined,
    });
    toast.success(clean ? "Transcrição salva." : "Transcrição removida.");
  };

  const cancelMeeting = async () => {
    const yes = await confirmAction(
      "A reunião será marcada como cancelada para todos. Se estiver sincronizada com o Google Calendar, o evento é removido de lá.",
      { title: "Cancelar reunião?", confirmLabel: "Cancelar reunião", destructive: true },
    );
    if (!yes) return;
    onChange({ ...meeting, status: "Cancelada" });
    toast.success("Reunião cancelada.");
  };
  const saveResult = (resumo: string | undefined, proximosPassos: string[]) => {
    onChange({
      ...meeting,
      resumo,
      proximosPassos: proximosPassos.length > 0 ? proximosPassos : undefined,
    });
    toast.success("Resultado salvo.");
  };

  const hasDetails =
    !!meeting.seriesId ||
    meeting.origem === "google" ||
    !!meeting.syncStatus ||
    !!meeting.googleEventId ||
    !!meeting.criadorId;
  const source = meetingSource(meeting);
  const copyLink = () => {
    const link = joinUrl ?? meeting.local;
    if (!link) return;
    void navigator.clipboard.writeText(link).then(
      () => toast.success("Link copiado."),
      () => toast.error("Não foi possível copiar o link."),
    );
  };
  const hasPlace = !!joinUrl || !!meeting.local?.trim();
  const linkLabel = meeting.meetLink ? "Google Meet" : joinUrl ? "Link da reunião" : "Local";
  const linkText = (joinUrl ?? meeting.local).replace(/^https?:\/\//, "");

  const sections: Record<string, React.ReactNode> = {
    participantes: (
      <MeetingParticipantsSection
        key="participantes"
        meeting={meeting}
        people={cards}
        externals={externals}
        presenceAvailable={plan.presenceAvailable}
        presenceHint={lifecycle === "agendada"}
        canEdit={plan.presenceEditable}
        showInvite={plan.showInvite}
        onMarkAll={markEveryonePresent}
        onSet={setAttendance}
      />
    ),
    transcricao: plan.showTranscript ? (
      <MeetingTranscriptSection
        key="transcricao"
        meeting={meeting}
        canEdit={plan.canEditTranscript}
        onSave={saveTranscript}
      />
    ) : null,
    resultado: plan.showResult ? (
      <MeetingResultSection
        key="resultado"
        meeting={meeting}
        canEdit={plan.canEditResult}
        onSave={saveResult}
      />
    ) : null,
    reuniao: hasPlace ? (
      <section key="reuniao" aria-label="Reunião" className="space-y-1.5">
        <SectionTitle>Reunião</SectionTitle>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">{linkLabel}</p>
            {joinUrl ? (
              <a
                href={joinUrl}
                target="_blank"
                rel="noreferrer"
                className="block max-w-full truncate text-xs text-text-secondary hover:text-foreground hover:underline"
              >
                {linkText}
              </a>
            ) : (
              <p className="break-words text-xs text-text-secondary">
                {linkifyText(meeting.local)}
              </p>
            )}
          </div>
          <Button variant="ghost" size="sm" onClick={copyLink}>
            <Copy className="h-3.5 w-3.5" /> Copiar
          </Button>
        </div>
      </section>
    ) : null,
    pauta: plan.showAgenda ? (
      <section key="pauta" aria-label="Pauta" className="space-y-1.5">
        <SectionTitle>Pauta</SectionTitle>
        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
          {linkifyText(meeting.notas!)}
        </p>
      </section>
    ) : null,
  };

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
        {/* Cabeçalho: título, quando, ESTADO DA REUNIÃO (derivado) e a ação principal. */}
        <header className="space-y-3 border-b border-border/60 px-5 pb-4 pt-5 sm:px-6">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <SheetTitle className="break-words text-lg font-semibold leading-tight">
                {meeting.titulo}
              </SheetTitle>
              <SheetDescription className="mt-1 text-sm text-text-secondary">
                {formatBR(meeting.data)} · {meeting.hora}–{endTimeLabel(meeting)} ·{" "}
                {meeting.duracao} min
              </SheetDescription>
              <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-text-secondary">
                <span className="inline-flex items-center gap-1.5 text-foreground">
                  <span className={`h-1.5 w-1.5 rounded-full ${LIFECYCLE_DOT[lifecycle]}`} />
                  {LIFECYCLE_LABEL[lifecycle]}
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
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Mais ações">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  {isCreator && (
                    <DropdownMenuItem onSelect={() => onEdit(meeting)}>
                      <Pencil className="h-3.5 w-3.5" /> Editar
                    </DropdownMenuItem>
                  )}
                  {isCreator && onDuplicate && (
                    <DropdownMenuItem onSelect={() => onDuplicate(meeting)}>
                      <Copy className="h-3.5 w-3.5" /> Duplicar
                    </DropdownMenuItem>
                  )}
                  {(joinUrl ?? meeting.local)?.trim() && (
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
                  {plan.canCancel && (
                    <DropdownMenuItem onSelect={() => void cancelMeeting()}>
                      <Ban className="h-3.5 w-3.5" /> Cancelar reunião
                    </DropdownMenuItem>
                  )}
                  {isCreator && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onSelect={() => onDelete(meeting.id)}
                        className="text-danger focus:text-danger"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Excluir
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
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
          </div>
          {plan.showJoin && (
            <a href={joinUrl!} target="_blank" rel="noreferrer" className="block sm:inline-block">
              <Button variant="primary" className="w-full sm:w-auto">
                <LogIn className="h-4 w-4" />
                {lifecycle === "em_andamento" ? "Entrar agora" : "Entrar na reunião"}
              </Button>
            </a>
          )}
        </header>

        {/* Página única (sem abas): a ordem das seções acompanha o ciclo de vida da reunião. */}
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5 sm:px-6">
          {responseBlock}
          {plan.order.map((key) => sections[key])}

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
                  <div>
                    <dt className="text-xs text-text-secondary">Origem</dt>
                    <dd className="text-foreground">
                      {source === "google" ? "Google Calendar" : "Criada na plataforma"}
                    </dd>
                  </div>
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
                  {meeting.seriesId && (
                    <div>
                      <dt className="text-xs text-text-secondary">Recorrência</dt>
                      <dd className="text-foreground">
                        Esta reunião faz parte de uma série. Presença, resposta e resultado valem só
                        para esta data.
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
        {confirmDialog}
      </SheetContent>
    </Sheet>
  );
}
