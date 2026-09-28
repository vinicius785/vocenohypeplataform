import type { ReactNode } from "react";

/**
 * Cabeçalho de seção padrão da página vertical da campanha — título +
 * ícone discreto + texto secundário opcional + ação no canto direito.
 * Nunca um card externo envolvendo a seção inteira: o container (quando
 * existe) é só ao redor da LISTA, não do título.
 */
export function CampaignSection({
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
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground" aria-hidden="true">
            {icon}
          </span>
          <div>
            <p className="text-[15px] font-semibold text-foreground">{title}</p>
            {description && <p className="text-xs text-text-secondary">{description}</p>}
          </div>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
