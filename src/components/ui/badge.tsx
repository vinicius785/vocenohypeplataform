import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      // `size` novo (rodada corretiva) — aditivo, nenhum consumidor atual
      // passa essa prop, então continua `text-xs` (12px) em todo lugar.
      size: {
        default: "",
        lg: "px-3 py-1 text-[13px]",
      },
      variant: {
        default: "border-transparent bg-foreground text-background shadow hover:bg-foreground/80",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive:
          "border-transparent bg-destructive text-destructive-foreground shadow hover:bg-destructive/80",
        outline: "text-foreground",
        // Variantes novas (Etapa 2) — tom sempre "suave" (fundo claro +
        // texto colorido, nunca sólido), pra nunca competir visualmente
        // com o botão/ação principal da tela. `brand` nunca deve
        // substituir `default`/`primary` em botão/link/foco — é só pra
        // indicar destaque de marca num badge/chip.
        brand: "border-transparent bg-brand-subtle text-brand",
        success: "border-transparent bg-success-soft text-success-soft-foreground",
        warning: "border-transparent bg-warning-soft text-warning-soft-foreground",
        danger: "border-transparent bg-danger-soft text-danger-soft-foreground",
        info: "border-transparent bg-info-soft text-info-soft-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, size, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant, size }), className)} {...props} />;
}

export { Badge, badgeVariants };
