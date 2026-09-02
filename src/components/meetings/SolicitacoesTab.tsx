import { useEffect, useState } from "react";
import { Check, X, Repeat, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
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

  // Uma reunião recorrente (série do próprio app ou importada do Google)
  // gera 1 pendência por ocorrência — sem agrupar, uma daily de 3 meses
  // vira dezenas de cards idênticos na lista. Mostra só a próxima
  // ocorrência pendente de cada série, com a contagem das demais; ação
  // de Confirmar/Recusar nela já pergunta "Só esta / Todas" (mesmo fluxo
  // de sempre, `requestConfirmMeeting`/`requestDeleteMeeting` no pai).
  const seen = new Set<string>();
  const pend: (Meeting & { seriesPendingCount?: number })[] = [];
  for (const m of pendRaw) {
    const key = m.seriesId ?? m.id;
    if (seen.has(key)) continue;
    seen.add(key);
    const count = m.seriesId ? pendRaw.filter((x) => x.seriesId === m.seriesId).length : 1;
    pend.push(count > 1 ? { ...m, seriesPendingCount: count } : m);
  }

  const criadorOf = (m: Meeting) =>
    m.criadorId && m.criadorId !== me.id ? team.find((t) => t.id === m.criadorId) : undefined;

  return (
    <div className="mt-6 max-w-2xl">
      <h2 className="text-sm font-semibold">Solicitações pendentes</h2>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Reuniões que você ainda não confirmou nem recusou — responda direto por aqui.
      </p>
      {pend.length === 0 ? (
        <div className="mt-6 flex max-w-md flex-col items-center gap-1 rounded-xl border border-border bg-card px-8 py-10 text-center">
          <Users className="h-5 w-5 text-muted-foreground/60" />
          <p className="mt-2 text-sm font-medium text-foreground">Nenhuma solicitação pendente</p>
          <p className="text-xs text-muted-foreground">
            Quando alguém convidar você para uma reunião, ela aparecerá aqui.
          </p>
        </div>
      ) : (
        <ul className="mt-4 space-y-2">
          {pend.map((m) => {
            const criador = criadorOf(m);
            return (
              <li key={m.id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-xs font-semibold text-muted-foreground">
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
                      <span className="truncate text-sm font-medium">{m.titulo}</span>
                      {m.seriesPendingCount && (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                          <Repeat className="h-2.5 w-2.5" />
                          Recorrente · {m.seriesPendingCount} pendentes
                        </span>
                      )}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {criador ? `${criador.name} · ` : ""}
                      {formatBR(m.data)} · {m.hora}
                      {m.duracao ? ` · ${m.duracao} min` : ""}
                    </div>
                  </button>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Button size="sm" onClick={() => onConfirm(m)}>
                    <Check className="h-3.5 w-3.5" /> Confirmar
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => onDecline(m)}>
                    <X className="h-3.5 w-3.5" /> Recusar
                  </Button>
                  <button
                    type="button"
                    onClick={() => onOpenProposing(m)}
                    className="rounded-md px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    Sugerir novo horário
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpen(m)}
                    className="ml-auto rounded-md px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    Ver detalhes
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
