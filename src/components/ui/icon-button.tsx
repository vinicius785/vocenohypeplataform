import * as React from "react";

import { cn } from "@/lib/utils";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

/** Botão só-de-ícone canônico (Etapa 2) — força um nome acessível (via
 * `label`, nunca opcional) e mostra esse mesmo texto como tooltip, pra
 * nunca virar um botão sem nome pra leitor de tela nem sem explicação
 * visual pra quem usa mouse. Não substitui nenhum botão-ícone hand-rolled
 * existente ainda — é só o componente novo. */
const ICON_BUTTON_TONE: Record<"neutral" | "brand" | "destructive", ButtonProps["variant"]> = {
  neutral: "ghost",
  brand: "primary",
  destructive: "destructive",
};

export const IconButton = React.forwardRef<
  HTMLButtonElement,
  Omit<ButtonProps, "variant" | "size"> & {
    label: string;
    tone?: "neutral" | "brand" | "destructive";
  }
>(({ label, tone = "neutral", className, children, ...props }, ref) => (
  <TooltipProvider delayDuration={300}>
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          ref={ref}
          type="button"
          variant={ICON_BUTTON_TONE[tone]}
          size="icon"
          aria-label={label}
          className={cn(
            tone === "neutral" && "text-muted-foreground hover:text-foreground",
            className,
          )}
          {...props}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  </TooltipProvider>
));
IconButton.displayName = "IconButton";
