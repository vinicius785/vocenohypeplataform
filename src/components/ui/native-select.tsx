import * as React from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Select CANÔNICO da plataforma (decisão P1): um `<select>` nativo com o
 * visual do `Input` (`h-9`, `rounded-md`, borda `input`, `text-sm`) e uma seta
 * própria. Nativo de propósito: melhor seletor no mobile, acessível por
 * padrão e sem sentinela para a opção vazia ("Todos" = `value=""`).
 * O `Select` do Radix (`ui/select`) deixa de ser o padrão e sai da
 * plataforma na migração global.
 *
 * `className` vai no contêiner (largura, margem); o `<select>` ocupa 100%.
 */
export type NativeSelectProps = Omit<React.ComponentProps<"select">, "className" | "size"> & {
  className?: string;
  /** Classes extras do `<select>` em si, se algum caso realmente precisar. */
  selectClassName?: string;
  /** `sm`: compacto (24px, 11px) para seletores embutidos em rótulos/KPIs. */
  size?: "default" | "sm";
};

const NativeSelect = React.forwardRef<HTMLSelectElement, NativeSelectProps>(
  ({ className, selectClassName, size = "default", children, disabled, ...props }, ref) => (
    <div className={cn("relative", size === "sm" ? "w-auto" : "w-full", className)}>
      <select
        ref={ref}
        disabled={disabled}
        className={cn(
          "w-full cursor-pointer appearance-none rounded-md border border-input bg-transparent text-foreground shadow-sm [color-scheme:inherit] [&>option]:bg-popover [&>option]:text-popover-foreground [&>optgroup]:bg-popover [&>optgroup]:text-popover-foreground transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
          size === "sm" ? "h-6 pl-1.5 pr-5 text-[11px]" : "h-9 pl-3 pr-8 text-sm",
          selectClassName,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        className={cn(
          "pointer-events-none absolute top-1/2 -translate-y-1/2 text-muted-foreground",
          size === "sm" ? "right-1.5 h-3 w-3" : "right-2.5 h-4 w-4",
        )}
        aria-hidden="true"
      />
    </div>
  ),
);
NativeSelect.displayName = "NativeSelect";

export { NativeSelect };
