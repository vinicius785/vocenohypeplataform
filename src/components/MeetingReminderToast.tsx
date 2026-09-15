import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  loadMeetings,
  saveMeetings,
  onMeetingsChange,
  meetingStartTime,
  confirmMeetingFor,
  declineMeetingFor,
  type Meeting,
} from "@/lib/reunioes-store";
import { getMe, playMeetingReminderSound } from "@/lib/chat-store";
import { peopleFor, joinUrlFor } from "@/components/meetings/MeetingLine";
import { loadTeam, type TeamMember } from "@/components/meetings/team";
import {
  UpcomingMeetingAlert,
  type ParticipantState,
} from "@/components/meetings/UpcomingMeetingAlert";
// Importa direto do componente (não do barrel `ReunioesSection`) — esse
// arquivo é montado globalmente no AppShell, em toda página; importar via
// `ReunioesSection` puxaria CalendarView/DisponibilidadeTab/MeetingDialog
// juntos pro bundle inicial, anulando o code-splitting por rota que
// `time.tsx` já faz com `lazy()` pra essa seção.
import { MeetingSummaryDialog } from "@/components/meetings/MeetingSummaryDialog";
import type { SectionKey } from "@/components/AppShell";

const SEEN_KEY = "notif:seenMeetingReminders";
const WINDOW_MS = 5 * 60_000;
const CHECK_INTERVAL_MS = 15_000;
// Depois disso, o card some sozinho mesmo se ninguém interagir — não é
// mais "prestes a começar", só ruído se continuar preso na tela.
const AUTO_DISMISS_AFTER_START_MS = 10 * 60_000;

function readSeen(): Set<string> {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}
function writeSeen(ids: Set<string>) {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(Array.from(ids)));
  } catch {
    /* ignore */
  }
}

/**
 * Aviso "reunião em 5 minutos" — mesmo som/janela/dedupe de sempre (uma
 * vez por reunião, checando a cada 15s pra não depender de a aba estar
 * em foco no segundo exato em que a janela de 5min abre), mas agora um
 * mini card da reunião (avatares, horário, status, Entrar/Ver detalhes)
 * em vez de um toast de metadata — consome os mesmos dados/helpers já
 * usados na Agenda/Calendário, pra nunca ficar inconsistente com eles.
 */
export function MeetingReminderToast() {
  const navigate = useNavigate();
  const me = getMe();
  const [meetings, setMeetings] = useState<Meeting[]>(() => loadMeetings());
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [queue, setQueue] = useState<Meeting[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [summaryMeeting, setSummaryMeeting] = useState<Meeting | null>(null);

  useEffect(() => {
    setTeam(loadTeam());
    const refresh = () => setMeetings(loadMeetings());
    refresh();
    return onMeetingsChange(refresh);
  }, []);

  useEffect(() => {
    const check = () => {
      const nowMs = Date.now();
      setNow(nowMs);
      const seen = readSeen();
      let changed = false;
      const toShow: Meeting[] = [];
      for (const m of meetings) {
        if (m.status === "Cancelada") continue;
        const isInvited = m.criadorId === me.id || m.participanteIds?.includes(me.id);
        if (!isInvited) continue;
        if (seen.has(m.id)) continue;
        const msUntil = meetingStartTime(m) - nowMs;
        if (msUntil > 0 && msUntil <= WINDOW_MS) {
          seen.add(m.id);
          changed = true;
          toShow.push(m);
        }
      }
      if (changed) {
        writeSeen(seen);
        setQueue((q) =>
          [...q, ...toShow].sort((a, b) => meetingStartTime(a) - meetingStartTime(b)),
        );
        playMeetingReminderSound();
      }
      // Auto-dispensa reuniões antigas demais da fila — não some da tela
      // por causa do dedupe (isso é permanente), só não fica presa lá.
      setQueue((q) => q.filter((m) => nowMs - meetingStartTime(m) < AUTO_DISMISS_AFTER_START_MS));
    };
    check();
    const iv = window.setInterval(check, CHECK_INTERVAL_MS);
    return () => window.clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetings]);

  useEffect(() => {
    if (activeIndex >= queue.length) setActiveIndex(0);
  }, [queue, activeIndex]);

  const dismiss = (id: string) => setQueue((q) => q.filter((m) => m.id !== id));

  if (queue.length === 0) return null;
  const meeting = queue[Math.min(activeIndex, queue.length - 1)];
  const people = peopleFor(meeting, team, me);
  const joinUrl = joinUrlFor(meeting);
  const participantState: ParticipantState = meeting.confirmedBy?.includes(me.id)
    ? "confirmed"
    : meeting.declinedBy?.includes(me.id)
      ? "declined"
      : "pending";

  return (
    <>
      {/* z-40 (não mais z-190): fica acima do conteúdo normal da página mas
       * abaixo de qualquer Sheet/Dialog/AlertDialog/DropdownMenu/Popover
       * (todos z-50) — antes o card cobria o rodapé de drawers/diálogos
       * abertos em qualquer módulo. Nenhuma lógica de exibição/dedupe
       * mudou; a apresentação em si foi extraída pro componente
       * reutilizável `UpcomingMeetingAlert`, que renderiza em Portal
       * direto em `document.body` (nunca cortado por overflow de algum
       * container no meio do caminho). */}
      <UpcomingMeetingAlert
        meeting={meeting}
        now={now}
        people={people}
        joinUrl={joinUrl}
        participantState={participantState}
        queueExtraCount={queue.length - 1}
        onCycleQueue={() => setActiveIndex((i) => (i + 1) % queue.length)}
        onClose={() => dismiss(meeting.id)}
        onViewDetails={() => {
          setSummaryMeeting(meeting);
          dismiss(meeting.id);
        }}
        onJoin={() => {
          if (joinUrl) window.open(joinUrl, "_blank", "noopener,noreferrer");
          dismiss(meeting.id);
        }}
      />

      <MeetingSummaryDialog
        meeting={summaryMeeting}
        me={me}
        onClose={() => setSummaryMeeting(null)}
        onEdit={() => {
          setSummaryMeeting(null);
          void navigate({ to: "/time", search: { section: "reunioes" as SectionKey } });
        }}
        onChange={(m) => {
          const next = meetings.map((x) => (x.id === m.id ? m : x));
          setMeetings(next);
          saveMeetings(next);
        }}
        onConfirm={(m) => {
          const next = meetings.map((x) => (x.id === m.id ? confirmMeetingFor(x, me.id) : x));
          setMeetings(next);
          saveMeetings(next);
        }}
        onDecline={(m) => {
          const next = meetings.map((x) => (x.id === m.id ? declineMeetingFor(x, me.id) : x));
          setMeetings(next);
          saveMeetings(next);
        }}
        onDelete={(id) => {
          const next = meetings.filter((x) => x.id !== id);
          setMeetings(next);
          saveMeetings(next);
          setSummaryMeeting(null);
        }}
      />
    </>
  );
}
