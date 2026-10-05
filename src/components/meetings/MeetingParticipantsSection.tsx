import { useState } from "react";
import { Check, CheckCheck, Circle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  attendanceState,
  attendanceSummary,
  rsvpKind,
  type RsvpKind,
} from "@/lib/meeting-attendance";
import type { Meeting } from "@/lib/reunioes-store";
import { cn } from "@/lib/utils";

export type ParticipantCard = {
  id: string;
  name: string;
  /** Organizador · cargo */
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
    <img src={p.photo} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
  ) : (
    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-muted text-xs font-medium text-text-secondary">
      {p.name.trim()[0]?.toUpperCase() ?? "?"}
    </span>
  );
}

/**
 * Área ÚNICA de participantes: cada pessoa aparece uma vez, com avatar, nome, cargo, a PRESENÇA
 * (principal, no rodapé do card; clicável) e o convite (RSVP) como informação secundária, rotulada
 * "Convite" para nunca ser confundida com presença. Contador e "Marcar todos presentes" vêm do topo.
 */
export function MeetingParticipantsSection({
  meeting,
  people,
  externals,
  canEdit,
  canRecord,
  onMarkAll,
  onToggle,
}: {
  meeting: Meeting;
  people: ParticipantCard[];
  externals: string[];
  canEdit: boolean;
  canRecord: boolean;
  onMarkAll: () => void;
  onToggle: (id: string) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const eligibleIds = people.filter((p) => p.eligible).map((p) => p.id);
  const summary = attendanceSummary(meeting, eligibleIds);
  const allPresent = summary.total > 0 && summary.present === summary.total;
  const count = people.length + externals.length;
  const LIMIT = 8;
  const shown = showAll ? people : people.slice(0, LIMIT);

  return (
    <section aria-label="Participantes e presença" className="space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <div className="min-w-0">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
            Participantes · {count}
          </h3>
          <p className="text-sm text-foreground" aria-live="polite">
            {canRecord ? summary.countLabel : "A presença é registrada depois que a reunião começa"}
          </p>
        </div>
        {canRecord && canEdit && eligibleIds.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onMarkAll}
            disabled={allPresent}
            className="text-text-secondary"
          >
            {allPresent ? (
              <Check className="h-3.5 w-3.5" />
            ) : (
              <CheckCheck className="h-3.5 w-3.5" />
            )}
            {allPresent ? "Todos presentes" : "Marcar todos presentes"}
          </Button>
        )}
      </div>

      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {shown.map((p) => {
          const state = attendanceState(meeting, p.id);
          const present = state === "present";
          const rsvp = rsvpKind(meeting, p.id);
          const interactive = canRecord && canEdit && p.eligible;
          const body = (
            <>
              <div className="flex items-start gap-2.5">
                <Avatar p={p} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{p.name}</p>
                  <p className="truncate text-xs text-text-secondary">{p.sub || "Membro"}</p>
                </div>
              </div>
              <div className="mt-2.5 flex items-center justify-between gap-2 text-xs">
                {canRecord && p.eligible ? (
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5",
                      present ? "text-foreground" : "text-text-secondary",
                    )}
                  >
                    {present ? (
                      <Check className="h-3.5 w-3.5 text-success" />
                    ) : (
                      <Circle className="h-3 w-3 opacity-60" />
                    )}
                    {present ? "Presente" : "Não registrado"}
                  </span>
                ) : (
                  <span />
                )}
                <span className="text-text-secondary">Convite · {RSVP_LABEL[rsvp]}</span>
              </div>
            </>
          );
          const cls = cn(
            "block w-full rounded-lg border px-3 py-2.5 text-left transition-colors",
            present ? "border-border bg-muted/40" : "border-border/50 bg-transparent",
          );
          return (
            <li key={p.id}>
              {interactive ? (
                <button
                  type="button"
                  onClick={() => onToggle(p.id)}
                  aria-pressed={present}
                  aria-label={`${p.name}: ${present ? "presente" : "presença não registrada"}. Clique para alterar.`}
                  className={cn(
                    cls,
                    "hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
                  )}
                >
                  {body}
                </button>
              ) : (
                <div className={cls}>{body}</div>
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
