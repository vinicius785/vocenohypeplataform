import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import type { ReactNode } from "react";
import { TYPOGRAPHY } from "@/lib/design-tokens";
import { cn } from "@/lib/utils";

export type NpsChoiceOption = { value: string; label: string };

/**
 * Único controle de escolha do NPS mensal — usado pelas 4 perguntas
 * (0-10, satisfação 1-5, qualidade, atendimento). Base: o primitivo Radix
 * `RadioGroup` (mesmo de `src/components/ui/radio-group.tsx`), com o visual
 * de "opção selecionável" do Portal do Time → Início (`bg-brand-subtle
 * text-brand` selecionado, `hover:bg-muted`). Só o CONTEÚDO das opções muda
 * entre perguntas; altura, radius, borda, padding, tipografia e estados são
 * sempre os mesmos. As colunas = nº de opções (11 ou 5), sempre numa linha
 * só (`minmax(0,1fr)` — nunca quebra, nunca alarga).
 */
export function NpsChoiceRow({
  options,
  value,
  onChange,
  disabled,
  ariaLabel,
  legend,
}: {
  options: readonly NpsChoiceOption[];
  value: string | null;
  onChange: (value: string) => void;
  disabled?: boolean;
  ariaLabel: string;
  /** Rótulos discretos dos extremos (ex. "Nada provável" / "Extremamente provável"). */
  legend?: [string, string];
}) {
  return (
    <div className="space-y-2">
      <RadioGroupPrimitive.Root
        value={value ?? ""}
        onValueChange={onChange}
        disabled={disabled}
        aria-label={ariaLabel}
        className="grid gap-1 sm:gap-1.5"
        style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
      >
        {options.map((o) => (
          <RadioGroupPrimitive.Item
            key={o.value}
            value={o.value}
            className={cn(
              "flex h-10 w-full min-w-0 items-center justify-center rounded-md border px-0.5 text-[11px] font-medium tabular-nums leading-tight transition-colors min-[400px]:text-xs sm:text-sm",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
              "border-border bg-background text-foreground hover:bg-muted",
              "data-[state=checked]:border-brand data-[state=checked]:bg-brand-subtle data-[state=checked]:text-brand data-[state=checked]:hover:bg-brand-subtle",
            )}
          >
            <span className="line-clamp-2 break-words text-center">{o.label}</span>
          </RadioGroupPrimitive.Item>
        ))}
      </RadioGroupPrimitive.Root>
      {/* Linha de legenda sempre presente (mesma altura em toda etapa). */}
      <div className={cn("flex min-h-4 justify-between gap-4", TYPOGRAPHY.caption)}>
        <span>{legend?.[0]}</span>
        <span className="text-right">{legend?.[1]}</span>
      </div>
    </div>
  );
}

/**
 * Corpo de UMA pergunta: título + controle de resposta + (opcional) área
 * secundária. Mesma estrutura/espaçamento em todas as etapas.
 */
export function NpsQuestionStep({
  question,
  children,
  secondary,
}: {
  question: string;
  children: ReactNode;
  secondary?: ReactNode;
}) {
  return (
    <div className="space-y-4">
      <p className={cn("min-h-12", TYPOGRAPHY.cardTitle)}>{question}</p>
      {children}
      {secondary}
    </div>
  );
}
