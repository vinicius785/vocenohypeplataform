import { Check, ChevronDown, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { attendanceState, attendanceSummary, type AttendanceState } from "@/lib/meeting-attendance";
import type { Meeting } from "@/lib/reunioes-store";
import { cn } from "@/lib/utils";

export type PresencePerson = { id: string; name: string; photo?: string };

const STATE_LABEL: Record<AttendanceState, string> = {
  present: "Presente",
  absent: "Ausente",
  unknown: "Não informado",
};

const STATE_TONE: Record<AttendanceState, string> = {
  present: "text-success",
  absent: "text-text-secondary",
  unknown: "text-text-secondary",
};

function Avatar({ person }: { person: PresencePerson }) {
  return person.photo ? (
    <img src={person.photo} alt="" className="h-7 w-7 shrink-0 rounded-full object-cover" />
  ) : (
    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-muted text-[11px] font-medium text-text-secondary">
      {person.name.trim()[0]?.toUpperCase() ?? "?"}
    </span>
  );
}

/**
 * Presença = REGISTRO da reunião (quem de fato participou), separado de "Sua resposta" (confirmou /
 * recusou o convite). Resumo ("2 de 2 presentes"), "Marcar todos presentes" e correção individual
 * num menu compacto. Presença é desta ocorrência — cada ocorrência de série é outra reunião.
 */
export function MeetingPresenceSection({
  meeting,
  people,
  canEdit,
  canRecord,
  onMarkAll,
  onSet,
}: {
  meeting: Meeting;
  people: PresencePerson[];
  /** Só o criador registra presença (regra atual). */
  canEdit: boolean;
  /** A reunião já começou e não está cancelada. */
  canRecord: boolean;
  onMarkAll: () => void;
  onSet: (id: string, present: boolean) => void;
}) {
  const summary = attendanceSummary(
    meeting,
    people.map((p) => p.id),
  );
  const allPresent = summary.recorded && summary.present === summary.total && summary.total > 0;

  return (
    <section aria-label="Presença" className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
          Presença
        </h3>
        <span className="text-sm text-text-secondary" aria-live="polite">
          {summary.label ?? "Ainda não registrada"}
        </span>
      </div>

      {!canRecord ? (
        <p className="text-sm text-text-secondary">
          A presença é registrada depois que a reunião começa.
        </p>
      ) : (
        <>
          {canEdit && people.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={onMarkAll}
              disabled={allPresent}
              className="w-full sm:w-auto"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              {allPresent ? "Todos presentes" : "Marcar todos presentes"}
            </Button>
          )}
          <ul className="-mx-2">
            {people.map((p) => {
              const state = attendanceState(meeting, p.id);
              return (
                <li
                  key={p.id}
                  className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-muted/40"
                >
                  <Avatar person={p} />
                  <span className="min-w-0 flex-1 truncate text-sm text-foreground">{p.name}</span>
                  {canEdit ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          aria-label={`Presença de ${p.name}: ${STATE_LABEL[state]}`}
                          className={cn(
                            "inline-flex h-7 items-center gap-1 rounded-md px-2 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
                            STATE_TONE[state],
                          )}
                        >
                          {state === "present" && <Check className="h-3.5 w-3.5" />}
                          {STATE_LABEL[state]}
                          <ChevronDown className="h-3 w-3 opacity-60" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-36">
                        <DropdownMenuItem onSelect={() => onSet(p.id, true)}>
                          <Check
                            className={cn("h-3.5 w-3.5", state !== "present" && "opacity-0")}
                          />
                          Presente
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => onSet(p.id, false)}>
                          <Check className={cn("h-3.5 w-3.5", state !== "absent" && "opacity-0")} />
                          Ausente
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : (
                    <span className={cn("text-sm font-medium", STATE_TONE[state])}>
                      {STATE_LABEL[state]}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
