import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Plus,
  Trash2,
  Pencil,
  MoreHorizontal,
  ChevronLeft,
  ChevronRight,
  Ban,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DateField } from "@/components/ui/date-field";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
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
  DIAS_SEMANA,
  blocksForDate,
} from "@/lib/reunioes-store";
import {
  toISODate,
  formatBRShort,
  startOfWeek,
  weekRangeLabel,
  WEEK_HOUR_START,
  WEEK_HOUR_END,
  HOUR_ROW_PX,
  motivoFor,
} from "./meeting-status";

const DIAS_LABEL = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];

export function DisponibilidadeTab({
  avail,
  onChange,
}: {
  avail: Availability;
  onChange: (a: Availability) => void;
}) {
  const bloqueios = avail.bloqueios ?? [];
  // Feedback visual de salvamento — sem isso, marcar/desmarcar um dia ou
  // criar um bloqueio não dava nenhuma sensação de "isso realmente foi
  // salvo". Cada chamada de `emit` mostra "Salvo" por alguns segundos.
  const [justSaved, setJustSaved] = useState(false);
  const savedTimeout = useRef<number | null>(null);
  const emit = (next: Availability) => {
    onChange(next);
    setJustSaved(true);
    if (savedTimeout.current) window.clearTimeout(savedTimeout.current);
    savedTimeout.current = window.setTimeout(() => setJustSaved(false), 2000);
  };
  useEffect(
    () => () => {
      if (savedTimeout.current) window.clearTimeout(savedTimeout.current);
    },
    [],
  );

  const [editingSchedule, setEditingSchedule] = useState(false);
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null);
  const [weekCursor, setWeekCursor] = useState<Date>(() => new Date());

  const updateBloqueio = (id: string, patch: Partial<UnavailableBlock>) => {
    emit({ ...avail, bloqueios: bloqueios.map((b) => (b.id === id ? { ...b, ...patch } : b)) });
  };
  const removeBloqueio = (id: string) => {
    emit({ ...avail, bloqueios: bloqueios.filter((b) => b.id !== id) });
    if (editingBlockId === id) setEditingBlockId(null);
  };
  const addBloqueio = (escopo: "semanal" | "data") => {
    const novo: UnavailableBlock = {
      id: crypto.randomUUID(),
      escopo,
      dias: escopo === "semanal" ? [] : undefined,
      data: escopo === "data" ? toISODate(new Date()) : undefined,
      inicio: "09:00",
      fim: "18:00",
      motivo: "",
    };
    emit({ ...avail, bloqueios: [...bloqueios, novo] });
    setEditingBlockId(novo.id);
  };
  const toggleDiaBloqueio = (bloqueio: UnavailableBlock, d: DiaSemana) => {
    const cur = bloqueio.dias ?? [];
    updateBloqueio(bloqueio.id, {
      dias: cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d],
    });
  };

  const activeDayLabels = DIAS_SEMANA.map((d, i) => (avail.dias[d] ? DIAS_LABEL[i] : null)).filter(
    Boolean,
  );

  return (
    <div className="mt-6 max-w-4xl">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">Disponibilidade</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Defina quando podem marcar reuniões com você e bloqueie períodos em que não estará
            disponível.
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

      {/* Horário padrão — leitura por padrão, popover pra editar */}
      <div className="mt-5 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Horário padrão
          </p>
          {activeDayLabels.length === 0 ? (
            <p className="mt-1 text-sm text-foreground">Nenhum dia ativo</p>
          ) : (
            <>
              <p className="mt-1 text-sm text-foreground">{activeDayLabels.join(" · ")}</p>
              <p className="text-sm text-foreground">
                {avail.inicio} – {avail.fim}
              </p>
            </>
          )}
        </div>
        <Popover open={editingSchedule} onOpenChange={setEditingSchedule}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              <Pencil className="h-3 w-3" /> Editar
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80">
            <p className="text-sm font-semibold text-foreground">Horário de disponibilidade</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Defina os dias e horários em que reuniões podem ser marcadas com você.
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {DIAS_SEMANA.map((d, idx) => {
                const on = !!avail.dias[d];
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => emit({ ...avail, dias: { ...avail.dias, [d]: !on } })}
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
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Início</label>
                <input
                  type="time"
                  value={avail.inicio}
                  onChange={(e) => emit({ ...avail, inicio: e.target.value })}
                  className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Fim</label>
                <input
                  type="time"
                  value={avail.fim}
                  onChange={(e) => emit({ ...avail, fim: e.target.value })}
                  className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button size="sm" variant="outline" onClick={() => setEditingSchedule(false)}>
                Cancelar
              </Button>
              <Button size="sm" onClick={() => setEditingSchedule(false)}>
                Salvar
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      <div className="my-6 border-t border-border/60" />

      {/* Grade semanal — visualização, não altera o horário padrão */}
      <AvailabilityWeekGrid avail={avail} cursor={weekCursor} onCursorChange={setWeekCursor} />

      <div className="my-6 border-t border-border/60" />

      {/* Exceções */}
      <div>
        <p className="text-sm font-semibold text-foreground">Exceções</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Bloqueios e alterações no seu horário padrão.
        </p>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => addBloqueio("data")}
          className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2.5 py-1.5 text-xs font-medium hover:bg-muted"
        >
          <Plus className="h-3.5 w-3.5" /> Bloquear período
        </button>
        <button
          type="button"
          onClick={() => addBloqueio("semanal")}
          className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2.5 py-1.5 text-xs font-medium hover:bg-muted"
        >
          <Plus className="h-3.5 w-3.5" /> Bloqueio recorrente
        </button>
      </div>

      <div className="mt-3 space-y-2">
        {bloqueios.length === 0 && (
          <p className="py-3 text-sm text-muted-foreground/70">Nenhum bloqueio programado.</p>
        )}
        {bloqueios.map((b) =>
          editingBlockId === b.id ? (
            <div key={b.id} className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
              <div className="flex items-center justify-between">
                <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-700 dark:text-amber-400">
                  {b.escopo === "semanal" ? "Toda semana" : "Data específica"}
                </span>
                <button
                  type="button"
                  onClick={() => removeBloqueio(b.id)}
                  className="text-muted-foreground hover:text-destructive"
                  aria-label="Remover"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

              {b.escopo === "semanal" ? (
                <div className="mt-3">
                  <div className="text-xs font-medium text-muted-foreground">Dias</div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {DIAS_SEMANA.map((d, idx) => {
                      const on = (b.dias ?? []).includes(d);
                      return (
                        <button
                          key={d}
                          type="button"
                          onClick={() => toggleDiaBloqueio(b, d)}
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
              ) : (
                <div className="mt-3">
                  <label className="text-xs font-medium text-muted-foreground">Data</label>
                  <DateField
                    value={b.data ?? undefined}
                    onChange={(v) => updateBloqueio(b.id, { data: v ?? "" })}
                    className="mt-1"
                  />
                </div>
              )}

              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Início</label>
                  <input
                    type="time"
                    value={b.inicio}
                    onChange={(e) => updateBloqueio(b.id, { inicio: e.target.value })}
                    className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Fim</label>
                  <input
                    type="time"
                    value={b.fim}
                    onChange={(e) => updateBloqueio(b.id, { fim: e.target.value })}
                    className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
              </div>

              <div className="mt-3">
                <label className="text-xs font-medium text-muted-foreground">Motivo</label>
                <input
                  type="text"
                  value={b.motivo ?? ""}
                  onChange={(e) => updateBloqueio(b.id, { motivo: e.target.value })}
                  placeholder="Ex.: Plantão, gravação, folga…"
                  className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>

              <div className="mt-3 flex justify-end">
                <Button size="sm" variant="outline" onClick={() => setEditingBlockId(null)}>
                  Concluir
                </Button>
              </div>
            </div>
          ) : (
            <div
              key={b.id}
              className="flex items-center justify-between gap-3 rounded-lg px-1 py-2 transition-colors hover:bg-muted/40"
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <Ban className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                <div className="min-w-0">
                  <p className="text-sm text-foreground">
                    {b.escopo === "data" && b.data ? formatBRShort(b.data) : "Semanal"} · {b.inicio}
                    {" – "}
                    {b.fim}
                    {motivoFor(b) ? ` · ${motivoFor(b)}` : ""}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {b.escopo === "semanal"
                      ? (b.dias ?? []).length > 0
                        ? (b.dias ?? []).map((d) => DIAS_LABEL[DIAS_SEMANA.indexOf(d)]).join(", ")
                        : "Todo dia"
                      : "Data específica"}
                  </p>
                </div>
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
                  <DropdownMenuItem onClick={() => setEditingBlockId(b.id)}>
                    <Pencil className="h-3.5 w-3.5" /> Editar
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => removeBloqueio(b.id)}
                    className="text-red-600 dark:text-red-400"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Excluir
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ),
        )}
      </div>
    </div>
  );
}

/** Grade semanal só-leitura da própria disponibilidade (horário padrão
 * + exceções) — mesma linguagem visual/constantes de horário da visão
 * Semana do Calendário (`meeting-status.ts`), pra não ter dois sistemas
 * diferentes de representar tempo. Navegar entre semanas é só visual:
 * nunca altera o horário padrão, só mostra como ele + as exceções
 * resultam em disponibilidade real numa semana específica. */
function AvailabilityWeekGrid({
  avail,
  cursor,
  onCursorChange,
}: {
  avail: Availability;
  cursor: Date;
  onCursorChange: (d: Date) => void;
}) {
  const weekStart = startOfWeek(cursor);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });
  const today = toISODate(new Date());
  const hours = Array.from(
    { length: WEEK_HOUR_END - WEEK_HOUR_START + 1 },
    (_, i) => WEEK_HOUR_START + i,
  );
  const gridHeight = (hours.length - 1) * HOUR_ROW_PX;
  const minutesFromRangeStart = (hhmm: string) => {
    const [h, m] = hhmm.split(":").map(Number);
    return (h - WEEK_HOUR_START) * 60 + m;
  };
  const availStartMin = minutesFromRangeStart(avail.inicio);
  const availEndMin = minutesFromRangeStart(avail.fim);

  const blocksByDay = useMemo(() => {
    const map = new Map<string, UnavailableBlock[]>();
    for (const d of days) {
      const iso = toISODate(d);
      map.set(iso, blocksForDate(avail, iso));
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [avail, weekStart.getTime()]);

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            const d = new Date(cursor);
            d.setDate(d.getDate() - 7);
            onCursorChange(d);
          }}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Semana anterior"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="min-w-[140px] text-sm font-medium">{weekRangeLabel(weekStart)}</div>
        <button
          type="button"
          onClick={() => {
            const d = new Date(cursor);
            d.setDate(d.getDate() + 7);
            onCursorChange(d);
          }}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Próxima semana"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => onCursorChange(new Date())}
          className="ml-1 rounded-full border border-border px-3 py-1 text-xs hover:bg-muted"
        >
          Hoje
        </button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <div className="min-w-[640px]">
          <div className="grid grid-cols-[3.5rem_repeat(7,1fr)] border-b border-border bg-muted/30">
            <div />
            {days.map((d) => {
              const iso = toISODate(d);
              const isToday = iso === today;
              return (
                <div key={iso} className="flex flex-col items-center gap-0.5 py-2">
                  <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    {DIAS_LABEL[d.getDay()]}
                  </span>
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-full text-xs tabular-nums ${
                      isToday ? "bg-foreground text-background" : "text-foreground"
                    }`}
                  >
                    {d.getDate()}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-[3.5rem_repeat(7,1fr)]">
            <div className="relative" style={{ height: gridHeight }}>
              {hours.slice(0, -1).map((h, i) => (
                <div
                  key={h}
                  className="absolute right-2 -translate-y-1/2 text-[11px] tabular-nums text-muted-foreground"
                  style={{ top: i * HOUR_ROW_PX }}
                >
                  {String(h).padStart(2, "0")}:00
                </div>
              ))}
            </div>
            {days.map((d) => {
              const iso = toISODate(d);
              const dow = DIAS_SEMANA[d.getDay()];
              const dayEnabled = !!avail.dias[dow];
              const blocks = blocksByDay.get(iso) ?? [];
              return (
                <div
                  key={iso}
                  className="relative border-l border-border"
                  style={{ height: gridHeight }}
                >
                  {!dayEnabled ? (
                    <div className="absolute inset-0 bg-muted/20" />
                  ) : (
                    <>
                      <div
                        className="absolute inset-x-0 bg-muted/20"
                        style={{ top: 0, height: Math.max(0, (availStartMin / 60) * HOUR_ROW_PX) }}
                      />
                      <div
                        className="absolute inset-x-0 bg-muted/20"
                        style={{
                          top: (availEndMin / 60) * HOUR_ROW_PX,
                          height: gridHeight - (availEndMin / 60) * HOUR_ROW_PX,
                        }}
                      />
                    </>
                  )}
                  {blocks.map((b) => {
                    const top = Math.max(0, (minutesFromRangeStart(b.inicio) / 60) * HOUR_ROW_PX);
                    const height = Math.max(
                      16,
                      ((minutesFromRangeStart(b.fim) - minutesFromRangeStart(b.inicio)) / 60) *
                        HOUR_ROW_PX,
                    );
                    return (
                      <div
                        key={b.id}
                        className="absolute inset-x-0.5 overflow-hidden rounded-sm border-l-2 border-amber-500 bg-amber-500/10 px-1.5 py-0.5"
                        style={{ top, height }}
                      >
                        <p className="flex items-center gap-1 truncate text-[10px] font-medium text-amber-700 dark:text-amber-400">
                          <Ban className="h-2.5 w-2.5 shrink-0" /> {motivoFor(b)}
                        </p>
                        {height > 30 && (
                          <p className="truncate text-[10px] text-amber-700/80 dark:text-amber-400/80">
                            {b.inicio} – {b.fim}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
