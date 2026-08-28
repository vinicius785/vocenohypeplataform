import {
  forwardRef,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ComponentProps,
} from "react";
import { Input } from "./input";

function digitsOnly(s: string): string {
  return s.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
}

function numberToDigits(n: number | undefined, decimals: number): string {
  if (n == null || !isFinite(n)) return "";
  const scaled = Math.round(n * 10 ** decimals);
  return String(Math.max(0, scaled));
}

function digitsToNumber(digits: string, decimals: number): number | undefined {
  if (!digits) return undefined;
  const n = Number(digits);
  return decimals > 0 ? n / 10 ** decimals : n;
}

function formatDigits(digits: string, decimals: number): string {
  if (!digits) return "";
  const n = digitsToNumber(digits, decimals)!;
  return n.toLocaleString("pt-BR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export type FormattedNumberInputProps = Omit<
  ComponentProps<"input">,
  "value" | "onChange" | "type"
> & {
  value?: number;
  onValueChange: (value: number | undefined) => void;
  /** "currency" mantém sempre 2 casas decimais (dígitos digitados
   * "empurram" a casa decimal, mesmo padrão de app de banco — "1234"
   * vira "12,34"); "integer" só agrupa milhar, sem decimais (visualizações,
   * curtidas etc.). */
  mode?: "currency" | "integer";
};

/** Campo de número com formatação pt-BR em tempo real (separador de
 * milhar "." e, no modo "currency", decimal ",") — devolve sempre um
 * `number` puro pro estado do formulário via `onValueChange`, nunca uma
 * string formatada. Só dígitos são aceitos; o resto da máscara é
 * recalculada a cada tecla a partir do dígitos puro, então nunca
 * dessincroniza do valor real. */
export const FormattedNumberInput = forwardRef<HTMLInputElement, FormattedNumberInputProps>(
  ({ value, onValueChange, mode = "integer", ...rest }, ref) => {
    const decimals = mode === "currency" ? 2 : 0;
    const lastEmitted = useRef<number | undefined>(value);
    const [digits, setDigits] = useState(() => numberToDigits(value, decimals));

    useEffect(() => {
      // Só resincroniza quando `value` muda por fora (ex. diálogo reaberto
      // com outro registro) — nunca por causa da própria digitação, senão
      // o campo "reseta" a cada tecla.
      if (value !== lastEmitted.current) {
        setDigits(numberToDigits(value, decimals));
        lastEmitted.current = value;
      }
    }, [value, decimals]);

    const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
      const nextDigits = digitsOnly(e.target.value);
      setDigits(nextDigits);
      const next = digitsToNumber(nextDigits, decimals);
      lastEmitted.current = next;
      onValueChange(next);
    };

    return (
      <Input
        ref={ref}
        type="text"
        inputMode="numeric"
        value={formatDigits(digits, decimals)}
        onChange={handleChange}
        {...rest}
      />
    );
  },
);
FormattedNumberInput.displayName = "FormattedNumberInput";
