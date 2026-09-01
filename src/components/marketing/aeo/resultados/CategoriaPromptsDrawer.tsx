import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AEO_CATEGORIA_LABEL, type AeoCategoria, type AeoPrompt } from "@/lib/aeo-store";

export function CategoriaPromptsDrawer({
  categoria,
  prompts,
  onClose,
}: {
  categoria: AeoCategoria | null;
  prompts: AeoPrompt[];
  onClose: () => void;
}) {
  return (
    <Dialog open={!!categoria} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {categoria ? `${categoria} — ${AEO_CATEGORIA_LABEL[categoria]}` : ""}
          </DialogTitle>
        </DialogHeader>
        <ul className="max-h-80 space-y-1.5 overflow-y-auto text-xs">
          {prompts.length === 0 && (
            <li className="text-muted-foreground">Nenhum prompt respondido nesta categoria.</li>
          )}
          {prompts.map((p) => (
            <li key={p.id} className="flex items-center gap-2 border-b border-border py-1.5">
              <span className="shrink-0 font-medium text-foreground">{p.idCodigo}</span>
              <span className="truncate text-muted-foreground">{p.texto}</span>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
