import type { ReactNode } from "react";

export type SectionKpi = {
  label: string;
  value: number | string;
  tone?: string; // tailwind color classes
  /** Opcional — quando presente, o tile vira clicável (ex. aplicar um
   * filtro correspondente). Sem mudança pra quem já usa `kpis` sem isso. */
  onClick?: () => void;
};

export type SectionTab = { key: string; label: string; active: boolean; onClick: () => void };

export function SectionHeader({
  title,
  subtitle,
  tabs,
  kpis,
  action,
}: {
  title: string;
  subtitle?: string;
  /** Sub-abas dentro da seção (ex. Objetivos/Indicadores em Metas) —
   * opcional, não usado pela maioria das seções. */
  tabs?: SectionTab[];
  kpis?: SectionKpi[];
  action?: ReactNode;
}) {
  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
          {tabs && tabs.length > 0 && (
            <div className="mt-3 inline-flex items-center gap-0.5 rounded-md border border-border p-0.5 text-xs">
              {tabs.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={t.onClick}
                  className={`rounded px-2.5 py-1 font-medium ${
                    t.active
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}
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
