import { useBlocker } from "@tanstack/react-router";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/**
 * Bloqueia navegação (troca de seção, botão voltar) E fechar/recarregar a
 * aba enquanto `when` for true — usado pelo formulário de Perfil. Nunca
 * aparece quando nada foi alterado (`when=false` desativa o blocker
 * inteiro via `disabled`).
 */
export function UnsavedChangesGuard({ when }: { when: boolean }) {
  const { status, proceed, reset } = useBlocker({
    shouldBlockFn: () => when,
    enableBeforeUnload: when,
    disabled: !when,
    withResolver: true,
  });

  return (
    <Dialog open={status === "blocked"} onOpenChange={(next) => !next && reset?.()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Descartar alterações?</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-text-secondary">
          As mudanças feitas no perfil ainda não foram salvas.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => reset?.()}>
            Continuar editando
          </Button>
          <Button type="button" variant="destructive" onClick={() => proceed?.()}>
            Descartar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
