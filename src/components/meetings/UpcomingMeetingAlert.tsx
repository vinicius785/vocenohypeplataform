import { createPortal } from "react-dom";
import { Bell, Video, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { AvatarStack, type AvatarPerson } from "@/components/meetings/AvatarStack";
import { meetingStartTime, meetingEndTime, type Meeting } from "@/lib/reunioes-store";
import type { SemanticTone } from "@/lib/design-tokens";

export type ParticipantState = "confirmed" | "declined" | "pending";

const PARTICIPANT_STATE_META: Record<ParticipantState, { label: string; tone: SemanticTone }> = {
  confirmed: { label: "Confirmada", tone: "success" },
  declined: { label: "Recusada", tone: "danger" },
  pending: { label: "Pendente", tone: "warning" },
};

/** Rótulo + tom do badge de urgência — única fonte da contagem
 * regressiva (não repete "em N minutos" em mais nenhum outro lugar do
 * card). A janela em que o aviso É DISPARADO continua sendo os 5 minutos
 * de sempre (`MeetingReminderToast.tsx`); esta função só formata o tempo
 * restante enquanto o card já está na tela, então na prática as faixas
 * "Em 15 min"/"Em 10 min" não chegam a aparecer com a janela atual — a
 * lógica fica pronta e correta para as duas faixas mesmo assim. */
export function meetingUrgency(m: Meeting, now: number): { label: string; tone: SemanticTone } {
  const start = meetingStartTime(m);
  const end = meetingEndTime(m);
  const diffMs = start - now;
  if (diffMs > 5 * 60_000) {
    const min = Math.round(diffMs / 60_000);
    return { label: `Em ${min} min`, tone: "info" };
  }
  if (diffMs > 0) {
    const min = Math.max(1, Math.round(diffMs / 60_000));
    return { label: `Em ${min} min`, tone: "warning" };
  }
  if (now <= end) return { label: "Começando agora", tone: "brand" };
  return { label: "Em andamento", tone: "neutral" };
}

function timeRangeLabel(m: Meeting): string {
  const end = new Date(meetingEndTime(m));
  const endLabel = `${String(end.getHours()).padStart(2, "0")}:${String(end.getMinutes()).padStart(2, "0")}`;
  const hours = Math.floor(m.duracao / 60);
  const minutes = m.duracao % 60;
  const duration = hours > 0 ? `${hours}h${minutes ? `${minutes}min` : ""}` : `${minutes}min`;
  return `${m.hora} – ${endLabel} · ${duration}`;
}

/**
 * Card de aviso "reunião prestes a começar", estilo padrão de
 * alerta/notificação da plataforma (sem identidade/persona) —
 * puramente apresentacional: quem dispara/deduplica/agenda é
 * `MeetingReminderToast.tsx`, que também é quem monta este componente.
 * Renderiza em Portal direto em `document.body` pra nunca ser cortado
 * por um container com `overflow` no meio do caminho, com `z-40`
 * (abaixo de qualquer Sheet/Dialog/Popover/DropdownMenu, todos `z-50`,
 * e acima do conteúdo normal da página).
 */
export function UpcomingMeetingAlert({
  meeting,
  now,
  people,
  joinUrl,
  participantState,
  queueExtraCount,
  onCycleQueue,
  onClose,
  onViewDetails,
  onJoin,
}: {
  meeting: Meeting;
  now: number;
  people: AvatarPerson[];
  joinUrl: string | null;
  participantState: ParticipantState;
  queueExtraCount: number;
  onCycleQueue: () => void;
  onClose: () => void;
  onViewDetails: () => void;
  onJoin: () => void;
}) {
  const urgency = meetingUrgency(meeting, now);
  const statusMeta = PARTICIPANT_STATE_META[participantState];
  const namesToShow = people.slice(0, 2).map((p) => p.name.split(" ")[0]);
  const restCount = people.length - namesToShow.length;
  const namesLabel =
    people.length === 0
      ? ""
      : restCount > 0
        ? `${namesToShow.join(", ")} +${restCount}`
        : namesToShow.join(", ");

  return createPortal(
    <div
      role="alertdialog"
      aria-label={`Reunião "${meeting.titulo}" ${urgency.label.toLowerCase()}`}
      className="fixed inset-x-3 bottom-3 z-40 sm:inset-x-auto sm:bottom-6 sm:right-6 sm:[width:min(400px,calc(100vw-32px))] [padding-bottom:env(safe-area-inset-bottom)]"
    >
      <div className="relative animate-in fade-in slide-in-from-bottom-2 overflow-hidden rounded-2xl border border-border/60 bg-card p-4 shadow-xl duration-300 motion-reduce:animate-none sm:slide-in-from-bottom-0 sm:slide-in-from-right-4 sm:p-5">
        <div className="relative flex items-start gap-3">
          <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-subtle ring-2 ring-card sm:h-10 sm:w-10">
            <Bell className="h-4 w-4 text-brand" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1 pt-0.5">
            <p className="text-xs font-semibold text-foreground">Reunião em breve</p>
            <p className="mt-1 text-xs text-muted-foreground">Sua reunião começa em breve</p>
          </div>
          <IconButton
            label="Fechar aviso de reunião"
            onClick={onClose}
            className="shrink-0 -mr-1 -mt-1"
          >
            <X className="h-4 w-4" />
          </IconButton>
        </div>

        <div className="relative mt-3 flex items-start justify-between gap-2">
          <p className="line-clamp-2 min-w-0 flex-1 text-sm font-semibold leading-snug text-foreground">
            {meeting.titulo}
          </p>
          <Badge
            variant={urgency.tone === "neutral" ? "secondary" : urgency.tone}
            className="shrink-0"
          >
            {urgency.label}
          </Badge>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{timeRangeLabel(meeting)}</p>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          {people.length > 0 ? (
            <div className="flex min-w-0 items-center gap-2">
              <AvatarStack people={people} max={3} />
              <span className="hidden truncate text-xs text-muted-foreground sm:inline">
                {namesLabel}
              </span>
            </div>
          ) : (
            <span />
          )}
          <Badge
            variant={statusMeta.tone === "neutral" ? "secondary" : statusMeta.tone}
            className="shrink-0"
          >
            {statusMeta.label}
          </Badge>
        </div>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          {joinUrl ? (
            <>
              <Button size="comfortable" className="order-1 flex-1 sm:order-2" onClick={onJoin}>
                <Video className="h-4 w-4" />
                Entrar na reunião
              </Button>
              <Button
                size="comfortable"
                variant="outline"
                className="order-2 flex-1 sm:order-1"
                onClick={onViewDetails}
              >
                Ver detalhes
              </Button>
            </>
          ) : (
            <Button size="comfortable" variant="primary" className="flex-1" onClick={onViewDetails}>
              Ver detalhes
            </Button>
          )}
        </div>

        {queueExtraCount > 0 && (
          <button
            type="button"
            onClick={onCycleQueue}
            className="mt-3 text-xs font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1 focus-visible:ring-offset-card rounded"
          >
            +{queueExtraCount} reunião{queueExtraCount === 1 ? "" : "ões"} próxima
            {queueExtraCount === 1 ? "" : "s"}
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}
