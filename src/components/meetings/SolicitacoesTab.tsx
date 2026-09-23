import { useEffect, useState } from "react";
import { Check, X, Repeat, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { Meeting } from "@/lib/reunioes-store";
import { meetingNeedsMyAction } from "@/lib/reunioes-store";
import { formatBR } from "./meeting-status";
import { loadTeam, type TeamMember } from "./team";

export function SolicitacoesTab({
  meetings,
  me,
  onOpen,
  onOpenProposing,
  onConfirm,
  onDecline,
}: {
  meetings: Meeting[];
  me: { id: string; name: string };
  onOpen: (m: Meeting) => void;
  onOpenProposing: (m: Meeting) => void;
  onConfirm: (m: Meeting) => void;
  onDecline: (m: Meeting) => void;
}) {
  const [team, setTeam] = useState<TeamMember[]>([]);
  useEffect(() => setTeam(loadTeam()), []);

  const pendRaw = meetings
    .filter((m) => meetingNeedsMyAction(m, me.id))
    .sort((a, b) => (a.data + a.hora).localeCompare(b.data + b.hora));

  // Uma série recorrente gera UMA solicitação, não uma por ocorrência —
  // deduplicada pelo identificador estável da série (`seriesId`, ou o
  // `recurringEventId` do Google quando a série veio de lá). Mostra só a
  // próxima ocorrência pendente de cada série; ação de Confirmar/Recusar
  // nela já pergunta "Só esta / Todas" (mesmo fluxo de sempre,
  // `requestConfirmMeeting`/`requestDeleteMeeting` no pai). Nunca exibe a
  // contagem crua de ocorrências futuras como se fossem pendências
  // separadas — foi isso que causava o badge "629 pendentes".
  const seen = new Set<string>();
  const pend: (Meeting & { isRecurring?: boolean })[] = [];
  for (const m of pendRaw) {
    const key = m.seriesId ?? m.id;
    if (seen.has(key)) continue;
    seen.add(key);
    pend.push(m.seriesId ? { ...m, isRecurring: true } : m);
  }

  const criadorOf = (m: Meeting) =>
    m.criadorId && m.criadorId !== me.id ? team.find((t) => t.id === m.criadorId) : undefined;

  if (pend.length === 0) {
    return (
      <div className="rounded-[24px] bg-card p-10 text-center dark:shadow-none">
        <Users className="mx-auto h-8 w-8 text-text-secondary/50" />
        <p className="mt-3 text-sm font-medium text-foreground">Nenhuma solicitação pendente</p>
        <p className="mt-1 text-sm text-text-secondary">
          Quando alguém convidar você para uma reunião, ela aparece aqui.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-3">
      <div className="px-1">
        <h2 className="text-[15px] font-semibold text-foreground">Solicitações pendentes</h2>
        <p className="mt-0.5 text-xs text-text-secondary">
          Reuniões que você ainda não confirmou nem recusou — responda direto por aqui.
        </p>
      </div>
      <ul className="space-y-2">
        {pend.map((m) => {
          const criador = criadorOf(m);
          return (
            <li key={m.id} className="rounded-2xl bg-card p-4 dark:shadow-none">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-xs font-semibold text-text-secondary">
                  {criador?.photo ? (
                    <img src={criador.photo} alt="" className="h-full w-full object-cover" />
                  ) : (
                    (criador?.name ?? m.titulo).trim()[0]?.toUpperCase()
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => onOpen(m)}
                  className="min-w-0 flex-1 text-left"
                >
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-medium text-foreground">{m.titulo}</span>
                    {m.isRecurring && (
                      <Badge variant="secondary" className="shrink-0 gap-1 font-medium">
                        <Repeat className="h-2.5 w-2.5" />
                        Recorrente
                      </Badge>
                    )}
                  </div>
                  <div className="truncate text-xs text-text-secondary">
                    {criador ? `${criador.name} · ` : ""}
                    {formatBR(m.data)} · {m.hora}
                    {m.duracao ? ` · ${m.duracao} min` : ""}
                  </div>
                </button>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  className="bg-success text-brand-foreground hover:bg-success/90"
                  onClick={() => onConfirm(m)}
                >
                  <Check className="h-3.5 w-3.5" /> Confirmar
                </Button>
                <Button size="sm" variant="destructive" onClick={() => onDecline(m)}>
                  <X className="h-3.5 w-3.5" /> Recusar
                </Button>
                <button
                  type="button"
                  onClick={() => onOpenProposing(m)}
                  className="rounded-md px-2.5 py-1.5 text-xs text-text-secondary hover:bg-muted hover:text-foreground"
                >
                  Sugerir novo horário
                </button>
                <button
                  type="button"
                  onClick={() => onOpen(m)}
                  className="ml-auto rounded-md px-2.5 py-1 text-xs text-text-secondary hover:text-foreground"
                >
                  Ver detalhes
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
