import { useLayoutEffect, useRef, type ComponentProps } from "react";
import { Input } from "@/components/ui/input";
import { applyNumberEdit, digitsOnly, formatThousandsBR } from "@/lib/number-input";

/** Input numérico inteiro com milhar pt-BR em tempo real. `value` é o valor BRUTO (só dígitos) e
 * `onValueChange` devolve o bruto; o texto mostrado é sempre o formatado ("211.111"). É o mesmo
 * `Input` do Design System, só com a edição controlada (caret preservado, colar limpa o texto). */
export function NumberInput({
  value,
  onValueChange,
  ...props
}: Omit<ComponentProps<typeof Input>, "value" | "onChange" | "type"> & {
  value: string;
  onValueChange: (digits: string) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const pendingCaret = useRef<number | null>(null);
  const display = formatThousandsBR(digitsOnly(value));

  useLayoutEffect(() => {
    if (pendingCaret.current !== null && ref.current === document.activeElement) {
      ref.current?.setSelectionRange(pendingCaret.current, pendingCaret.current);
    }
    pendingCaret.current = null;
  });

  return (
    <Input
      {...props}
      ref={ref}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      value={display}
      onChange={(e) => {
        const r = applyNumberEdit(e.target.value, e.target.selectionStart);
        pendingCaret.current = r.caret;
        onValueChange(r.digits);
        // Se o valor bruto não mudou (ex.: digitou uma letra), o React não re-renderiza:
        // devolve o texto formatado e o cursor na hora.
        if (r.display !== e.target.value || r.digits === digitsOnly(value)) {
          e.target.value = r.display;
          e.target.setSelectionRange(r.caret, r.caret);
        }
      }}
    />
  );
}
