import { useEffect, useRef, useState } from "react";
import { Check, Plus, Trash2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DateField } from "@/components/ui/date-field";
import {
  type Availability,
  type UnavailableBlock,
  type DiaSemana,
  DIAS_SEMANA,
} from "@/lib/reunioes-store";
import { toISODate, formatBRShort } from "./meeting-status";

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
  // salvo" (a queixa original). Cada chamada de `emit` mostra "Salvo" por
  // alguns segundos, depois volta a sumir.
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

  // Estado normal é só leitura — evita a tela inteira parecer um
  // formulário permanentemente aberto quando os dados já estão
  // configurados. "Editar" revela os controles reais.
  const [editingSchedule, setEditingSchedule] = useState(false);
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null);

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
    <div className="mt-6 max-w-xl">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">Disponibilidade</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Dias e horários em que você normalmente aceita reunião — e quando você está
            indisponível, pra ninguém marcar em cima.
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

      <div className="mt-4 rounded-lg border border-border bg-card p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs font-medium text-muted-foreground">Horário de trabalho</div>
          {!editingSchedule && (
            <button
              type="button"
              onClick={() => setEditingSchedule(true)}
              className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              <Pencil className="h-3 w-3" /> Editar
            </button>
          )}
        </div>

        {!editingSchedule ? (
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <div className="flex flex-wrap gap-1">
              {DIAS_SEMANA.map((d, idx) => (
                <span
                  key={d}
                  className={`flex h-7 min-w-8 items-center justify-center rounded-full px-2 text-[11px] font-medium ${
                    avail.dias[d]
                      ? "bg-foreground text-background"
                      : "bg-muted text-muted-foreground/50"
                  }`}
                >
                  {DIAS_LABEL[idx]}
                </span>
              ))}
            </div>
            <span className="text-sm text-foreground">
              {activeDayLabels.length === 0 ? "Nenhum dia ativo" : `${avail.inicio} → ${avail.fim}`}
            </span>
          </div>
        ) : (
          <>
            <div className="mt-2 flex flex-wrap gap-1.5">
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
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
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
            <div className="mt-3 flex justify-end">
              <Button size="sm" variant="outline" onClick={() => setEditingSchedule(false)}>
                Concluir
              </Button>
            </div>
          </>
        )}
      </div>

      <div className="mt-6 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Indisponibilidades</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Bloqueie um dia específico ou um horário recorrente — aparece pra quem tentar marcar
            reunião com você nesse período.
          </p>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => addBloqueio("data")}
          className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2.5 py-1.5 text-xs font-medium hover:bg-muted"
        >
          <Plus className="h-3.5 w-3.5" /> Bloquear data específica
        </button>
        <button
          type="button"
          onClick={() => addBloqueio("semanal")}
          className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2.5 py-1.5 text-xs font-medium hover:bg-muted"
        >
          <Plus className="h-3.5 w-3.5" /> Bloquear horário recorrente
        </button>
      </div>

      <div className="mt-3 space-y-2">
        {bloqueios.length === 0 && (
          <div className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
            Nenhum bloqueio de indisponibilidade — você aparece disponível no padrão semanal acima.
          </div>
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
              className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3.5 py-2.5"
            >
              <div className="min-w-0">
                <p className="text-sm text-foreground">
                  {b.escopo === "data" && b.data ? formatBRShort(b.data) : "Semanal"} · {b.inicio}
                  {" – "}
                  {b.fim}
                  {b.motivo ? ` · ${b.motivo}` : ""}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {b.escopo === "semanal"
                    ? (b.dias ?? []).length > 0
                      ? (b.dias ?? []).map((d) => DIAS_LABEL[DIAS_SEMANA.indexOf(d)]).join(", ")
                      : "Todo dia"
                    : "Data específica"}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => setEditingBlockId(b.id)}
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label="Editar"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => removeBloqueio(b.id)}
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive"
                  aria-label="Excluir"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ),
        )}
      </div>
    </div>
  );
}
