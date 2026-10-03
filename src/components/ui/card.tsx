import * as React from "react";

import { cn } from "@/lib/utils";
import { SURFACE, TYPOGRAPHY } from "@/lib/design-tokens";

/**
 * Card CANÔNICO (Design System §7/§8.2) — superfície `card` + borda `/60`
 * (escuro: fundo mais escuro, sem borda), `rounded-2xl`, SEM sombra e sem
 * canvas por trás. É a única fonte: o card do Início, do portal e dos demais
 * módulos convergem para este componente.
 *
 * Variantes (nenhuma de elevação): `default`, `interactive` (a superfície
 * inteira é clicável; preferir interação nas linhas), `selected` (destaque de
 * item: borda `brand/30` + `brand-subtle`) e `muted` (bloco recuado).
 */
const CARD_VARIANT_CLASS = {
  default: `${SURFACE.raised} text-card-foreground`,
  interactive: `${SURFACE.raised} cursor-pointer text-card-foreground transition-colors hover:bg-muted/40`,
  selected:
    "border border-brand/30 bg-brand-subtle text-card-foreground dark:border-brand/30 dark:bg-brand-subtle",
  muted: "border border-transparent bg-muted text-foreground",
} as const;

export type CardVariant = keyof typeof CARD_VARIANT_CLASS;

const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { variant?: CardVariant }
>(({ className, variant = "default", ...props }, ref) => (
  <div ref={ref} className={cn("rounded-2xl", CARD_VARIANT_CLASS[variant], className)} {...props} />
));
Card.displayName = "Card";

/**
 * Cabeçalho de card. Forma canônica: `icon` + `title` (+ `action` que pode
 * quebrar de linha) com `px-4 py-3.5 md:px-5`. Sem `icon`/`title`, vira um
 * contêiner livre (`children`), como no shadcn.
 */
type CardHeaderProps = Omit<React.HTMLAttributes<HTMLDivElement>, "title"> & {
  icon?: React.ReactNode;
  title?: React.ReactNode;
  action?: React.ReactNode;
};

const CardHeader = React.forwardRef<HTMLDivElement, CardHeaderProps>(
  ({ className, icon, title, action, children, ...props }, ref) => {
    if (title === undefined) {
      return (
        <div
          ref={ref}
          className={cn("flex flex-col space-y-1.5 px-4 py-3.5 md:px-5", className)}
          {...props}
        >
          {children}
        </div>
      );
    }
    return (
      <div
        ref={ref}
        className={cn(
          "flex flex-wrap items-center justify-between gap-2 px-4 py-3.5 md:px-5",
          className,
        )}
        {...props}
      >
        <div className="flex min-w-0 items-center gap-2 text-foreground">
          {icon && (
            <span className="text-muted-foreground" aria-hidden="true">
              {icon}
            </span>
          )}
          <p className={TYPOGRAPHY.cardTitle}>{title}</p>
        </div>
        {action}
      </div>
    );
  },
);
CardHeader.displayName = "CardHeader";

const CardTitle = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn(TYPOGRAPHY.cardTitle, "tracking-tight", className)} {...props} />
  ),
);
CardTitle.displayName = "CardTitle";

const CardDescription = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("text-sm text-text-secondary", className)} {...props} />
  ),
);
CardDescription.displayName = "CardDescription";

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("px-4 pb-4 md:px-5", className)} {...props} />
  ),
);
CardContent.displayName = "CardContent";

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("flex items-center border-t border-border/60 px-4 py-3 md:px-5", className)}
      {...props}
    />
  ),
);
CardFooter.displayName = "CardFooter";

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent };
