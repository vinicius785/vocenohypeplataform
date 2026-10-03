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
export type NativeSelectProps = Omit<React.ComponentProps<"select">, "className"> & {
  className?: string;
  /** Classes extras do `<select>` em si, se algum caso realmente precisar. */
  selectClassName?: string;
};

const NativeSelect = React.forwardRef<HTMLSelectElement, NativeSelectProps>(
  ({ className, selectClassName, children, disabled, ...props }, ref) => (
    <div className={cn("relative w-full", className)}>
      <select
        ref={ref}
        disabled={disabled}
        className={cn(
          "h-9 w-full cursor-pointer appearance-none rounded-md border border-input bg-transparent pl-3 pr-8 text-sm text-foreground shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
          selectClassName,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
    </div>
  ),
);
NativeSelect.displayName = "NativeSelect";

export { NativeSelect };
