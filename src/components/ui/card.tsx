import * as React from "react";

import { cn } from "@/lib/utils";

/** `variant` é aditivo (Etapa 2) — omitir a prop continua rendendo
 * exatamente a mesma classe de sempre (`default`), então nenhum dos
 * consumidores atuais muda visualmente. */
const CARD_VARIANT_CLASS = {
  default: "border bg-card text-card-foreground shadow",
  interactive:
    "border bg-card text-card-foreground shadow cursor-pointer transition-colors hover:border-foreground/20",
  elevated: "border bg-card text-card-foreground shadow-md",
  selected: "border-2 border-brand bg-card text-card-foreground shadow",
  muted: "border border-transparent bg-muted text-foreground shadow-none",
} as const;

export type CardVariant = keyof typeof CARD_VARIANT_CLASS;

const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { variant?: CardVariant }
>(({ className, variant = "default", ...props }, ref) => (
  <div ref={ref} className={cn("rounded-xl", CARD_VARIANT_CLASS[variant], className)} {...props} />
));
Card.displayName = "Card";

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex flex-col space-y-1.5 p-6", className)} {...props} />
  ),
);
CardHeader.displayName = "CardHeader";

const CardTitle = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("font-semibold leading-none tracking-tight", className)}
      {...props}
    />
  ),
);
CardTitle.displayName = "CardTitle";

const CardDescription = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
  ),
);
CardDescription.displayName = "CardDescription";

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />
  ),
);
CardContent.displayName = "CardContent";

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex items-center p-6 pt-0", className)} {...props} />
  ),
);
CardFooter.displayName = "CardFooter";

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent };
