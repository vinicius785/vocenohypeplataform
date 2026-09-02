import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { LogIn, Video, X } from "lucide-react";
import {
  loadMeetings,
  saveMeetings,
  onMeetingsChange,
  meetingStartTime,
  meetingEndTime,
  confirmMeetingFor,
  declineMeetingFor,
  type Meeting,
} from "@/lib/reunioes-store";
import { getMe, playMeetingReminderSound } from "@/lib/chat-store";
import { Button } from "@/components/ui/button";
import { AvatarStack } from "@/components/meetings/AvatarStack";
import { peopleFor, joinUrlFor } from "@/components/meetings/MeetingLine";
import { participantBadge } from "@/components/meetings/meeting-status";
import { loadTeam, type TeamMember } from "@/components/meetings/team";
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

function endTimeLabel(m: Meeting): string {
  const end = new Date(meetingStartTime(m) + m.duracao * 60_000);
  return `${String(end.getHours()).padStart(2, "0")}:${String(end.getMinutes()).padStart(2, "0")}`;
}

/** Contagem regressiva textual — mesmo card, só o texto muda conforme o
 * tempo passa (não gera notificação nova a cada minuto). */
function countdownLabel(m: Meeting, now: number): string {
  const start = meetingStartTime(m);
  const diffMs = start - now;
  if (diffMs > 0) {
    const min = Math.max(1, Math.round(diffMs / 60_000));
    return min === 1 ? "Em 1 minuto" : `Em ${min} minutos`;
  }
  if (now <= meetingEndTime(m)) return "Começando agora";
  const minSince = Math.max(1, Math.round((now - start) / 60_000));
  return `Começou há ${minSince} min`;
}

function namesLabel(people: { name: string }[]): string {
  if (people.length === 0) return "";
  const firstNames = people.slice(0, 2).map((p) => p.name.split(" ")[0]);
  const rest = people.length - firstNames.length;
  return rest > 0 ? `${firstNames.join(", ")} +${rest}` : firstNames.join(", ");
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
  const myStatus = meeting.confirmedBy?.includes(me.id)
    ? "confirmed"
    : meeting.declinedBy?.includes(me.id)
      ? "declined"
      : "pending";
  const myStatusLabel =
    myStatus === "confirmed" ? "Confirmado" : myStatus === "declined" ? "Recusado" : "Pendente";

  return (
    <>
      <div className="fixed bottom-24 right-4 z-[190] w-full max-w-[420px]">
        <div className="rounded-2xl border border-border bg-background p-4 shadow-xl">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Video className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold leading-tight text-foreground">
                {meeting.titulo}
              </p>
              <p className="mt-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                {countdownLabel(meeting, now)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => dismiss(meeting.id)}
              className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Dispensar"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="mt-3 flex items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              {meeting.hora} — {endTimeLabel(meeting)}
            </p>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${participantBadge(myStatus)}`}
            >
              {myStatusLabel}
            </span>
          </div>

          {people.length > 0 && (
            <div className="mt-2 flex items-center gap-2">
              <AvatarStack people={people} max={3} />
              <span className="truncate text-xs text-muted-foreground">{namesLabel(people)}</span>
            </div>
          )}

          <div className="mt-3 flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="flex-1"
              onClick={() => {
                setSummaryMeeting(meeting);
                dismiss(meeting.id);
              }}
            >
              Ver detalhes
            </Button>
            {joinUrl && (
              <a
                href={joinUrl}
                target="_blank"
                rel="noreferrer"
                className="flex-1"
                onClick={() => dismiss(meeting.id)}
              >
                <Button size="sm" className="w-full">
                  <LogIn className="h-3.5 w-3.5" /> Entrar na reunião
                </Button>
              </a>
            )}
          </div>

          {queue.length > 1 && (
            <button
              type="button"
              onClick={() => setActiveIndex((i) => (i + 1) % queue.length)}
              className="mt-2.5 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              +{queue.length - 1} reunião{queue.length - 1 === 1 ? "" : "ões"} próxima
              {queue.length - 1 === 1 ? "" : "s"}
            </button>
          )}
        </div>
      </div>

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
