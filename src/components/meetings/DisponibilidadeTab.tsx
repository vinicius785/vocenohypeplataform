import { useEffect, useMemo, useState } from "react";
import { Check, Trash2, Pencil, MoreHorizontal, Ban, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DateField } from "@/components/ui/date-field";
import { TimeField } from "@/components/ui/time-field";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  type Availability,
  type UnavailableBlock,
  type DiaSemana,
  type Meeting,
  DIAS_SEMANA,
} from "@/lib/reunioes-store";
import { toISODate, parseISODate, motivoFor } from "./meeting-status";

const DIAS_LABEL = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];
const WEEKDAY_FULL = [
  "Domingo",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
];
const MES_ABREV = [
  "JAN",
  "FEV",
  "MAR",
  "ABR",
  "MAI",
  "JUN",
  "JUL",
  "AGO",
  "SET",
  "OUT",
  "NOV",
  "DEZ",
];
// Ordem "semana de trabalho" (segunda primeiro) só pra exibição/agrupamento
// do horário padrão — `DIAS_SEMANA` continua domingo-primeiro pra indexar
// `avail.dias`, sem mudar nada do modelo de dados existente.
const MONDAY_FIRST: DiaSemana[] = ["seg", "ter", "qua", "qui", "sex", "sab", "dom"];

function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** Agrupa dias consecutivos (segunda→domingo) que compartilham o mesmo
 * estado ativo/inativo — o modelo hoje só tem UM horário (`inicio`/`fim`)
 * pra todos os dias ativos, então o agrupamento é sempre por
 * ativo/inativo, nunca por horários diferentes por dia. */
function groupSchedule(avail: Availability): { label: string; active: boolean }[] {
  const groups: { label: string; active: boolean }[] = [];
  let i = 0;
  while (i < MONDAY_FIRST.length) {
    const active = !!avail.dias[MONDAY_FIRST[i]];
    let j = i;
    while (j + 1 < MONDAY_FIRST.length && !!avail.dias[MONDAY_FIRST[j + 1]] === active) j++;
    const startLabel = DIAS_LABEL[DIAS_SEMANA.indexOf(MONDAY_FIRST[i])];
    const endLabel = DIAS_LABEL[DIAS_SEMANA.indexOf(MONDAY_FIRST[j])];
    groups.push({ label: i === j ? startLabel : `${startLabel} – ${endLabel}`, active });
    i = j + 1;
  }
  return groups;
}

type BlockDraft = {
  id?: string;
  escopo: "semanal" | "data";
  dias: DiaSemana[];
  data: string;
  inicio: string;
  fim: string;
  motivo: string;
};

function draftFrom(escopo: "semanal" | "data", existing?: UnavailableBlock): BlockDraft {
  return {
    id: existing?.id,
    escopo,
    dias: existing?.dias ?? [],
    data: existing?.data ?? toISODate(new Date()),
    inicio: existing?.inicio ?? "09:00",
    fim: existing?.fim ?? "18:00",
    motivo: existing?.motivo ?? "",
  };
}

export function DisponibilidadeTab({
  avail,
  meetings = [],
  onChange,
}: {
  avail: Availability;
  /** Todas as reuniões (não só as minhas) — usada só pra avisar de
   * conflito ao criar um bloqueio sobre um horário já ocupado. */
  meetings?: Meeting[];
  onChange: (a: Availability) => void;
}) {
  const bloqueios = avail.bloqueios ?? [];
  const [justSaved, setJustSaved] = useState(false);
  const emit = (next: Availability) => {
    onChange(next);
    setJustSaved(true);
    window.setTimeout(() => setJustSaved(false), 2000);
  };

  const [editingSchedule, setEditingSchedule] = useState(false);
  const [scheduleDraft, setScheduleDraft] = useState(avail);
  useEffect(() => {
    if (editingSchedule) setScheduleDraft(avail);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingSchedule]);

  const [blockDraft, setBlockDraft] = useState<BlockDraft | null>(null);

  const removeBloqueio = (id: string) => {
    emit({ ...avail, bloqueios: bloqueios.filter((b) => b.id !== id) });
  };

  const saveBlockDraft = () => {
    if (!blockDraft) return;
    const next: UnavailableBlock = {
      id: blockDraft.id ?? crypto.randomUUID(),
      escopo: blockDraft.escopo,
      dias: blockDraft.escopo === "semanal" ? blockDraft.dias : undefined,
      data: blockDraft.escopo === "data" ? blockDraft.data : undefined,
      inicio: blockDraft.inicio,
      fim: blockDraft.fim,
      motivo: blockDraft.motivo.trim() || undefined,
    };
    const exists = bloqueios.some((b) => b.id === next.id);
    emit({
      ...avail,
      bloqueios: exists
        ? bloqueios.map((b) => (b.id === next.id ? next : b))
        : [...bloqueios, next],
    });
    setBlockDraft(null);
  };

  // Conflito com reunião já existente — só faz sentido checar pra bloqueio
  // de data específica (recorrente não tem uma data única pra comparar).
  // Nunca impede salvar, só avisa.
  const draftConflict = useMemo(() => {
    if (!blockDraft || blockDraft.escopo !== "data") return null;
    if (!blockDraft.data || !blockDraft.inicio || !blockDraft.fim) return null;
    const startMin = minutesOf(blockDraft.inicio);
    const endMin = minutesOf(blockDraft.fim);
    if (endMin <= startMin) return null;
    return meetings.find((m) => {
      if (m.status === "Cancelada") return false;
      if (m.data !== blockDraft.data) return false;
      if (m.criadorId !== avail.id && !m.participanteIds?.includes(avail.id)) return false;
      const mStart = minutesOf(m.hora);
      const mEnd = mStart + m.duracao;
      return startMin < mEnd && endMin > mStart;
    });
  }, [blockDraft, meetings, avail.id]);

  const scheduleGroups = groupSchedule(avail);

  const proximos = bloqueios
    .filter((b) => b.escopo === "data")
    .sort((a, b) => (a.data ?? "").localeCompare(b.data ?? ""));
  const recorrentes = bloqueios.filter((b) => b.escopo === "semanal");

  return (
    <div className="mt-6 max-w-2xl">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">Disponibilidade</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Defina quando podem marcar reuniões com você.
          </p>
        </div>
        <span
          className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-opacity duration-300 ${
            justSaved
              ? "bg-emerald-500/10 text-emerald-700 opacity-100 dark:text-emerald-400"
              : "opacity-0"
          }`}
        >
          <Check className="h-3 w-3" /> Salvo
        </span>
      </div>

      {/* Horário padrão */}
      <div className="mt-5 border-t border-border/60 pt-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-foreground">Horário padrão</p>
          <button
            type="button"
            onClick={() => setEditingSchedule(true)}
            className="text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            Editar
          </button>
        </div>
        <div className="mt-2 space-y-1">
          {scheduleGroups.map((g, i) => (
            <div key={i} className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{g.label}</span>
              <span className={g.active ? "text-foreground" : "text-muted-foreground/70"}>
                {g.active ? `${avail.inicio} – ${avail.fim}` : "Indisponível"}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Exceções */}
      <div className="mt-5 border-t border-border/60 pt-4">
        <p className="text-sm font-semibold text-foreground">Exceções</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Bloqueios pontuais ou recorrentes fora do seu horário padrão.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => setBlockDraft(draftFrom("data"))}>
            + Bloquear período
          </Button>
          <Button size="sm" variant="outline" onClick={() => setBlockDraft(draftFrom("semanal"))}>
            Bloqueio recorrente
          </Button>
        </div>

        {bloqueios.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground/70">
            Nenhum bloqueio programado. Sua agenda seguirá normalmente o horário padrão.
          </p>
        ) : (
          <div className="mt-4 space-y-5">
            {proximos.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Próximas
                </p>
                <ul className="mt-1.5 divide-y divide-border/60">
                  {proximos.map((b) => (
                    <ExceptionRow
                      key={b.id}
                      block={b}
                      onEdit={() => setBlockDraft(draftFrom("data", b))}
                      onRemove={() => removeBloqueio(b.id)}
                    />
                  ))}
                </ul>
              </div>
            )}
            {recorrentes.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Recorrentes
                </p>
                <ul className="mt-1.5 divide-y divide-border/60">
                  {recorrentes.map((b) => (
                    <ExceptionRow
                      key={b.id}
                      block={b}
                      onEdit={() => setBlockDraft(draftFrom("semanal", b))}
                      onRemove={() => removeBloqueio(b.id)}
                    />
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Editar horário padrão */}
      <Dialog open={editingSchedule} onOpenChange={setEditingSchedule}>
        <DialogContent className="max-w-sm">
          <DialogTitle>Horário de disponibilidade</DialogTitle>
          <DialogDescription>
            Defina os dias e horários em que reuniões podem ser marcadas com você.
          </DialogDescription>
          <div className="mt-2 space-y-1.5">
            {MONDAY_FIRST.map((d) => {
              const idx = DIAS_SEMANA.indexOf(d);
              const on = !!scheduleDraft.dias[d];
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => setScheduleDraft((s) => ({ ...s, dias: { ...s.dias, [d]: !on } }))}
                  className={`flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-sm transition-colors ${
                    on ? "bg-muted text-foreground" : "text-muted-foreground/60 hover:bg-muted/50"
                  }`}
                >
                  <span className="font-medium">{DIAS_LABEL[idx]}</span>
                  <span>{on ? "Ativo" : "Inativo"}</span>
                </button>
              );
            })}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Início</label>
              <div className="mt-1">
                <TimeField
                  value={scheduleDraft.inicio}
                  onChange={(v) => setScheduleDraft((s) => ({ ...s, inicio: v }))}
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Fim</label>
              <div className="mt-1">
                <TimeField
                  value={scheduleDraft.fim}
                  onChange={(v) => setScheduleDraft((s) => ({ ...s, fim: v }))}
                />
              </div>
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditingSchedule(false)}>
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={() => {
                emit(scheduleDraft);
                setEditingSchedule(false);
              }}
            >
              Salvar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bloquear período / Bloqueio recorrente */}
      <Dialog open={!!blockDraft} onOpenChange={(v) => !v && setBlockDraft(null)}>
        <DialogContent className="max-w-sm">
          {blockDraft && (
            <>
              <DialogTitle>
                {blockDraft.escopo === "data" ? "Bloquear período" : "Bloqueio recorrente"}
              </DialogTitle>
              <DialogDescription className="sr-only">
                Cadastro de bloqueio de disponibilidade
              </DialogDescription>

              <div className="mt-1 space-y-3">
                {blockDraft.escopo === "data" ? (
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Data</label>
                    <div className="mt-1">
                      <DateField
                        value={blockDraft.data}
                        onChange={(v) => setBlockDraft((d) => (d ? { ...d, data: v ?? "" } : d))}
                      />
                    </div>
                  </div>
                ) : (
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Dias</label>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {MONDAY_FIRST.map((d) => {
                        const idx = DIAS_SEMANA.indexOf(d);
                        const on = blockDraft.dias.includes(d);
                        return (
                          <button
                            key={d}
                            type="button"
                            onClick={() =>
                              setBlockDraft((draft) =>
                                draft
                                  ? {
                                      ...draft,
                                      dias: on
                                        ? draft.dias.filter((x) => x !== d)
                                        : [...draft.dias, d],
                                    }
                                  : draft,
                              )
                            }
                            className={`h-8 min-w-10 rounded-full px-3 text-xs font-medium ${
                              on
                                ? "bg-foreground text-background"
                                : "border border-border text-muted-foreground hover:bg-muted"
                            }`}
                          >
                            {DIAS_LABEL[idx]}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Início</label>
                    <div className="mt-1">
                      <TimeField
                        value={blockDraft.inicio}
                        onChange={(v) => setBlockDraft((d) => (d ? { ...d, inicio: v } : d))}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Fim</label>
                    <div className="mt-1">
                      <TimeField
                        value={blockDraft.fim}
                        onChange={(v) => setBlockDraft((d) => (d ? { ...d, fim: v } : d))}
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-medium text-muted-foreground">Motivo</label>
                  <input
                    type="text"
                    value={blockDraft.motivo}
                    onChange={(e) =>
                      setBlockDraft((d) => (d ? { ...d, motivo: e.target.value } : d))
                    }
                    placeholder="Ex.: Plantão, gravação, folga…"
                    className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>

                {draftConflict && (
                  <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 px-3 py-2.5 text-xs text-amber-700 dark:text-amber-400">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <div>
                      <p className="font-medium">Existe uma reunião neste período</p>
                      <p className="mt-0.5">
                        {draftConflict.titulo} · {draftConflict.hora}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-4 flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setBlockDraft(null)}>
                  Cancelar
                </Button>
                <Button size="sm" onClick={saveBlockDraft}>
                  {draftConflict
                    ? "Bloquear mesmo assim"
                    : blockDraft.escopo === "data"
                      ? "Bloquear período"
                      : "Salvar"}
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ExceptionRow({
  block,
  onEdit,
  onRemove,
}: {
  block: UnavailableBlock;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const isRecurring = block.escopo === "semanal";
  const dateLabel = !isRecurring && block.data ? parseISODate(block.data) : null;
  const secondary = isRecurring
    ? (block.dias ?? []).length > 0
      ? `Toda ${(block.dias ?? []).map((d) => WEEKDAY_FULL[DIAS_SEMANA.indexOf(d)].toLowerCase()).join(", ")}`
      : "Recorrente"
    : dateLabel
      ? WEEKDAY_FULL[dateLabel.getDay()]
      : "Data específica";

  return (
    <li className="flex items-center gap-3 py-2.5 pl-3">
      <div className="relative flex h-full shrink-0 items-center self-stretch">
        <span className="absolute -left-3 top-0 h-full w-0.5 rounded-full bg-amber-500/60" />
        {!isRecurring && dateLabel ? (
          <div className="w-10 text-center">
            <p className="text-base font-semibold leading-none text-foreground">
              {String(dateLabel.getDate()).padStart(2, "0")}
            </p>
            <p className="mt-0.5 text-[10px] font-medium text-muted-foreground">
              {MES_ABREV[dateLabel.getMonth()]}
            </p>
          </div>
        ) : (
          <Ban className="h-4 w-4 shrink-0 text-amber-500" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{motivoFor(block)}</p>
        <p className="text-xs text-muted-foreground">
          {block.inicio} – {block.fim}
        </p>
        <p className="text-[11px] text-muted-foreground/70">{secondary}</p>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Mais ações"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={onEdit}>
            <Pencil className="h-3.5 w-3.5" /> Editar
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onRemove} className="text-red-600 dark:text-red-400">
            <Trash2 className="h-3.5 w-3.5" /> Excluir
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}
