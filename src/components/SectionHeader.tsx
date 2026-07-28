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
        <div className="mt-6 flex flex-wrap gap-3">
          {kpis.map((k) => (
            <div
              key={k.label}
              className="min-w-[160px] flex-1 rounded-lg border border-border bg-card p-4"
            >
              <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                {k.label}
              </div>
              <div className={`mt-2 text-3xl font-semibold ${k.tone ?? "text-foreground"}`}>
                {k.value}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
