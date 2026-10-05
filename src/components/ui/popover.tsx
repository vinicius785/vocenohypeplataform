import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";

import { cn } from "@/lib/utils";

const Popover = PopoverPrimitive.Root;

const PopoverTrigger = PopoverPrimitive.Trigger;

const PopoverAnchor = PopoverPrimitive.Anchor;

const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(
  (
    {
      className,
      align = "center",
      sideOffset = 4,
      collisionPadding = 12,
      onWheel,
      onTouchMove,
      ...props
    },
    ref,
  ) => (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        ref={ref}
        align={align}
        sideOffset={sideOffset}
        // Padrão para TODO popover: nunca encosta na borda da viewport
        // (flip/shift do Radix respeitam esse respiro).
        collisionPadding={collisionPadding}
        className={cn(
          // `max-h` = espaço realmente disponível na viewport (variável do
          // Radix, já descontando colisão): o popover nunca passa da tela e,
          // se o conteúdo for maior, ele mesmo rola por dentro
          // (`overflow-y-auto`) — nunca a página/modal atrás
          // (`overscroll-contain` impede o encadeamento do scroll).
          "z-50 max-h-(--radix-popover-content-available-height) w-72 max-w-[calc(100vw-2rem)] overflow-y-auto overscroll-contain rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 origin-(--radix-popover-content-transform-origin)",
          className,
        )}
        // Dentro de um Dialog/Sheet modal, o bloqueio de scroll (react-remove-scroll) trava a roda
        // do mouse em conteúdo renderizado em portal fora do modal. Parar a propagação aqui deixa
        // a lista do popover rolar normalmente.
        onWheel={(e) => {
          onWheel?.(e);
          e.stopPropagation();
        }}
        onTouchMove={(e) => {
          onTouchMove?.(e);
          e.stopPropagation();
        }}
        {...props}
      />
    </PopoverPrimitive.Portal>
  ),
);
PopoverContent.displayName = PopoverPrimitive.Content.displayName;

export { Popover, PopoverTrigger, PopoverContent, PopoverAnchor };
