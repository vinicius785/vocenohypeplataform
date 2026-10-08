import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Seção plana da Central do Cliente: divisor no topo + título, sem moldura de card. A hierarquia vem
 * de tipografia, divisor e espaçamento (mesmo vocabulário da Início). Título em `<p role="heading">`
 * porque o CSS global deixa h1–h4 com peso 300.
 */
export function ClienteSection({
  id,
  title,
  count,
  action,
  children,
  className,
}: {
  id?: string;
  title: string;
  count?: number | null;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section id={id} aria-label={title} className={cn("border-t border-border/60 pt-6", className)}>
      <div className="mb-3 flex min-h-8 items-center justify-between gap-3">
        <p
          role="heading"
          aria-level={2}
          className="flex items-baseline gap-2 text-[15px] font-semibold text-foreground"
        >
          {title}
          {count != null && (
            <span className="text-sm font-normal tabular-nums text-text-secondary">{count}</span>
          )}
        </p>
        {action}
      </div>
      {children}
    </section>
  );
}
