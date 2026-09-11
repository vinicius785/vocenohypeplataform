import { useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { TYPOGRAPHY } from "@/lib/design-tokens";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function OverlaysSection() {
  const [formOpen, setFormOpen] = useState(false);

  return (
    <div className="space-y-10">
      <section id="modal" className="space-y-4">
        <h2 className={TYPOGRAPHY.sectionTitle}>Modal</h2>
        <p className={TYPOGRAPHY.bodySecondary}>
          Primitivo Radix (`ui/dialog.tsx`) já existente — sem alterações. `mobileFullScreen` já
          demonstrado no drawer abaixo.
        </p>
        <div className="flex flex-wrap gap-2">
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                Modal pequeno
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle>Confirmar ação</DialogTitle>
                <DialogDescription>Essa ação não pode ser desfeita.</DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="ghost" size="sm">
                  Cancelar
                </Button>
                <Button variant="destructive" size="sm">
                  Confirmar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={formOpen} onOpenChange={setFormOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                Modal de formulário
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md" mobileFullScreen>
              <DialogHeader>
                <DialogTitle>Novo item</DialogTitle>
                <DialogDescription>Conteúdo rolável quando o formulário é longo.</DialogDescription>
              </DialogHeader>
              <div className="max-h-[50vh] space-y-3 overflow-y-auto py-2">
                {["Nome", "Categoria", "Valor", "Observações"].map((label) => (
                  <label key={label} className="block space-y-1">
                    <span className={TYPOGRAPHY.label}>{label}</span>
                    <Input placeholder={label} />
                  </label>
                ))}
              </div>
              <DialogFooter>
                <Button variant="ghost" size="sm" onClick={() => setFormOpen(false)}>
                  Cancelar
                </Button>
                <Button variant="primary" size="sm" onClick={() => setFormOpen(false)}>
                  Salvar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </section>

      <section id="drawer" className="space-y-4">
        <h2 className={TYPOGRAPHY.sectionTitle}>Drawer</h2>
        <p className={TYPOGRAPHY.bodySecondary}>
          Primitivo Radix (`ui/sheet.tsx`) — no mobile (redimensione a tela), o `Dialog` com
          `mobileFullScreen` acima já vira tela cheia; o Sheet lateral abaixo já é `w-3/4` fluido
          por padrão.
        </p>
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline" size="sm">
              Abrir drawer lateral
            </Button>
          </SheetTrigger>
          <SheetContent className="flex flex-col gap-0 p-0 sm:max-w-md">
            <SheetHeader className="border-b border-border p-5 text-left">
              <SheetTitle>Detalhes</SheetTitle>
              <SheetDescription>Cabeçalho fixo, conteúdo rolável, rodapé fixo.</SheetDescription>
            </SheetHeader>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-5">
              {Array.from({ length: 12 }).map((_, i) => (
                <p key={i} className={TYPOGRAPHY.bodySecondary}>
                  Linha de conteúdo de exemplo {i + 1}.
                </p>
              ))}
            </div>
            <SheetFooter className="border-t border-border p-5">
              <Button variant="primary" size="sm">
                Salvar
              </Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>
      </section>

      <section id="tooltip-popover-dropdown" className="space-y-4">
        <h2 className={TYPOGRAPHY.sectionTitle}>Tooltip, popover e dropdown</h2>
        <div className="flex flex-wrap items-center gap-3">
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="sm">
                  Tooltip
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                Texto curto de apoio — nunca a única fonte da informação.
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm">
                Popover
              </Button>
            </PopoverTrigger>
            <PopoverContent>
              <p className={TYPOGRAPHY.cardTitle}>Título do popover</p>
              <p className={`${TYPOGRAPHY.bodySecondary} mt-1`}>
                Largura máxima já limitada a `calc(100vw-2rem)` no primitivo — nunca corta em telas
                pequenas, mesmo com texto mais longo que isso.
              </p>
            </PopoverContent>
          </Popover>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <MoreHorizontal className="h-4 w-4" /> Dropdown
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Ações</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem>Editar</DropdownMenuItem>
              <DropdownMenuItem>Duplicar</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive focus:text-destructive">
                Excluir
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <p className={TYPOGRAPHY.caption}>
          Todos navegáveis por teclado (Tab pra focar, Enter ou Espaço pra abrir, setas pra mover,
          Escape pra fechar) — comportamento do Radix, não recriado aqui.
        </p>
      </section>
    </div>
  );
}
