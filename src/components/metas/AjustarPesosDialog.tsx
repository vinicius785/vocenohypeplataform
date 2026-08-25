import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import type { Indicador } from "@/lib/metas-store";
import { indicadorPeso } from "@/lib/metas-engine";

/** Ajuste manual de peso — ação separada, nunca aparece na criação do
 * indicador. Cada linha já vem pré-preenchida com o peso EFETIVO de hoje
 * (`indicadorPeso`, mesma função de `metas-engine.ts` que o cálculo do
 * objetivo usa — sem peso definido, já mostra a divisão igual real, nunca
 * inventa um número diferente do que está valendo). */
export function AjustarPesosDialog({
  open,
  indicadores,
  onClose,
  onSave,
}: {
  open: boolean;
  indicadores: Indicador[];
  onClose: () => void;
  onSave: (pesos: Record<string, number>) => void;
}) {
  const [pesos, setPesos] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    const next: Record<string, string> = {};
    for (const ind of indicadores) {
      next[ind.id] = String(Math.round(indicadorPeso(ind, indicadores) * 10) / 10);
    }
    setPesos(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const total = Object.values(pesos).reduce((s, v) => s + (Number(v) || 0), 0);

  const submit = () => {
    const parsed: Record<string, number> = {};
    for (const [id, v] of Object.entries(pesos)) parsed[id] = Number(v) || 0;
    onSave(parsed);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogTitle>Peso dos indicadores</DialogTitle>
        <DialogDescription className="text-xs text-muted-foreground">
          Quanto cada indicador pesa no progresso do objetivo. Sem ajuste, todos contam igual.
        </DialogDescription>

        <ul className="space-y-2">
          {indicadores.map((ind) => (
            <li key={ind.id} className="flex items-center justify-between gap-3">
              <span className="min-w-0 flex-1 truncate text-sm text-foreground">{ind.titulo}</span>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  value={pesos[ind.id] ?? ""}
                  onChange={(e) => setPesos((p) => ({ ...p, [ind.id]: e.target.value }))}
                  className="h-8 w-16 rounded-md border border-input bg-background px-2 text-right text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                />
                <span className="text-xs text-muted-foreground">%</span>
              </div>
            </li>
          ))}
        </ul>

        <div className="mt-3 flex items-center justify-between border-t border-border pt-3 text-xs">
          <span className="text-muted-foreground">Total</span>
          <span
            className={`font-semibold ${Math.round(total) === 100 ? "text-foreground" : "text-amber-600 dark:text-amber-400"}`}
          >
            {Math.round(total * 10) / 10}%
          </span>
        </div>

        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={submit}
            className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90"
          >
            Salvar
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
