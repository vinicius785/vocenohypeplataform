import { useState, type ReactNode } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

/** Botão "Ver mais (N)" no rodapé da coluna; abre o Sheet padrão do app com
 * TODOS os cards da coluna (a coluna do board continua compacta). */
export function KanbanVerMais({
  hiddenCount,
  title,
  total,
  children,
}: {
  hiddenCount: number;
  title: string;
  total: number;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  if (hiddenCount <= 0) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full rounded-md px-2 py-1.5 text-center text-xs font-medium text-text-secondary hover:bg-card hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Ver mais ({hiddenCount})
      </button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-[440px]">
          <SheetHeader className="border-b border-border px-5 py-4 text-left">
            <SheetTitle>{title}</SheetTitle>
            <SheetDescription>
              {total} {total === 1 ? "item" : "itens"}
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 space-y-2.5 overflow-y-auto p-4">
            {children(() => setOpen(false))}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
