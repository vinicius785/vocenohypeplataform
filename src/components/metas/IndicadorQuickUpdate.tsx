import { useEffect, useState } from "react";
import { Target } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  INDICADOR_MARCO_STATUSES,
  type Indicador,
  type IndicadorMarcoStatus,
} from "@/lib/metas-store";

const MARCO_STATUS_LABEL: Record<IndicadorMarcoStatus, string> = {
  nao_iniciado: "Não iniciado",
  em_andamento: "Em andamento",
  concluido: "Concluído",
};

export type IndicadorQuickPatch = {
  valorAtual?: number;
  concluido?: boolean;
  marcoStatus?: IndicadorMarcoStatus;
};

/** Tela de "editar indicador" no dia a dia: só o número (ou status), sem
 * reabrir nome/tipo/direção/dono — isso já ficou definido na criação e
 * raramente muda. Pra corrigir esses detalhes estruturais, use "Editar
 * detalhes" (o formulário completo), não esta tela. */
export function IndicadorQuickUpdate({
  indicador,
  onClose,
  onSave,
}: {
  indicador: Indicador | null;
  onClose: () => void;
  onSave: (indicador: Indicador, patch: IndicadorQuickPatch, nota: string) => void;
}) {
  const [valor, setValor] = useState("");
  const [concluido, setConcluido] = useState(false);
  const [marcoStatus, setMarcoStatus] = useState<IndicadorMarcoStatus>("nao_iniciado");
  const [nota, setNota] = useState("");

  useEffect(() => {
    if (indicador) {
      setValor(indicador.valorAtual != null ? String(indicador.valorAtual) : "");
      setConcluido(indicador.concluido ?? false);
      setMarcoStatus(indicador.marcoStatus ?? "nao_iniciado");
      setNota("");
    }
  }, [indicador]);

  if (!indicador) return null;

  const submit = () => {
    const patch: IndicadorQuickPatch =
      indicador.tipo === "binario"
        ? { concluido }
        : indicador.tipo === "marco"
          ? { marcoStatus }
          : { valorAtual: valor ? Number(valor) : undefined };
    onSave(indicador, patch, nota);
  };

  return (
    <Dialog open={!!indicador} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogTitle className="flex items-center gap-2 text-base font-semibold">
          <Target className="h-4 w-4" /> Atualizar indicador
        </DialogTitle>
        <DialogDescription className="text-xs text-muted-foreground">
          {indicador.titulo}
        </DialogDescription>

        <div className="space-y-3">
          {indicador.tipo === "binario" ? (
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={concluido}
                onChange={(e) => setConcluido(e.target.checked)}
                className="h-4 w-4 rounded border-input"
                autoFocus
              />
              Concluído
            </label>
          ) : indicador.tipo === "marco" ? (
            <div>
              <label className="block text-xs font-medium text-muted-foreground">Etapa atual</label>
              <select
                value={marcoStatus}
                onChange={(e) => setMarcoStatus(e.target.value as IndicadorMarcoStatus)}
                autoFocus
                className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {INDICADOR_MARCO_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {MARCO_STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div>
              <label className="block text-xs font-medium text-muted-foreground">
                Valor atual{indicador.unidade ? ` (${indicador.unidade})` : ""}
              </label>
              <input
                type="number"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                autoFocus
                className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-muted-foreground">
              Nota (opcional)
            </label>
            <input
              type="text"
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              placeholder="O que mudou desde a última atualização?"
              className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
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
