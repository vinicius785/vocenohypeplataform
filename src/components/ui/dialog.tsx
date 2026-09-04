"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

const Dialog = DialogPrimitive.Root;

const DialogTrigger = DialogPrimitive.Trigger;

const DialogPortal = DialogPrimitive.Portal;

const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-black/80  data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className,
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    /** Dialogs grandes (detalhe de tarefa, lançamento financeiro, reunião,
     * perfil do membro) ficavam espremidos verticalmente no mobile — uma
     * caixa centralizada pequena tentando conter um conteúdo pensado pro
     * desktop. Com `mobileFullScreen`, abaixo de `sm:` o diálogo vira uma
     * superfície cheia (`100dvh`, sem margem/cantos arredondados) — acima
     * de `sm:` continua exatamente igual a hoje (centralizado, respeitando
     * o `max-w-*` que cada consumidor já passa). Usa `max-sm:` + `!` pra
     * nunca perder essa prioridade pro `max-w-*` que o consumidor define
     * sem prefixo de breakpoint. */
    mobileFullScreen?: boolean;
  }
>(({ className, children, mobileFullScreen, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    {/* O centering por `top-50%/translate(-50%,-50%)` deixava diálogos altos
     * (ou telas curtas) com o topo negativo/fora da tela, cortados embaixo —
     * um wrapper flex que centraliza e nunca deixa passar da viewport é
     * bem mais robusto, e não depende de cada consumidor lembrar de somar
     * seu próprio max-height. */}
    <div
      className={cn(
        "fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-4",
        mobileFullScreen && "max-sm:items-stretch max-sm:p-0",
      )}
    >
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          "relative my-auto grid max-h-[calc(100vh-2rem)] w-full max-w-lg gap-4 overflow-y-auto rounded-lg border bg-background p-6 shadow-lg ring-1 ring-primary/25 duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 sm:rounded-lg",
          mobileFullScreen &&
            "max-sm:!m-0 max-sm:!h-dvh max-sm:!max-h-dvh max-sm:!w-full max-sm:!max-w-none max-sm:!rounded-none max-sm:!border-0",
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background cursor-pointer transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </div>
  </DialogPortal>
));
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col space-y-1.5 text-center sm:text-left", className)} {...props} />
);
DialogHeader.displayName = "DialogHeader";

const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", className)}
    {...props}
  />
);
DialogFooter.displayName = "DialogFooter";

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("text-lg font-semibold leading-none tracking-tight", className)}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
