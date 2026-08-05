import type { ReactNode } from "react";

export type SectionKpi = {
  label: string;
  value: number | string;
  tone?: string; // tailwind color classes
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
        <div className="mt-5 flex flex-wrap gap-x-6 gap-y-3">
          {kpis.map((k, i) => (
            <div
              key={k.label}
              className={`flex items-baseline gap-2 ${i > 0 ? "border-l border-border pl-6" : ""}`}
            >
              <span className="text-xl font-semibold tabular-nums text-foreground">{k.value}</span>
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                {k.label}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
