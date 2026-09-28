import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/** Confirmação de remoção — nunca "Excluir usuário" (a conta pode existir
 * fora deste cliente): sempre "Remover acesso", deixando explícito que só
 * o VÍNCULO com esta empresa é encerrado. */
export function RemoveClientAccessDialog({
  open,
  personName,
  clienteName,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  personName: string;
  clienteName: string;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível remover o acesso.");
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !busy && onCancel()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Remover o acesso de {personName}?</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-text-secondary">
          Ela deixará de acessar o portal da {clienteName}. A conta pessoal e o histórico de ações
          serão preservados.
        </p>
        {error && (
          <p role="alert" className="mt-2 text-xs text-destructive">
            {error}
          </p>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>
            Cancelar
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={busy}
            onClick={() => void handleConfirm()}
          >
            {busy ? "Removendo…" : "Remover acesso"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
