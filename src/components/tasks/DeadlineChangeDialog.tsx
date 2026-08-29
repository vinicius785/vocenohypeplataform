import { useState } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  DEADLINE_CHANGE_MOTIVOS,
  DEADLINE_CHANGE_MOTIVO_LABEL,
  type DeadlineChangeMotivo,
} from "@/components/tasks/TaskBoard";

/**
 * Só aparece quando uma tarefa que JÁ tinha prazo tem o prazo alterado
 * (primeira definição de prazo nunca pede motivo) — intercepta o
 * "Salvar" só nesse caso específico, pra manter qualquer outra edição
 * rápida e sem fricção (item 26 do pedido). `<select>` rígido (não
 * datalist) porque o motivo alimenta `exemptFromResponsibility`
 * automaticamente — precisa ser um enum previsível, não texto livre.
 */
export function DeadlineChangeDialog({
  open,
  onOpenChange,
  isCritical,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  isCritical: boolean;
  onConfirm: (motivo: DeadlineChangeMotivo, observacao: string) => void;
}) {
  const [motivo, setMotivo] = useState<DeadlineChangeMotivo>("replanejamento_operacional");
  const [observacao, setObservacao] = useState("");
  const precisaObservacao = motivo === "outro";

  const confirm = () => {
    if (precisaObservacao && !observacao.trim()) return;
    onConfirm(motivo, observacao.trim());
    setMotivo("replanejamento_operacional");
    setObservacao("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm gap-4">
        <DialogTitle>Por que o prazo está mudando?</DialogTitle>
        <DialogDescription>
          {isCritical
            ? "Essa mudança está acontecendo no próprio dia do vencimento — fica registrada como replanejamento crítico."
            : "Fica registrado no histórico da tarefa."}
        </DialogDescription>
        <div className="space-y-3">
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Motivo</span>
            <select
              value={motivo}
              onChange={(e) => setMotivo(e.target.value as DeadlineChangeMotivo)}
              className="h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
              autoFocus
            >
              {DEADLINE_CHANGE_MOTIVOS.map((m) => (
                <option key={m} value={m}>
                  {DEADLINE_CHANGE_MOTIVO_LABEL[m]}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">
              Observação{precisaObservacao ? "" : " (opcional)"}
            </span>
            <textarea
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              rows={2}
              placeholder={precisaObservacao ? "Conte rapidamente o que aconteceu" : undefined}
              className="w-full resize-none rounded-md border border-input bg-background px-2.5 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
            />
          </label>
        </div>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={precisaObservacao && !observacao.trim()}
            className="rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background hover:opacity-90 disabled:opacity-50"
          >
            Confirmar
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
