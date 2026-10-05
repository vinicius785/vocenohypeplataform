import { useState } from "react";
import { Check, CheckCheck, ChevronDown, Circle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ATTENDANCE_LABEL,
  attendanceState,
  attendanceSummary,
  nextAttendanceOnClick,
  rsvpKind,
  type AttendanceState,
  type RsvpKind,
} from "@/lib/meeting-attendance";
import { inviteSummary } from "@/lib/meeting-detail";
import type { Meeting } from "@/lib/reunioes-store";
import { cn } from "@/lib/utils";

export type ParticipantCard = {
  id: string;
  name: string;
  /** "Organizador · Cargo" */
  sub?: string;
  photo?: string;
  /** Presença só pode ser registrada para quem é elegível (membro do workspace). */
  eligible: boolean;
};

const RSVP_LABEL: Record<RsvpKind, string> = {
  confirmed: "Confirmado",
  declined: "Recusado",
  pending: "Pendente",
};

function Avatar({ p }: { p: ParticipantCard }) {
  return p.photo ? (
    <img src={p.photo} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
  ) : (
    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-muted text-sm font-medium text-text-secondary">
      {p.name.trim()[0]?.toUpperCase() ?? "?"}
    </span>
  );
}

function PresenceMark({ state }: { state: AttendanceState }) {
  if (state === "present") return <Check className="h-3.5 w-3.5 text-success" />;
  if (state === "absent") return <X className="h-3.5 w-3.5 text-text-secondary" />;
  return <Circle className="h-3 w-3 opacity-60" />;
}

/**
 * Área ÚNICA de participantes: cada pessoa aparece uma vez, com foto, nome, cargo, "Convite · …"
 * (resposta ao convite) e "Presença · …" (quem de fato participou) — dois conceitos separados.
 * Presença em 3 estados direto no card, sem modal: clicar no card alterna presente/não
 * participou; o menu da linha de presença escolhe o estado. Depois de registrada, a pessoa não
 * volta a "Não registrada" (cada marcação gera XP).
 */
export function MeetingParticipantsSection({
  meeting,
  people,
  externals,
  presenceAvailable,
  presenceHint,
  canEdit,
  showInvite,
  onMarkAll,
  onSet,
}: {
  meeting: Meeting;
  people: ParticipantCard[];
  externals: string[];
  /** A reunião já começou (e não foi cancelada): a presença pode aparecer/ser registrada. */
  presenceAvailable: boolean;
  /** Mostra "Presença disponível após o início" (só reunião ainda agendada). */
  presenceHint: boolean;
  /** Só o criador registra presença. */
  canEdit: boolean;
  /** Reunião do Google não tem fluxo de resposta ao convite. */
  showInvite: boolean;
  onMarkAll: () => void;
  onSet: (id: string, next: "present" | "absent") => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const eligibleIds = people.filter((p) => p.eligible).map((p) => p.id);
  const summary = attendanceSummary(meeting, eligibleIds);
  const allPresent = summary.total > 0 && summary.present === summary.total;
  const count = people.length + externals.length;
  const LIMIT = 8;
  const shown = showAll ? people : people.slice(0, LIMIT);
  const invite = showInvite ? inviteSummary(meeting, eligibleIds) : null;

  let line: string;
  if (presenceAvailable) {
    line = invite ? `${invite} · ${summary.countLabel}` : summary.countLabel;
  } else {
    line = invite ?? "";
  }

  return (
    <section aria-label="Participantes e presença" className="space-y-2.5">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
        <div className="min-w-0">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
            Participantes · {count}
          </h3>
          {line && (
            <p className="text-sm text-foreground" aria-live="polite">
              {line}
            </p>
          )}
          {presenceHint && people.length > 0 && (
            <p className="text-xs text-text-secondary">
              Presença disponível após o início da reunião.
            </p>
          )}
        </div>
        {presenceAvailable && canEdit && eligibleIds.length > 0 && (
          <Button variant="ghost" size="sm" onClick={onMarkAll} disabled={allPresent}>
            {allPresent ? (
              <Check className="h-3.5 w-3.5" />
            ) : (
              <CheckCheck className="h-3.5 w-3.5" />
            )}
            Todos presentes
          </Button>
        )}
      </div>

      {people.length === 0 && externals.length === 0 && (
        <p className="text-sm text-text-secondary">Nenhum participante convidado.</p>
      )}

      <ul className="grid grid-cols-2 gap-2">
        {shown.map((p) => {
          const state = attendanceState(meeting, p.id);
          const rsvp = rsvpKind(meeting, p.id);
          const interactive = presenceAvailable && canEdit && p.eligible;
          const registered = state !== "unknown";
          return (
            <li
              key={p.id}
              className={cn(
                "rounded-lg border px-2.5 py-2.5 transition-colors",
                state === "present" ? "border-border bg-muted/40" : "border-border/50",
              )}
            >
              <button
                type="button"
                disabled={!interactive}
                onClick={() => onSet(p.id, nextAttendanceOnClick(state))}
                aria-label={
                  interactive
                    ? `${p.name}: ${ATTENDANCE_LABEL[state]}. Clique para alterar.`
                    : undefined
                }
                className={cn(
                  "flex w-full items-center gap-2.5 text-left",
                  interactive &&
                    "rounded-md hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
                )}
              >
                <Avatar p={p} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground">
                    {p.name}
                  </span>
                  <span className="block truncate text-xs text-text-secondary">
                    {p.sub || "Membro"}
                  </span>
                </span>
              </button>
              {(showInvite || (presenceAvailable && p.eligible)) && (
                <div className="mt-2 space-y-1 text-xs">
                  {showInvite && (
                    <p className="truncate text-text-secondary">Convite · {RSVP_LABEL[rsvp]}</p>
                  )}
                  {presenceAvailable &&
                    p.eligible &&
                    (interactive ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            aria-label={`Presença de ${p.name}: ${ATTENDANCE_LABEL[state]}`}
                            className={cn(
                              "inline-flex max-w-full items-center gap-1.5 rounded px-0.5 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
                              state === "unknown" ? "text-text-secondary" : "text-foreground",
                            )}
                          >
                            <PresenceMark state={state} />
                            <span className="truncate">Presença · {ATTENDANCE_LABEL[state]}</span>
                            <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-44">
                          <DropdownMenuItem onSelect={() => onSet(p.id, "present")}>
                            <Check
                              className={cn("h-3.5 w-3.5", state !== "present" && "opacity-0")}
                            />
                            Presente
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => onSet(p.id, "absent")}>
                            <Check
                              className={cn("h-3.5 w-3.5", state !== "absent" && "opacity-0")}
                            />
                            Não participou
                          </DropdownMenuItem>
                          {!registered && (
                            <DropdownMenuItem disabled>
                              <Check className="h-3.5 w-3.5" />
                              Não registrada
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : (
                      <p
                        className={cn(
                          "inline-flex items-center gap-1.5",
                          state === "unknown" ? "text-text-secondary" : "text-foreground",
                        )}
                      >
                        <PresenceMark state={state} />
                        Presença · {ATTENDANCE_LABEL[state]}
                      </p>
                    ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {people.length > LIMIT && !showAll && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="text-xs font-medium text-text-secondary hover:text-foreground"
        >
          Ver todos os {people.length}
        </button>
      )}
      {externals.length > 0 && (
        <p className="text-xs text-text-secondary">Externos: {externals.join(", ")}</p>
      )}
    </section>
  );
}
