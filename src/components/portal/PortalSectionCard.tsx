import type { ReactNode } from "react";
import { SURFACE, TYPOGRAPHY } from "@/lib/design-tokens";

/**
 * Card de seção do portal — réplica exata do padrão real usado pela aba
 * Início interna (`InicioDashboard.tsx`'s funções locais `Card`/
 * `CardHeader`, não exportadas): `rounded-2xl` + `SURFACE.raised` +
 * cabeçalho ícone+título+ação. Extraído aqui como componente
 * compartilhado — a Início interna continua com sua implementação local
 * intocada (correção visual/estrutural não mexe em `InicioDashboard.tsx`),
 * mas os tokens citados são exatamente os mesmos (`SURFACE.raised`,
 * `TYPOGRAPHY.cardTitle`), não uma aproximação com CSS solto.
 */
export function PortalSectionCard({
  icon,
  title,
  action,
  children,
  id,
}: {
  icon?: ReactNode;
  title: string;
  action?: ReactNode;
  children: ReactNode;
  id?: string;
}) {
  return (
    <div id={id} className={`overflow-hidden rounded-2xl ${SURFACE.raised} scroll-mt-20`}>
      <div className="flex items-center gap-2 border-b border-border/60 px-5 py-4">
        {icon && <span className="text-muted-foreground">{icon}</span>}
        <p className={TYPOGRAPHY.cardTitle}>{title}</p>
        {action && <div className="ml-auto">{action}</div>}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}
