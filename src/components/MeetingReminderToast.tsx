import { useEffect, useState } from "react";
import { CalendarClock, X } from "lucide-react";
import {
  loadMeetings,
  onMeetingsChange,
  meetingStartTime,
  type Meeting,
} from "@/lib/reunioes-store";
import { getMe, playMeetingReminderSound } from "@/lib/chat-store";

const SEEN_KEY = "notif:seenMeetingReminders";
const WINDOW_MS = 5 * 60_000;
const CHECK_INTERVAL_MS = 15_000;

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
 * Aviso "reunião em 5 minutos" — som diferente do de mensagem/lead + um
 * card fixo no canto inferior direito, pra quem está convidado (ou criou)
 * a reunião. Dispara uma vez por reunião (seen-set), verificando a cada
 * 15s pra não depender de o usuário estar com a aba em foco no segundo
 * exato em que a janela de 5min abre.
 */
export function MeetingReminderToast() {
  const [meetings, setMeetings] = useState<Meeting[]>(() => loadMeetings());
  const [queue, setQueue] = useState<Meeting[]>([]);

  useEffect(() => {
    const refresh = () => setMeetings(loadMeetings());
    refresh();
    return onMeetingsChange(refresh);
  }, []);

  useEffect(() => {
    const check = () => {
      const me = getMe();
      const now = Date.now();
      const seen = readSeen();
      let changed = false;
      const toShow: Meeting[] = [];
      for (const m of meetings) {
        if (m.status === "Cancelada") continue;
        const isInvited = m.criadorId === me.id || m.participanteIds?.includes(me.id);
        if (!isInvited) continue;
        if (seen.has(m.id)) continue;
        const msUntil = meetingStartTime(m) - now;
        if (msUntil > 0 && msUntil <= WINDOW_MS) {
          seen.add(m.id);
          changed = true;
          toShow.push(m);
        }
      }
      if (changed) {
        writeSeen(seen);
        setQueue((q) => [...q, ...toShow]);
        playMeetingReminderSound();
      }
    };
    check();
    const iv = window.setInterval(check, CHECK_INTERVAL_MS);
    return () => window.clearInterval(iv);
  }, [meetings]);

  const dismiss = (id: string) => setQueue((q) => q.filter((m) => m.id !== id));

  if (queue.length === 0) return null;

  return (
    <div className="fixed bottom-24 right-4 z-[190] flex w-full max-w-sm flex-col gap-2">
      {queue.map((m) => (
        <div
          key={m.id}
          className="rounded-xl border border-amber-500/30 bg-background p-4 shadow-xl"
        >
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400">
              <CalendarClock className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">Reunião em 5 minutos</p>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">{m.titulo}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {m.hora}
                {m.local ? ` · ${m.local}` : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={() => dismiss(m.id)}
              className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Dispensar"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
