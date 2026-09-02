import { LogIn } from "lucide-react";
import type { Meeting } from "@/lib/reunioes-store";
import { meetingDisplayStatus, meetingStartTime, meetingEndTime } from "@/lib/reunioes-store";
import { statusTone, statusDot } from "./meeting-status";
import { AvatarStack, type AvatarPerson } from "./AvatarStack";

const URL_RE = /^https?:\/\//;

type TeamMember = { id: string; name: string; photo?: string };

/** Monta a lista de participantes pra exibir (avatares/nomes): criador +
 * membros internos + convidados externos, sem duplicar quem já é `me`. */
export function peopleFor(
  m: Meeting,
  team: TeamMember[],
  me: { id: string; name: string },
): AvatarPerson[] {
  const ids = Array.from(
    new Set([...(m.criadorId ? [m.criadorId] : []), ...(m.participanteIds ?? [])]),
  );
  const fromIds = ids.map((id) => {
    if (id === me.id) return { id, name: me.name };
    const t = team.find((x) => x.id === id);
    return { id, name: t?.name ?? id, photo: t?.photo };
  });
  const fromGuests = (m.convidadosExternos ?? []).map((g) => ({ id: g.email, name: g.nome }));
  return [...fromIds, ...fromGuests];
}

/** Link de entrada de uma reunião — prioriza o Meet gerado automaticamente;
 * se não houver, aceita `local` quando ele próprio já é uma URL. */
export function joinUrlFor(m: Meeting): string | null {
  if (m.meetLink) return m.meetLink;
  if (m.local && URL_RE.test(m.local.trim())) return m.local.trim();
  return null;
}

/** Linha compacta de uma reunião — usada na Agenda (Hoje/Próximos dias) e
 * no painel do dia do Calendário. Uma única linha, sem cards grandes:
 * hora, título, avatares, badge de status, e "Entrar" só quando relevante
 * (hover, ou reunião em andamento/prestes a começar). */
export function MeetingLine({
  meeting,
  people,
  onOpen,
  dimmed = false,
}: {
  meeting: Meeting;
  people: AvatarPerson[];
  onOpen: () => void;
  /** Reunião já encerrada — menor contraste, sem deixar de ser legível. */
  dimmed?: boolean;
}) {
  const status = meetingDisplayStatus(meeting);
  const start = meetingStartTime(meeting);
  const end = meetingEndTime(meeting);
  const now = Date.now();
  const isNow = now >= start && now <= end;
  const isSoon = !isNow && start - now <= 15 * 60_000 && start - now > -60_000;
  const url = joinUrlFor(meeting);

  return (
    <li>
      <div
        className={`group flex items-center gap-3 rounded-lg px-2.5 py-2 transition-colors hover:bg-muted/50 ${
          dimmed ? "opacity-55" : ""
        }`}
      >
        <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3">
          <span className="w-12 shrink-0 text-sm font-medium tabular-nums text-foreground">
            {meeting.hora}
          </span>
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${statusDot(status)}`} />
          <span className="min-w-0 flex-1 truncate text-left text-sm text-foreground">
            {meeting.titulo}
          </span>
          <AvatarStack people={people} max={3} />
          <span
            className={`hidden shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium sm:inline ${statusTone(status)}`}
          >
            {status}
          </span>
        </button>
        {url && (isNow || isSoon) && (
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-opacity ${
              isNow
                ? "bg-emerald-500/15 text-emerald-700 opacity-100 dark:text-emerald-400"
                : "bg-foreground text-background opacity-0 group-hover:opacity-100"
            }`}
          >
            <LogIn className="h-3 w-3" /> {isNow ? "Entrar agora" : "Entrar"}
          </a>
        )}
      </div>
    </li>
  );
}
