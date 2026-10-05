import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { nextStepsToText, parseNextSteps } from "@/lib/meeting-detail";
import type { Meeting } from "@/lib/reunioes-store";

/** Resultado da reunião: o que foi decidido (resumo) e o que acontece depois (próximos passos,
 * texto simples — sem integração com tarefas). Só o criador edita. */
export function MeetingResultSection({
  meeting,
  canEdit,
  onSave,
}: {
  meeting: Meeting;
  canEdit: boolean;
  onSave: (resumo: string | undefined, proximosPassos: string[]) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [resumo, setResumo] = useState(meeting.resumo ?? "");
  const [steps, setSteps] = useState(nextStepsToText(meeting.proximosPassos));
  const hasResumo = !!meeting.resumo?.trim();
  const hasSteps = (meeting.proximosPassos?.length ?? 0) > 0;

  useEffect(() => {
    setResumo(meeting.resumo ?? "");
    setSteps(nextStepsToText(meeting.proximosPassos));
    setEditing(false);
  }, [meeting.id, meeting.resumo, meeting.proximosPassos]);

  const empty = !hasResumo && !hasSteps;
  return (
    <section aria-label="Resultado" className="space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
          Resultado
        </h3>
        {canEdit && !editing && !empty && (
          <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
            Editar
          </Button>
        )}
      </div>

      {editing ? (
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-text-secondary">Resumo</label>
            <Textarea
              autoFocus
              rows={3}
              value={resumo}
              onChange={(e) => setResumo(e.target.value)}
              placeholder="O que foi decidido"
              aria-label="Resumo"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-text-secondary">
              Próximos passos
            </label>
            <Textarea
              rows={4}
              value={steps}
              onChange={(e) => setSteps(e.target.value)}
              placeholder="Um passo por linha"
              aria-label="Próximos passos"
            />
          </div>
          <div className="flex justify-end gap-1.5">
            <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                onSave(resumo.trim() || undefined, parseNextSteps(steps));
                setEditing(false);
              }}
            >
              Salvar resultado
            </Button>
          </div>
        </div>
      ) : empty ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-text-secondary">Nenhum resultado registrado.</p>
          {canEdit && (
            <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
              Registrar resultado
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {hasResumo && (
            <div className="space-y-0.5">
              <p className="text-xs text-text-secondary">Resumo</p>
              <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
                {meeting.resumo}
              </p>
            </div>
          )}
          {hasSteps && (
            <div className="space-y-1">
              <p className="text-xs text-text-secondary">Próximos passos</p>
              <ul className="list-disc space-y-0.5 pl-5 text-sm text-foreground marker:text-text-secondary">
                {meeting.proximosPassos!.map((s, i) => (
                  <li key={i} className="break-words">
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
