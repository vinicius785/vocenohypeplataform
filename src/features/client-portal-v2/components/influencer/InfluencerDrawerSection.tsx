import type { ReactNode } from "react";

/** Mesma primitiva de seção da página da campanha (`CampaignSection`),
 * só que sem o padding lateral do `PageContainer` — o drawer já tem seu
 * próprio padding. Reaproveitado em vez de duplicado teria acoplado o
 * drawer ao layout da página; esta versão local é intencionalmente
 * separada. */
export function InfluencerDrawerSection({
  icon,
  title,
  description,
  action,
  children,
}: {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground" aria-hidden="true">
            {icon}
          </span>
          <div>
            <p className="text-sm font-semibold text-foreground">{title}</p>
            {description && <p className="text-xs text-text-secondary">{description}</p>}
          </div>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
