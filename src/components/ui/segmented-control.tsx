import { cn } from "@/lib/utils";
import { resolveSegmentedValue } from "@/lib/component-utils";

/**
 * Alternador de VISUALIZAÇÃO do mesmo conteúdo — nunca navegação (ver
 * auditoria da Etapa 1: Reuniões "Agenda/Calendário" e Financeiro
 * "Realizado/Projetado" são os casos reais que motivam este componente).
 * Não deve parecer barra de abas: raio total (`pill`), sem sublinhado,
 * sem contagem/badge de notificação — só o toggle.
 */
export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  size = "default",
  "aria-label": ariaLabel,
}: {
  value: T;
  onChange: (value: T) => void;
  options: readonly { value: T; label: string }[];
  size?: "default" | "sm";
  "aria-label": string;
}) {
  const optionValues = options.map((o) => o.value);
  const resolved = resolveSegmentedValue(value, optionValues as T[]);

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="inline-flex rounded-full border border-border bg-muted p-0.5"
    >
      {options.map((opt) => {
        const active = opt.value === resolved;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              "cursor-pointer rounded-full font-medium transition-colors",
              size === "sm" ? "px-2.5 py-1 text-[11px]" : "px-3.5 py-1.5 text-xs",
              active
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
