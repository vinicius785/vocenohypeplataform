import { useMemo, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { INFLU_STATUS_LABEL, type Influ } from "@/lib/influencer-model";
import { cn } from "@/lib/utils";

/** Escolher influenciadores para sumir do Portal do Cliente (ficam só na plataforma) ou voltar a
 * aparecer. Só muda `ocultoDoCliente`; quem filtra é o servidor. */
export function PortalVisibilityDialog({
  open,
  onOpenChange,
  influs,
  onApply,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  influs: Influ[];
  onApply: (ids: string[], hide: boolean) => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...influs]
      .filter((i) => !q || i.nome.toLowerCase().includes(q))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [influs, query]);
  const sel = influs.filter((i) => selected.has(i.id));
  const toHide = sel.filter((i) => !i.ocultoDoCliente);
  const toShow = sel.filter((i) => i.ocultoDoCliente);
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const apply = (hide: boolean) => {
    onApply(
      (hide ? toHide : toShow).map((i) => i.id),
      hide,
    );
    setSelected(new Set());
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setSelected(new Set());
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-md">
        <DialogTitle className="text-base font-semibold">
          Visibilidade no portal do cliente
        </DialogTitle>
        <DialogDescription className="text-sm text-text-secondary">
          Influenciadores ocultos somem do portal do cliente e continuam na plataforma. Dá para
          mostrar de volta quando quiser.
        </DialogDescription>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar influenciador..."
          aria-label="Buscar influenciador"
          className="h-8 rounded-md border border-border bg-background px-2.5 text-xs outline-none focus:border-ring focus:ring-1 focus:ring-ring"
        />
        <ul className="max-h-72 divide-y divide-border/50 overflow-y-auto">
          {list.length === 0 && (
            <li className="py-3 text-sm text-text-secondary">Nenhum resultado.</li>
          )}
          {list.map((i) => (
            <li key={i.id}>
              <label className="flex cursor-pointer items-center gap-3 px-1 py-2 hover:bg-muted/40">
                <input
                  type="checkbox"
                  checked={selected.has(i.id)}
                  onChange={() => toggle(i.id)}
                  className="h-4 w-4 shrink-0 accent-foreground"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground">
                    {i.nome}
                  </span>
                  <span className="block truncate text-xs text-text-secondary">
                    {INFLU_STATUS_LABEL[i.status]}
                  </span>
                </span>
                <span
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1 text-[11px]",
                    i.ocultoDoCliente ? "font-medium text-foreground" : "text-text-secondary",
                  )}
                >
                  {i.ocultoDoCliente ? (
                    <>
                      <EyeOff className="h-3 w-3" /> Oculto
                    </>
                  ) : (
                    <>
                      <Eye className="h-3 w-3" /> Visível
                    </>
                  )}
                </span>
              </label>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={toShow.length === 0}
            onClick={() => apply(false)}
          >
            Mostrar no portal{toShow.length > 0 ? ` (${toShow.length})` : ""}
          </Button>
          <Button size="sm" disabled={toHide.length === 0} onClick={() => apply(true)}>
            Ocultar do portal{toHide.length > 0 ? ` (${toHide.length})` : ""}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
