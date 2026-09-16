import type { ReactNode } from "react";
import { SURFACE } from "@/lib/design-tokens";

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}

export type HeaderIndicator = {
  label: string;
  value: string;
  tone?: "neutral" | "warning";
  onClick?: () => void;
};

/**
 * Cabeçalho com faixa de indicadores embutida — extrai o mesmo padrão
 * (não uma aproximação) já usado pela aba Início interna
 * (`InicioDashboard.tsx`, saudação + faixa de indicadores dentro do
 * mesmo cartão, `rounded-2xl` + `SURFACE.raised`, faixa em
 * `grid grid-cols-2 divide-x divide-y divide-border/60 border-t
 * border-border/60 md:grid-cols-4 md:divide-y-0`). Fica em `shared/`
 * porque é genérico o bastante pra a própria Início adotar no futuro —
 * esta correção não mexe em `InicioDashboard.tsx` (instrução explícita
 * de não alterá-la visualmente), então por ora só o portal usa este
 * componente.
 *
 * Sem efeito de clima (específico do produto interno) — o portal usa só
 * a superfície plana, sem inventar um novo efeito decorativo.
 */
export function HomeHeaderShell({
  avatar,
  greetingName,
  title,
  subtitle,
  rightSlot,
  indicators,
}: {
  avatar?: ReactNode;
  /** Saudação variável por hora do dia ("Bom dia, {nome}") — usar na
   * página inicial, onde faz sentido cumprimentar. */
  greetingName?: string;
  /** Título direto, sem saudação — usar em páginas de entidade (ex.:
   * nome da campanha), onde "Bom dia, {campanha}" soaria estranho. */
  title?: string;
  subtitle?: ReactNode;
  rightSlot?: ReactNode;
  indicators?: HeaderIndicator[];
}) {
  return (
    <header className={`overflow-hidden rounded-2xl ${SURFACE.raised}`}>
      <div className="flex flex-wrap items-center justify-between gap-4 p-5 md:p-6">
        <div className="flex min-w-0 items-center gap-3">
          {avatar}
          <div className="min-w-0">
            <p className="truncate text-2xl font-semibold tracking-tight text-foreground md:text-[26px]">
              {greetingName ? `${getGreeting()}, ${greetingName}` : title}
            </p>
            {subtitle && (
              <p className="mt-0.5 truncate text-sm text-muted-foreground">{subtitle}</p>
            )}
          </div>
        </div>
        {rightSlot && <div className="shrink-0">{rightSlot}</div>}
      </div>

      {indicators && indicators.length > 0 && (
        <div className="grid grid-cols-2 divide-x divide-y divide-border/60 border-t border-border/60 md:grid-cols-4 md:divide-y-0">
          {indicators.map((ind) => {
            const Comp = ind.onClick ? "button" : "div";
            return (
              <Comp
                key={ind.label}
                type={ind.onClick ? "button" : undefined}
                onClick={ind.onClick}
                className={`flex flex-col gap-0.5 p-4 text-left transition-colors ${
                  ind.onClick ? "hover:bg-muted/40" : ""
                }`}
              >
                <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {ind.label}
                </span>
                <span
                  className={`text-xl font-semibold tabular-nums md:text-2xl ${
                    ind.tone === "warning"
                      ? "text-amber-600 dark:text-amber-400"
                      : "text-foreground"
                  }`}
                >
                  {ind.value}
                </span>
              </Comp>
            );
          })}
        </div>
      )}
    </header>
  );
}
