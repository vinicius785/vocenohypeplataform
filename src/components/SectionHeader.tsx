import type { ReactNode } from "react";

export type SectionKpi = {
  label: string;
  value: number | string;
  tone?: string; // tailwind color classes
  /** Opcional — quando presente, o tile vira clicável (ex. aplicar um
   * filtro correspondente). Sem mudança pra quem já usa `kpis` sem isso. */
  onClick?: () => void;
};

export function SectionHeader({
  title,
  subtitle,
  kpis,
  action,
}: {
  title: string;
  subtitle?: string;
  kpis?: SectionKpi[];
  action?: ReactNode;
}) {
  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        {action}
      </div>

      {kpis && kpis.length > 0 && (
        <div className="mt-5 flex gap-x-6 overflow-x-auto whitespace-nowrap pb-1">
          {kpis.map((k, i) => {
            const content = (
              <>
                <span
                  className={`text-xl font-semibold tabular-nums ${k.tone ?? "text-foreground"}`}
                >
                  {k.value}
                </span>
                <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  {k.label}
                </span>
              </>
            );
            const className = `flex shrink-0 items-baseline gap-2 ${i > 0 ? "border-l border-border pl-6" : ""}`;
            return k.onClick ? (
              <button
                key={k.label}
                type="button"
                onClick={k.onClick}
                className={`${className} rounded-sm transition-opacity hover:opacity-70`}
              >
                {content}
              </button>
            ) : (
              <div key={k.label} className={className}>
                {content}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
