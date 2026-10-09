import * as React from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

/**
 * Painel que abre ao tocar num botão: POPOVER no desktop, FOLHA INFERIOR (bottom sheet) no mobile.
 * Um popover de 288px ancorado num botão do topo vira um balão apertado e cortado numa tela estreita;
 * a folha usa a largura toda, rola por dentro e respeita a safe area. Usado por Filtros, Ordenar e
 * Período, para todos os módulos terem o MESMO comportamento — nada de mecanismo por tela.
 *
 * `children` pode ser uma função que recebe `close` (ex.: lista de opções que fecha ao escolher).
 */
export function ResponsivePopover({
  trigger,
  title,
  children,
  align = "start",
  contentClassName,
  open: openProp,
  onOpenChange,
}: {
  trigger: React.ReactElement<{ onClick?: React.MouseEventHandler }>;
  title: string;
  children: React.ReactNode | ((close: () => void) => React.ReactNode);
  align?: "start" | "center" | "end";
  /** Largura/altura do popover no desktop (na folha mobile é sempre a largura toda). */
  contentClassName?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const isMobile = useIsMobile();
  const [openState, setOpenState] = React.useState(false);
  const open = openProp ?? openState;
  const setOpen = (v: boolean) => {
    setOpenState(v);
    onOpenChange?.(v);
  };
  const close = () => setOpen(false);
  const body = typeof children === "function" ? children(close) : children;

  if (isMobile) {
    return (
      <>
        {React.cloneElement(trigger, {
          onClick: (e: React.MouseEvent) => {
            trigger.props.onClick?.(e as never);
            setOpen(true);
          },
        })}
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent
            side="bottom"
            className="max-h-[85dvh] gap-0 rounded-t-2xl p-0 pb-[env(safe-area-inset-bottom)]"
          >
            <SheetHeader className="px-4 pb-2 pt-4 text-left">
              <SheetTitle className="text-base">{title}</SheetTitle>
              <SheetDescription className="sr-only">{title}</SheetDescription>
            </SheetHeader>
            <div className="max-h-[calc(85dvh-4rem)] space-y-3 overflow-y-auto px-4 pb-4">
              {body}
            </div>
          </SheetContent>
        </Sheet>
      </>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align={align} className={cn(contentClassName)}>
        {body}
      </PopoverContent>
    </Popover>
  );
}
