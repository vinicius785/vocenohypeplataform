import type { ReactNode } from "react";

/**
 * Cabeçalho da Início da V2 — MESMA estrutura visual do cabeçalho da
 * Início do time (`InicioDashboard.tsx`: avatar+saudação+data à
 * esquerda, indicadores embutidos numa faixa inferior dentro do próprio
 * cabeçalho, `rounded-2xl`/`overflow-hidden`). Diferença deliberada: sem
 * `WeatherHeaderEffect` (acoplado à lógica de clima do time, fora do
 * escopo do portal do cliente) — o fundo escuro com profundidade vem de
 * um gradiente simples e neutro, próprio da V2.
 */
export function ClientHomeHeader({
  name,
  greeting,
  dateLabel,
  companyName,
  stats,
}: {
  name: string;
  greeting: string;
  dateLabel: string;
  companyName: string;
  stats: ReactNode;
}) {
  const initial = (name || "?").slice(0, 1).toUpperCase();

  return (
    <header className="relative overflow-hidden rounded-2xl">
      <div className="pointer-events-none absolute inset-0 bg-card" aria-hidden="true">
        <div
          className="absolute inset-0 opacity-[0.16]"
          style={{
            background:
              "radial-gradient(ellipse 120% 100% at 0% 0%, var(--brand), transparent 60%)",
          }}
        />
      </div>

      <div className="relative z-10 flex flex-col">
        <div className="flex flex-1 flex-wrap items-center justify-between gap-4 p-5 sm:min-h-[150px] md:min-h-[170px] md:p-7">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-foreground text-xl font-semibold text-background md:h-16 md:w-16">
              {initial}
            </div>
            <div>
              <p className="text-2xl font-semibold tracking-tight text-foreground md:text-[26px]">
                {greeting}
                {name ? `, ${name}` : ""}
              </p>
              <p className="mt-0.5 text-sm text-muted-foreground">{dateLabel}</p>
            </div>
          </div>

          <div className="text-right">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Empresa
            </p>
            <p className="mt-0.5 text-base font-semibold text-foreground">{companyName}</p>
          </div>
        </div>

        <div className="relative z-10 grid grid-cols-2 divide-x divide-y divide-border/60 border-t border-border/60 bg-background/90 md:grid-cols-4 md:divide-y-0">
          {stats}
        </div>
      </div>
    </header>
  );
}

export function HeaderStatCell({
  label,
  value,
  tone = "default",
  active = false,
  onClick,
}: {
  label: string;
  value: number;
  tone?: "default" | "danger";
  active?: boolean;
  onClick?: () => void;
}) {
  const isZero = value === 0;
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={`flex flex-col items-center justify-center gap-0.5 px-3 py-3.5 text-center transition-colors ${
        onClick
          ? "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
          : ""
      } ${active ? "bg-brand/10" : onClick ? "hover:bg-muted/50" : ""}`}
    >
      <span
        className={`text-xl font-semibold tabular-nums md:text-2xl ${
          isZero
            ? "text-muted-foreground/50"
            : tone === "danger" && value > 0
              ? "text-danger"
              : active
                ? "text-brand"
                : "text-foreground"
        }`}
      >
        {value}
      </span>
      <span className="whitespace-nowrap text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
    </Comp>
  );
}
