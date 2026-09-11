import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { Indicador } from "@/lib/metas-store";
import { indicadorPeso } from "@/lib/metas-engine";

/** Ajuste manual de peso — ação separada, nunca aparece na criação do
 * indicador. Cada linha já vem pré-preenchida com o peso EFETIVO de hoje
 * (`indicadorPeso`, mesma função de `metas-engine.ts` que o cálculo do
 * objetivo usa — sem peso definido, já mostra a divisão igual real, nunca
 * inventa um número diferente do que está valendo). Cancelar fecha sem
 * chamar `onSave`, então os valores originais nunca são tocados. O total
 * diferente de 100% é só um aviso contextual (o motor já normaliza os
 * pesos proporcionalmente ao calcular o progresso) — não existe hoje uma
 * regra que bloqueie salvar um total fora de 100%, então nada aqui
 * inventa esse bloqueio. */
export function AjustarPesosDialog({
  open,
  objetivoId,
  indicadores,
  onClose,
  onSave,
}: {
  open: boolean;
  /** Objetivo cujo peso está sendo ajustado — o mesmo indicador pode ter
   * um peso diferente em outro objetivo, então isso é sempre explícito. */
  objetivoId: string;
  indicadores: Indicador[];
  onClose: () => void;
  onSave: (pesos: Record<string, number>) => void;
}) {
  const [pesos, setPesos] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    const next: Record<string, string> = {};
    for (const ind of indicadores) {
      next[ind.id] = String(Math.round(indicadorPeso(ind, indicadores, objetivoId) * 10) / 10);
    }
    setPesos(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const total = Object.values(pesos).reduce((s, v) => s + (Number(v) || 0), 0);
  const totalRounded = Math.round(total * 10) / 10;
  const balanced = Math.round(total) === 100;

  const submit = () => {
    const parsed: Record<string, number> = {};
    for (const [id, v] of Object.entries(pesos)) parsed[id] = Number(v) || 0;
    onSave(parsed);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogTitle>Peso dos indicadores</DialogTitle>
        <DialogDescription className="text-xs text-text-secondary">
          Quanto cada indicador pesa no progresso do objetivo. Sem ajuste, todos contam igual.
        </DialogDescription>

        <ul className="space-y-3">
          {indicadores.map((ind) => (
            <li key={ind.id} className="flex items-center justify-between gap-3">
              <Label
                htmlFor={`peso-${ind.id}`}
                className="min-w-0 flex-1 truncate font-normal text-foreground"
              >
                {ind.titulo}
              </Label>
              <div className="flex shrink-0 items-center gap-1.5">
                <input
                  id={`peso-${ind.id}`}
                  type="number"
                  value={pesos[ind.id] ?? ""}
                  onChange={(e) => setPesos((p) => ({ ...p, [ind.id]: e.target.value }))}
                  className="h-9 w-16 rounded-md border border-input bg-background px-2 text-right text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand"
                />
                <span className="text-xs text-text-secondary">%</span>
              </div>
            </li>
          ))}
        </ul>

        <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-3 text-sm">
          <span className="text-text-secondary">Total</span>
          <span className={`font-semibold ${balanced ? "text-foreground" : "text-warning"}`}>
            {totalRounded}%
          </span>
        </div>
        {!balanced && (
          <p className="mt-1.5 text-xs text-warning">
            O total não soma 100% — os pesos serão normalizados proporcionalmente no cálculo do
            progresso.
          </p>
        )}

        <div className="mt-4 flex items-center justify-end gap-2">
          <Button variant="outline" size="comfortable" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" size="comfortable" onClick={submit}>
            Salvar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
